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
  // Common international prefix used in many countries.
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

export async function onRequest({ request, env }) {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET") {
      return json(200, {
        ok: true,
        endpoint: "/v1/parse",
        method: "POST application/json",
        body: {
          input: "string (required)",
          default_region: "string (optional, e.g. IT)",
          options: {
            format: ["e164", "international", "national", "rfc3966"],
            classify: true,
            mask: { mode: "none|last2|last4" },
            hash: { enabled: false },
          },
        },
        notes: [
          "Provide x-api-key header if your middleware enforces API keys.",
          "hash requires env.HASH_SECRET and returns h_<hex>.",
        ],
      });
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET, POST or OPTIONS." } });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(400, { ok: false, error: { code: "bad_json", message: "Invalid JSON body." } });
    }

    const inputRaw = body.input;
    const defaultRegion = body.default_region ? String(body.default_region) : undefined;

    const options = body.options && typeof body.options === "object" ? body.options : {};
    const format = Array.isArray(options.format) ? options.format : ["e164", "international", "national", "rfc3966"];
    const classify = options.classify !== false;
    const maskMode = options.mask?.mode ? String(options.mask.mode) : "none";
    const hashEnabled = options.hash?.enabled === true;

    const input = normalizeInput(inputRaw);
    if (!input) {
      return json(400, { ok: false, error: { code: "missing_input", message: "Field 'input' is required." } });
    }

    const phone = parsePhoneNumberFromString(input, defaultRegion);
    if (!phone) {
      return json(422, {
        ok: false,
        error: { code: "parse_failed", message: "Could not parse phone number." },
        echo: { input: String(inputRaw ?? ""), default_region: defaultRegion ?? null },
      });
    }

    const possible = phone.isPossible();
    const valid = phone.isValid();

    const out = {
      e164: phone.number || "",
      country: phone.country || "",
      calling_code: phone.countryCallingCode || "",
      possible,
      valid,
    };

    if (classify && phone.getType) out.type = phone.getType() || "";

    if (format.includes("international")) out.international = phone.formatInternational();
    if (format.includes("national")) out.national = phone.formatNational();
    if (format.includes("rfc3966")) out.rfc3966 = phone.getURI();
    if (format.includes("e164")) out.e164 = phone.number || "";

    out.masked = maskE164(out.e164, maskMode);

    if (hashEnabled) {
      if (!env?.HASH_SECRET) {
        out.hash = "";
        out.hash_note = "HASH_SECRET not configured";
      } else if (out.e164) {
        out.hash = "h_" + (await hmacSha256Hex(env.HASH_SECRET, out.e164));
      }
    }

    return json(200, {
      ok: true,
      echo: { input: String(inputRaw ?? ""), default_region: defaultRegion ?? null },
      result: out,
    });
  } catch (err) {
    // Never throw: return JSON so we avoid Cloudflare 1101 generic error pages.
    console.error("Unhandled error in /v1/parse:", err);
    return json(500, {
      ok: false,
      error: { code: "internal_error", message: "Unhandled exception in /v1/parse." },
    });
  }
}
