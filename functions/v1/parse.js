export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ok: true,
    echo: body,
    note: "Endpoint di test. Qui poi metteremo parsing/normalizzazione."
  }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
