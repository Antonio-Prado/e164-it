const apiKeyEl = document.getElementById("api_key");
const clearBtn = document.getElementById("clear");

clearBtn.addEventListener("click", () => {
  apiKeyEl.value = "";
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
