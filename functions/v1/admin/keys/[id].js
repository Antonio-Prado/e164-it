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
  const { request, env, params } = context;

  if (!env.DB) return json(500, { ok: false, error: { code: "misconfigured", message: "Missing D1 binding DB." } });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json(400, { ok: false, error: { code: "bad_request", message: "Invalid key id." } });
  }

  const selectOne = async () => {
    return env.DB
      .prepare("SELECT id, label, enabled, rpm_parse, rpm_batch, max_batch_rows, max_batch_bytes, created_at FROM api_keys WHERE id = ? LIMIT 1")
      .bind(id)
      .first();
  };

  if (request.method === "GET") {
    const row = await selectOne();
    if (!row) return json(404, { ok: false, error: { code: "not_found", message: "Key not found." } });
    return json(200, { ok: true, item: row });
  }

  if (request.method === "PATCH") {
    const payload = await request.json().catch(() => ({}));
    const fields = [];
    const binds = [];

    if (typeof payload.label === "string" || payload.label === null) {
      fields.push("label = ?");
      binds.push(payload.label);
    }

    if (payload.enabled === 0 || payload.enabled === 1 || payload.enabled === true || payload.enabled === false) {
      fields.push("enabled = ?");
      binds.push(payload.enabled ? 1 : 0);
    }

    if (payload.rpm_parse !== undefined) {
      fields.push("rpm_parse = ?");
      binds.push(clampInt(payload.rpm_parse, { min: 1, max: 60_000, fallback: 300 }));
    }

    if (payload.rpm_batch !== undefined) {
      fields.push("rpm_batch = ?");
      binds.push(clampInt(payload.rpm_batch, { min: 1, max: 60_000, fallback: 30 }));
    }

    if (payload.max_batch_rows !== undefined) {
      fields.push("max_batch_rows = ?");
      binds.push(clampInt(payload.max_batch_rows, { min: 1, max: 200_000, fallback: 5000 }));
    }

    if (payload.max_batch_bytes !== undefined) {
      fields.push("max_batch_bytes = ?");
      binds.push(clampInt(payload.max_batch_bytes, { min: 1, max: 25_000_000, fallback: 1_048_576 }));
    }

    if (!fields.length) {
      return json(400, { ok: false, error: { code: "bad_request", message: "No updatable fields provided." } });
    }

    binds.push(id);

    const sql = `UPDATE api_keys SET ${fields.join(", ")} WHERE id = ?`;
    await env.DB.prepare(sql).bind(...binds).run();

    const row = await selectOne();
    return json(200, { ok: true, item: row });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("UPDATE api_keys SET enabled = 0 WHERE id = ?").bind(id).run();
    return json(200, { ok: true, id, disabled: true });
  }

  return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET, PATCH or DELETE." } });
}
