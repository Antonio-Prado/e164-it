import { parsePhoneNumberFromString } from "libphonenumber-js/max";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Convenient CORS defaults (useful if the API is called from other domains later)
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
  });
}

function maskE164(e164, mode) {
  if (!e164 || typeof e164 !== "string") return null;
  if (mode === "none" || !mode) return null;

  const keep = mode === "last2" ? 2 : mode === "last4" ? 4 : 0;
  if (keep <= 0) return null;

  // e.g. e164: +393331234567
  const digits = e164.replace(/^\+/, "");
  if (digits.length <= keep) return e164;

  // Keep the "+" and mask all but the last N digits
  const maskedCore = "*".repeat(digits.length - keep) + digits.slice(-keep);
  return "+" + maskedCore;
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return json({ ok: true }, 204);
  }

  if (request.method === "GET") {
    return json({
      ok: true,
      endpoint: "/v1/parse",
      usage: "POST JSON { input, default_region?, options? }",
      options: {
        format: ["e164", "international", "national", "rfc3966"],
        classify: true,
        mask: { mode: "last4 | last2 | none" },
        hash: { enabled: true }
      },
      example: {
        input: "0039 333 123 4567",
        default_region: "IT",
        options: { mask: { mode: "last4" }, hash: { enabled: true } }
      }
    });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input : "";
  const defaultRegion = typeof body.default_region === "string" ? body.default_region : undefined;
  const options = typeof body.options === "object" && body.options ? body.options : {};

  const formatList = Array.isArray(options.format)
    ? options.format
    : ["e164", "international", "national", "rfc3966"];

  const classify = options.classify !== false; // default true
  const maskMode = options?.mask?.mode || "none";
  const hashEnabled = Boolean(options?.hash?.enabled);

  if (!input.trim()) {
    return json({ ok: false, valid: false, errors: ["Missing input"] }, 400);
  }

  const phone = parsePhoneNumberFromString(input, defaultRegion);
  if (!phone) {
    return json({
      ok: true,
      valid: false,
      possible: false,
      errors: ["Could not parse phone number with given input/default_region"],
      input,
      default_region: defaultRegion ?? null
    });
  }

  const possible = phone.isPossible();
  const valid = phone.isValid();

  const out = {
    ok: true,
    input,
    default_region: defaultRegion ?? null,
    possible,
    valid,
    e164: phone.number,
    region: phone.country ?? null,
    country_calling_code: phone.countryCallingCode,
    national_number: phone.nationalNumber,
    type: classify ? (phone.getType?.() ?? null) : null,
    formats: {},
    privacy: { masked: null, hash: null },
    warnings: [],
    errors: []
  };

  if (formatList.includes("international")) out.formats.international = phone.formatInternational();
  if (formatList.includes("national")) out.formats.national = phone.formatNational();
  if (formatList.includes("rfc3966")) out.formats.rfc3966 = phone.getURI();

  // privacy
  out.privacy.masked = maskE164(phone.number, maskMode);

  if (hashEnabled) {
    if (!env?.HASH_SECRET) {
      out.warnings.push("hash.enabled=true but HASH_SECRET is not configured in environment");
    } else {
      out.privacy.hash = "h_" + (await hmacSha256Hex(env.HASH_SECRET, phone.number));
    }
  }

  if (possible && !valid) {
    out.warnings.push("Number is possible (length) but not strictly valid");
  }

  return json(out);
}

