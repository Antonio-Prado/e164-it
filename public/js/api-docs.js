const STORAGE_KEY = "e164_api_key";
const apiKeyEl = document.getElementById("api_key");
const clearBtn = document.getElementById("clear");

apiKeyEl.value = sessionStorage.getItem(STORAGE_KEY) || "";
apiKeyEl.addEventListener("input", () => {
  const v = apiKeyEl.value.trim();
  if (v) sessionStorage.setItem(STORAGE_KEY, v);
  else sessionStorage.removeItem(STORAGE_KEY);
});
clearBtn.addEventListener("click", () => {
  apiKeyEl.value = "";
  sessionStorage.removeItem(STORAGE_KEY);
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
