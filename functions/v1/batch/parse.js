import { parsePhoneNumberFromString } from "libphonenumber-js/max";

function maskE164(e164, mode) {
  if (!e164 || typeof e164 !== "string") return "";
  if (!mode || mode === "none") return "";
  const keep = mode === "last2" ? 2 : mode === "last4" ? 4 : 0;
  if (keep <= 0) return "";
  const digits = e164.replace(/^\+/, "");
  if (digits.length <= keep) return e164;
  return "+" + "*".repeat(digits.length - keep) + digits.slice(-keep);
}

function toHex(buf) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

function parseFirstRow(text, delimiter) {
  const row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      return row;
    } else {
      field += c;
    }
  }

  row.push(field);
  return row;
}

function detectDelimiter(sample) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCols = 1;

  for (const d of candidates) {
    const cols = parseFirstRow(sample, d).length;
    if (cols > bestCols) {
      bestCols = cols;
      best = d;
    }
  }
  return best;
}

function parseCSV(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // Treat CR as newline (and swallow CRLF)
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (text[i + 1] === "\n") i++;
    } else {
      field += c;
    }
  }

  // Flush last field/row (avoid adding a trailing empty line)
  if (inQuotes) {
    // Unclosed quotes: still return what we parsed.
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvEscape(value, delimiter) {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter)) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

export async function onRequestPost({ request, env }) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return new Response(
      JSON.stringify({ ok: false, error: "Expected multipart/form-data" }, null, 2),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing file field" }, null, 2),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const defaultRegion = (form.get("default_region") || "").toString() || undefined;
  const phoneColumnRaw = (form.get("phone_column") || "").toString().trim();
  const hasHeader = ((form.get("has_header") || "true").toString().toLowerCase() !== "false");
  const maskMode = (form.get("mask_mode") || "none").toString();
  const hashEnabled = ((form.get("hash_enabled") || "false").toString().toLowerCase() === "true");
  const delimiterPref = (form.get("delimiter") || "auto").toString();

  // Keep V1 safe: limit input size (you can raise later).
  const text = await file.text();
  const maxBytes = 5_000_000; // ~5 MB
  if (text.length > maxBytes) {
    return new Response(
      JSON.stringify({ ok: false, error: "File too large for V1 (max ~5MB)" }, null, 2),
      { status: 413, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const sample = text.slice(0, 8192);
  const delimiter = delimiterPref === "auto" ? detectDelimiter(sample) : delimiterPref;

  const rows = parseCSV(text, delimiter);
  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Empty CSV" }, null, 2),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  let header = null;
  let startRow = 0;

  if (hasHeader) {
    header = rows[0];
    startRow = 1;
  }

  // Resolve phone column index
  let phoneIdx = -1;

  if (hasHeader && header) {
    const asInt = Number.parseInt(phoneColumnRaw, 10);
    if (!Number.isNaN(asInt) && String(asInt) === phoneColumnRaw) {
      phoneIdx = asInt;
    } else {
      phoneIdx = header.indexOf(phoneColumnRaw);
    }
  } else {
    const asInt = Number.parseInt(phoneColumnRaw, 10);
    if (!Number.isNaN(asInt)) phoneIdx = asInt;
  }

  if (phoneIdx < 0) {
    const hint = hasHeader && header
      ? { available_columns: header }
      : { hint: "Set phone_column to a 0-based index when has_header=false" };

    return new Response(
      JSON.stringify({ ok: false, error: "Could not resolve phone column", ...hint }, null, 2),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const outHeader = header
    ? [...header, "e164", "possible", "valid", "region", "type", "masked", "hash", "error"]
    : null;

  const outRows = [];
  if (outHeader) outRows.push(outHeader);

  const secret = env?.HASH_SECRET;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const raw = (row[phoneIdx] ?? "").toString();

    let e164 = "";
    let possible = "";
    let valid = "";
    let region = "";
    let type = "";
    let masked = "";
    let hash = "";
    let error = "";

    if (!raw.trim()) {
      error = "missing_phone_value";
    } else {
      const phone = parsePhoneNumberFromString(raw, defaultRegion);
      if (!phone) {
        error = "parse_failed";
      } else {
        possible = String(phone.isPossible());
        valid = String(phone.isValid());
        e164 = phone.number || "";
        region = phone.country || "";
        type = (phone.getType?.() ?? "") || "";
        masked = maskE164(e164, maskMode);

        if (hashEnabled) {
          if (!secret) {
            // Leave hash empty; client can detect this via UI note if desired.
            hash = "";
          } else if (e164) {
            hash = "h_" + (await hmacSha256Hex(secret, e164));
          }
        }
      }
    }

    const base = header ? row : row; // keep original columns
    const out = [...base, e164, possible, valid, region, type, masked, hash, error];
    outRows.push(out);
  }

  // Emit UTF-8 CSV (with BOM for Excel friendliness)
  const bom = "\ufeff";
  const csv = outRows
    .map((row) => row.map((v) => csvEscape(v, delimiter)).join(delimiter))
    .join("\n");

  return new Response(bom + csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="e164_batch_results.csv"',
      "cache-control": "no-store",
    },
  });
}
