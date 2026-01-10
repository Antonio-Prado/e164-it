export async function onRequest({ request }) {
  const url = new URL(request.url);

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "e164.it API",
      version: "1.0.0",
      description: "Phone number parsing and normalization (E.164) with batch CSV support."
    },
    servers: [{ url: `${url.protocol}//${url.host}` }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
        AdminBearer: { type: "http", scheme: "bearer" }
      }
    },
    paths: {
      "/v1/health": {
        get: { summary: "Health check", responses: { "200": { description: "OK" } } }
      },
      "/v1/openapi.json": {
        get: { summary: "OpenAPI specification", responses: { "200": { description: "OpenAPI JSON" } } }
      },
      "/v1/parse": {
        get: { summary: "Endpoint help", responses: { "200": { description: "Help" } } },
        post: {
          summary: "Parse and normalize a phone number",
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    input: { type: "string" },
                    default_region: { type: ["string", "null"] },
                    options: { type: "object" }
                  },
                  required: ["input"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Parsed" },
            "400": { description: "Bad request" },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limited" },
            "500": { description: "Internal error" }
          }
        }
      },
      "/v1/batch/parse": {
        get: { summary: "Endpoint help", responses: { "200": { description: "Help" } } },
        post: {
          summary: "Batch parse phone numbers from CSV",
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                    phone_column: { type: "string" }
                  },
                  required: ["file", "phone_column"]
                }
              }
            }
          },
          responses: {
            "200": { description: "CSV attachment" },
            "400": { description: "Bad request" },
            "401": { description: "Unauthorized" },
            "413": { description: "Too large" },
            "429": { description: "Rate limited" },
            "500": { description: "Internal error" }
          }
        }
      },
      "/v1/admin/keys": {
        get: { summary: "List API keys (admin)", security: [{ AdminBearer: [] }], responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" } } },
        post: { summary: "Create an API key (admin)", security: [{ AdminBearer: [] }], responses: { "201": { description: "Created" }, "401": { description: "Unauthorized" } } }
      }
    }
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
