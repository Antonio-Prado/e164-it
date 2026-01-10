import { generateApiKey, hashApiKey } from "../../_lib/apiKeys.js";

function json(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function clampInt(v, { min, max, fallback }) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) return json(500, { ok: false, error: { code: "misconfigured", message: "Missing D1 binding DB." } });

  if (request.method === "GET") {
    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get("limit"), { min: 1, max: 200, fallback: 50 });
    const offset = clampInt(url.searchParams.get("offset"), { min: 0, max: 1_000_000, fallback: 0 });

    const rows = await env.DB
      .prepare("SELECT id, label, enabled, rpm_parse, rpm_batch, max_batch_rows, max_batch_bytes, created_at FROM api_keys ORDER BY id DESC LIMIT ? OFFSET ?")
      .bind(limit, offset)
      .all();

    return json(200, { ok: true, items: rows.results });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));

    const label = typeof payload.label === "string" ? payload.label : null;

    const rpm_parse = clampInt(payload.rpm_parse, { min: 1, max: 60_000, fallback: 300 });
    const rpm_batch = clampInt(payload.rpm_batch, { min: 1, max: 60_000, fallback: 30 });

    // Safety caps (adjust later if needed)
    const max_batch_rows = clampInt(payload.max_batch_rows, { min: 1, max: 200_000, fallback: 5000 });
    const max_batch_bytes = clampInt(payload.max_batch_bytes, { min: 1, max: 25_000_000, fallback: 1_048_576 });

    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(env, apiKey);

    const res = await env.DB
      .prepare(
        "INSERT INTO api_keys (key_hash, label, enabled, rpm_parse, rpm_batch, max_batch_rows, max_batch_bytes) VALUES (?, ?, 1, ?, ?, ?, ?)"
      )
      .bind(keyHash, label, rpm_parse, rpm_batch, max_batch_rows, max_batch_bytes)
      .run();

    return json(201, {
      ok: true,
      api_key: apiKey, // returned only once
      id: res.meta?.last_row_id ?? null,
      label,
      enabled: 1,
      rpm_parse,
      rpm_batch,
      max_batch_rows,
      max_batch_bytes
    });
  }

  return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET or POST." } });
}
