import { parsePhoneNumberFromString } from "libphonenumber-js/max";

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, x-api-key, authorization, x-admin-token",
    "access-control-max-age": "86400",
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function normalizeInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("00")) return "+" + s.slice(2);
  return s;
}

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
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function parseBool(s, fallback = false) {
  if (s === undefined || s === null) return fallback;
  const v = String(s).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function firstNonEmptyLine(text) {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length) return line;
  }
  return "";
}

function detectDelimiter(line) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const c = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

function csvParseLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function csvEscape(value, delimiter) {
  const s = String(value ?? "");
  const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
  if (!mustQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function isProbablyHeaderRow(row) {
  // Heuristic: if most cells contain non-digit letters, treat as header.
  const cells = row.filter((c) => String(c ?? "").trim().length);
  if (!cells.length) return false;
  let score = 0;
  for (const c of cells) {
    const t = String(c).trim();
    if (/[A-Za-z_]/.test(t) && !/^\+?\d[\d\s().-]*$/.test(t)) score++;
  }
  return score >= Math.ceil(cells.length * 0.6);
}

function resolvePhoneColumnIndex(header, phoneColumn) {
  const raw = String(phoneColumn ?? "").trim();
  if (!raw) return -1;

  // Allow 1-based numeric index (e.g. "1", "2"...)
  if (/^\d+$/.test(raw)) {
    const idx = Number(raw) - 1;
    return Number.isInteger(idx) && idx >= 0 ? idx : -1;
  }

  // Header name
  if (!header) return -1;
  const wanted = raw.toLowerCase();
  for (let i = 0; i < header.length; i++) {
    if (String(header[i] ?? "").trim().toLowerCase() === wanted) return i;
  }
  return -1;
}

async function loadBatchLimits(env, keyId) {
  const row = await env.DB
    .prepare("SELECT max_batch_rows, max_batch_bytes FROM api_keys WHERE id = ? LIMIT 1")
    .bind(keyId)
    .first();

  const maxRows = Number(row?.max_batch_rows ?? 5000);
  const maxBytes = Number(row?.max_batch_bytes ?? 1048576);

  return {
    maxRows: Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 5000,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 1048576,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET") {
      return json(200, {
        ok: true,
        endpoint: "/v1/batch/parse",
        method: "POST multipart/form-data",
        fields: {
          file: "CSV file (required)",
          phone_column: "Header name or 1-based index (required)",
          default_region: "ISO 3166-1 alpha-2 (optional)",
          has_header: "true/false (optional, default: auto-detect)",
          delimiter: "auto|comma|semicolon|tab|pipe (optional, default: auto)",
          mask_mode: "none|last2|last4 (optional, default: none)",
          hash_enabled: "true/false (optional, default: false)",
        },
      });
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET, POST or OPTIONS." } });
    }

    if (!env?.DB) {
      return json(500, { ok: false, error: { code: "misconfigured", message: "Missing D1 binding DB." } });
    }

    const keyId = Number(context.data?.apiKey?.id ?? 0);
    if (!keyId) {
      // Should not happen if middleware enforces API keys.
      return json(401, { ok: false, error: { code: "unauthorized", message: "Missing API key context." } });
    }

    const limits = await loadBatchLimits(env, keyId);

    const form = await request.formData();
    const file = form.get("file");
    const phoneColumn = form.get("phone_column");

    if (!(file instanceof File)) {
      return json(400, { ok: false, error: { code: "missing_file", message: "Field 'file' is required." } });
    }
    if (!phoneColumn) {
      return json(400, { ok: false, error: { code: "missing_phone_column", message: "Field 'phone_column' is required." } });
    }

    // Enforce max bytes before reading into memory.
    if (Number.isFinite(file.size) && file.size > limits.maxBytes) {
      return json(413, {
        ok: false,
        error: { code: "batch_too_large", message: `File exceeds max_batch_bytes (${limits.maxBytes}).` },
        limits,
        file_size: file.size,
      });
    }

    const defaultRegion = form.get("default_region") ? String(form.get("default_region")) : undefined;

    const hasHeaderRaw = form.get("has_header");
    const delimiterRaw = String(form.get("delimiter") ?? "auto").toLowerCase();

    const maskMode = String(form.get("mask_mode") ?? "none").toLowerCase();
    const hashEnabled = parseBool(form.get("hash_enabled"), false);

    const text = await file.text();

    // Rough row count before parsing full CSV.
    const lines = text.split(/\r?\n/);
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length > limits.maxRows + 1) {
      return json(413, {
        ok: false,
        error: { code: "batch_too_many_rows", message: `Row count exceeds max_batch_rows (${limits.maxRows}).` },
        limits,
        rows_detected: nonEmptyLines.length,
      });
    }

    const sampleLine = firstNonEmptyLine(text);
    const delimiter =
      delimiterRaw === "comma" ? "," :
      delimiterRaw === "semicolon" ? ";" :
      delimiterRaw === "tab" ? "\t" :
      delimiterRaw === "pipe" ? "|" :
      detectDelimiter(sampleLine || ",");

    // Parse all non-empty lines.
    const rows = nonEmptyLines.map((l) => csvParseLine(l, delimiter));

    let header = null;
    let startIndex = 0;

    if (hasHeaderRaw === null || hasHeaderRaw === undefined || String(hasHeaderRaw).trim() === "") {
      // Auto-detect
      if (rows.length && isProbablyHeaderRow(rows[0])) {
        header = rows[0];
        startIndex = 1;
      }
    } else if (parseBool(hasHeaderRaw, true)) {
      header = rows[0] || [];
      startIndex = 1;
    }

    const phoneIdx = resolvePhoneColumnIndex(header, phoneColumn);
    if (phoneIdx < 0) {
      return json(400, {
        ok: false,
        error: { code: "invalid_phone_column", message: "Could not resolve phone_column (name or 1-based index)." },
      });
    }

    const outCols = ["e164", "valid", "possible", "country", "type", "masked"];
    if (hashEnabled) outCols.push("hash");
    outCols.push("error");

    const out = [];

    if (header) {
      out.push([...header, ...outCols]);
    }

    let okCount = 0;
    let failCount = 0;

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      const rawPhone = row[phoneIdx] ?? "";
      const input = normalizeInput(rawPhone);

      let e164 = "";
      let country = "";
      let callingCode = "";
      let possible = false;
      let valid = false;
      let type = "";
      let masked = "";
      let hash = "";
      let err = "";

      if (!input) {
        err = "empty_phone";
      } else {
        const pn = parsePhoneNumberFromString(input, defaultRegion);
        if (!pn) {
          err = "parse_failed";
        } else {
          e164 = pn.number || "";
          country = pn.country || "";
          callingCode = pn.countryCallingCode || "";
          possible = pn.isPossible();
          valid = pn.isValid();
          type = pn.getType ? (pn.getType() || "") : "";
          masked = maskE164(e164, maskMode);

          if (hashEnabled) {
            if (!env?.HASH_SECRET) {
              hash = "";
              err = err || "hash_secret_missing";
            } else if (e164) {
              hash = "h_" + (await hmacSha256Hex(env.HASH_SECRET, e164));
            }
          }
        }
      }

      if (!err && valid) okCount++;
      if (err || !valid) failCount++;

      const extra = [
        e164,
        String(valid),
        String(possible),
        country || "",
        type || "",
        masked || "",
      ];
      if (hashEnabled) extra.push(hash || "");
      extra.push(err);

      out.push([...row, ...extra]);
    }

    // Serialize CSV
    const csv = out
      .map((r) => r.map((c) => csvEscape(c, delimiter)).join(delimiter))
      .join("\n") + "\n";

    const headers = {
      ...corsHeaders(),
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="e164-batch-result.csv"`,
      "x-batch-rows-total": String(Math.max(0, rows.length - startIndex)),
      "x-batch-rows-ok": String(okCount),
      "x-batch-rows-failed": String(failCount),
    };

    return new Response(csv, { status: 200, headers });
  } catch (err) {
    console.error("Unhandled error in /v1/batch/parse:", err);
    return json(500, { ok: false, error: { code: "internal_error", message: "Unhandled exception in batch parser." } });
  }
}
