const DEFAULT_BASE_URL = "https://e164.it";

const jsonHeaders = {
  "content-type": "application/json",
};

const csvSample = [
  "phone,name",
  "+393331234567,Test One",
  "+393331234568,Test Two",
].join("\n");

const isOkStatus = (status) => status === 200 || status === 201 || status === 204;

const summarizeResponse = async (response) => {
  const text = await response.text();
  return text ? text.slice(0, 500) : "";
};

const check = async (name, response) => {
  if (isOkStatus(response.status)) {
    console.log(`✅ ${name} (HTTP ${response.status})`);
    return;
  }
  const body = await summarizeResponse(response);
  throw new Error(`❌ ${name} (HTTP ${response.status}) ${body}`);
};

const runChecks = async (env) => {
  const baseUrl = env.BASE_URL || DEFAULT_BASE_URL;
  const apiKey = env.API_KEY;
  const adminToken = env.ADMIN_TOKEN;

  if (!apiKey) throw new Error("Missing API_KEY");
  if (!adminToken) throw new Error("Missing ADMIN_TOKEN");

  await check("Health", await fetch(`${baseUrl}/v1/health`));
  await check("Parse help", await fetch(`${baseUrl}/v1/parse`));

  await check(
    "Parse POST",
    await fetch(`${baseUrl}/v1/parse`, {
      method: "POST",
      headers: {
        ...jsonHeaders,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        input: "0039 333 123 4567",
        default_region: "IT",
        options: {
          format: ["e164", "international", "national", "rfc3966"],
          classify: true,
          mask: { mode: "last4" },
          hash: { enabled: true },
        },
      }),
    })
  );

  await check("Batch help", await fetch(`${baseUrl}/v1/batch/parse`));

  const form = new FormData();
  form.append("file", new Blob([csvSample], { type: "text/csv" }), "sample.csv");
  form.append("phone_column", "phone");
  form.append("default_region", "IT");
  form.append("delimiter", "auto");
  form.append("has_header", "true");
  form.append("mask_mode", "last4");
  form.append("hash_enabled", "true");

  await check(
    "Batch POST",
    await fetch(`${baseUrl}/v1/batch/parse`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    })
  );

  await check("OpenAPI", await fetch(`${baseUrl}/v1/openapi.json`));

  await check(
    "Admin list",
    await fetch(`${baseUrl}/v1/admin/keys`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  );
};

export default {
  async fetch(request, env) {
    try {
      await runChecks(env);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
};
