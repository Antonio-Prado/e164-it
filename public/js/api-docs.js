const apiKeyEl = document.getElementById("api_key");
const clearBtn = document.getElementById("clear");

if (apiKeyEl) {
  apiKeyEl.addEventListener("input", () => {
    // Do not persist the API key in browser storage to avoid clear-text storage of sensitive data.
    const v = (apiKeyEl.value || "").trim();
    // The current value in the input will be used directly by the request interceptor below.
  });
}

clearBtn.addEventListener("click", () => {
  if (apiKeyEl) {
    apiKeyEl.value = "";
  }
});

window.ui = SwaggerUIBundle({
  url: "/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "StandaloneLayout",
  requestInterceptor: (req) => {
    const key = (apiKeyEl && apiKeyEl.value || "").trim();
    if (key) {
      req.headers = req.headers || {};
      req.headers["x-api-key"] = key;
    }
    return req;
  },
});
