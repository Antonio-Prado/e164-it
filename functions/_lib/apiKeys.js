import { base64Url, sha256Hex } from "./crypto.js";

export function assertEnvSecrets(env) {
  if (!env.API_KEY_SALT) throw new Error("Missing env.API_KEY_SALT");
  if (!env.ADMIN_TOKEN) throw new Error("Missing env.ADMIN_TOKEN");
}

export function generateApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `e164_${base64Url(bytes)}`;
}

export async function hashApiKey(env, apiKeyPlain) {
  return sha256Hex(`${env.API_KEY_SALT}:${apiKeyPlain}`);
}

export async function findApiKeyByHash(env, keyHash) {
  const row = await env.DB
    .prepare("SELECT id, enabled, rpm_parse, rpm_batch, label FROM api_keys WHERE key_hash = ? LIMIT 1")
    .bind(keyHash)
    .first();

  return row || null;
}

export function readApiKeyFromRequest(request, env) {
  // Prefer header; allow query param only when explicitly enabled.
  const h = request.headers.get("x-api-key");
  if (h && h.trim()) return h.trim();

  if (env?.ALLOW_API_KEY_QUERY !== "true") return null;

  const url = new URL(request.url);
  const q = url.searchParams.get("api_key");
  return q && q.trim() ? q.trim() : null;
}

export function isAdminAuthorized(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token && token === env.ADMIN_TOKEN;
  }
  const alt = request.headers.get("x-admin-token");
  return alt && alt.trim() === env.ADMIN_TOKEN;
}
