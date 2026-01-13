import { assertEnvSecrets, hashApiKey, findApiKeyByHash, readApiKeyFromRequest, isAdminAuthorized } from "../_lib/apiKeys.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";

function withCorsHeaders(headers = {}) {
  return {
    ...headers,
    "access-control-allow-origin": "https://e164.it",
    "access-control-allow-methods": "GET,POST,OPTIONS,PATCH,DELETE",
    "access-control-allow-headers": "content-type, x-api-key, authorization, x-admin-token",
    "access-control-max-age": "86400"
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: withCorsHeaders({ "content-type": "application/json; charset=utf-8", ...extraHeaders })
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCorsHeaders() });
  }

  // Allow unauthenticated health endpoint
  if (url.pathname === "/v1/health") {
    return context.next();
  }

  // Allow unauthenticated single-parse requests.
  if (request.method === "POST" && url.pathname === "/v1/parse") {
    return context.next();
  }

  
  // Public documentation endpoints (no API key required).
  if (request.method === "GET" && (url.pathname === "/v1/openapi.json" || url.pathname === "/v1/parse" || url.pathname === "/v1/batch/parse")) {
    return context.next();
  }

// Basic env checks (throws early if misconfigured)
  try {
    assertEnvSecrets(env);
  } catch (e) {
    return json(500, { ok: false, error: { code: "misconfigured", message: "Server misconfigured." } });
  }

  // Admin endpoints
  if (url.pathname.startsWith("/v1/admin/")) {
    if (!isAdminAuthorized(request, env)) {
      return json(401, { ok: false, error: { code: "unauthorized", message: "Missing or invalid admin token." } });
    }
    return context.next();
  }

  // API key required for all other /v1/* endpoints
  const apiKey = readApiKeyFromRequest(request, env);
  if (!apiKey) {
    return json(401, { ok: false, error: { code: "missing_api_key", message: "Provide x-api-key header." } });
  }

  const keyHash = await hashApiKey(env, apiKey);
  const record = await findApiKeyByHash(env, keyHash);

  if (!record) {
    return json(401, { ok: false, error: { code: "invalid_api_key", message: "API key not found." } });
  }
  if (!record.enabled) {
    return json(403, { ok: false, error: { code: "disabled_api_key", message: "API key is disabled." } });
  }

  // Rate limiting (per key, per minute)
  const isBatch = url.pathname.startsWith("/v1/batch/");
  const limit = isBatch ? record.rpm_batch : record.rpm_parse;

  if (!env.RL) {
    return json(500, { ok: false, error: { code: "misconfigured", message: "Missing KV binding RL." } });
  }

  const rl = await enforceRateLimit({
    kv: env.RL,
    keyPrefix: `rl:apiKey:${record.id}:${isBatch ? "batch" : "parse"}`,
    limitPerMinute: limit
  });

  if (!rl.allowed) {
    return json(429, { ok: false, error: { code: "rate_limited", message: "Too many requests." } }, rl.headers);
  }

  // Make the API key visible to handlers (optional)
  context.data.apiKey = { id: record.id, label: record.label, rpm_parse: record.rpm_parse, rpm_batch: record.rpm_batch };

  const res = await context.next();
  const out = new Response(res.body, res);
  Object.entries(withCorsHeaders(rl.headers)).forEach(([k, v]) => out.headers.set(k, v));
  return out;
}
