function json(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (!env.DB) return json(500, { ok: false, error: { code: "misconfigured", message: "Missing D1 binding DB." } });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json(400, { ok: false, error: { code: "bad_request", message: "Invalid key id." } });
  }

  if (request.method === "GET") {
    const row = await env.DB
      .prepare("SELECT id, label, enabled, rpm_parse, rpm_batch, created_at FROM api_keys WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

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
    if (Number.isFinite(payload.rpm_parse)) {
      fields.push("rpm_parse = ?");
      binds.push(payload.rpm_parse);
    }
    if (Number.isFinite(payload.rpm_batch)) {
      fields.push("rpm_batch = ?");
      binds.push(payload.rpm_batch);
    }

    if (!fields.length) {
      return json(400, { ok: false, error: { code: "bad_request", message: "No updatable fields provided." } });
    }

    binds.push(id);

    const sql = `UPDATE api_keys SET ${fields.join(", ")} WHERE id = ?`;
    await env.DB.prepare(sql).bind(...binds).run();

    const row = await env.DB
      .prepare("SELECT id, label, enabled, rpm_parse, rpm_batch, created_at FROM api_keys WHERE id = ? LIMIT 1")
      .bind(id)
      .first();

    return json(200, { ok: true, item: row });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("UPDATE api_keys SET enabled = 0 WHERE id = ?").bind(id).run();
    return json(200, { ok: true, id, disabled: true });
  }

  return json(405, { ok: false, error: { code: "method_not_allowed", message: "Use GET, PATCH or DELETE." } });
}
