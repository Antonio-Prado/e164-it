export async function onRequest() {
  return Response.json({ ok: true, service: "e164.it", version: "v1" }, {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
