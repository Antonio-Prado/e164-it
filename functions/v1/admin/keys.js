import { generateApiKey, hashApiKey } from "../../_lib/apiKeys.js";

function json(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) return json(500, { ok: false, error: { code: "misconfigured", message: "Missing D1 binding DB." } });

  if (request.method === "GET") {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    const rows = await env.DB
      .prepare("SELECT id, label, enabled, rpm_parse, rpm_batch, created_at FROM api_keys ORDER BY id DESC LIMIT ? OFFSET ?")
      .bind(limit, offset)
      .all();

    return json(200, { ok: true, items: rows.results });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));

    const label = typeof payload.label === "string" ? payload.label : null;
    const rpm_parse = Number.isFinite(payload.rpm_parse) ? payload.rpm_parse : 300;
    const rpm_batch = Number.isFinite(payload.rpm_batch) ? payload.rpm_batch : 30;

    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(env, apiKey);

    const res = await env.DB
      .prepare("INSERT INTO api_keys (key_hash, label, enabled, rpm_parse, rpm_batch) VALUES (?, ?, 1, ?, ?)")
      .bind(keyHash, label, rpm_parse, rpm_batch)
      .run();

    return json(201, {
      ok: true,
      api_key: apiKey,        // returned only once
      id: res.meta?.last_row_id ?? null,
      label,
      enabled: 1,
      rpm_parse,
      rpm_batch
    });
  }

  return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET or POST." } });
}
