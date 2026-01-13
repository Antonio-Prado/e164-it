const apiKeyEl = document.getElementById("api_key");
const clearBtn = document.getElementById("clear");

const API_KEY_STORAGE = "e164_api_key";

try {
  const saved = sessionStorage.getItem(API_KEY_STORAGE);
  if (saved && apiKeyEl) apiKeyEl.value = saved;
} catch {}

if (apiKeyEl) {
  apiKeyEl.addEventListener("input", () => {
    const v = (apiKeyEl.value || "").trim();
    try {
      if (v) sessionStorage.setItem(API_KEY_STORAGE, v);
      else sessionStorage.removeItem(API_KEY_STORAGE);
    } catch {}
  });
}


clearBtn.addEventListener("click", () => {
  apiKeyEl.value = "";
  try { sessionStorage.removeItem(API_KEY_STORAGE); } catch {}
});

window.ui = SwaggerUIBundle({
  url: "/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "StandaloneLayout",
  requestInterceptor: (req) => {
    const key = (apiKeyEl.value || "").trim();
    if (key) {
      req.headers = req.headers || {};
      req.headers["x-api-key"] = key;
    }
    return req;
  },
});
