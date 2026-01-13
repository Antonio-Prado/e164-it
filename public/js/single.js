const $ = (id) => document.getElementById(id);

let last = null;
let toastTimer = null;

function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1200);
}

const apiKeyEl = $("api_key");

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


function updateRateLimit(res) {
  const el = $("rl");
  if (!el || !res) return;

  const limit = res.headers.get("x-ratelimit-limit");
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");

  if (limit && remaining && reset) {
    const resetMs = Number(reset) * 1000;
    const resetIso = Number.isFinite(resetMs) ? new Date(resetMs).toISOString() : "—";
    el.textContent = `Rate limit: ${remaining}/${limit} remaining (reset at ${resetIso})`;
  } else {
    el.textContent = "Rate limit: —";
  }
}

function setStatus(text, good = null) {
  const el = $("status");
  el.textContent = text;
  el.classList.remove("ok", "bad");
  if (good === true) el.classList.add("ok");
  if (good === false) el.classList.add("bad");
}

function buildOptions() {
  const formats = ["e164"];
  if ($("fmt_intl").checked) formats.push("international");
  if ($("fmt_nat").checked) formats.push("national");
  if ($("fmt_rfc").checked) formats.push("rfc3966");

  return {
    format: formats,
    classify: true,
    mask: { mode: $("mask").value },
    hash: { enabled: $("hash").checked },
  };
}

async function parseNow() {
  setStatus("loading…");
  $("notes").textContent = "—";
  $("out").textContent = "{}";
  last = null;

  const input = $("input").value;
  const default_region = $("region").value || undefined;
  const payload = { input, default_region, options: buildOptions() };

  try {
    const apiKey = ($("api_key")?.value || "").trim();
    const headers = { "content-type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;

    const res = await fetch("/v1/parse", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    updateRateLimit(res);

    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      data = { raw: txt };
    }

    last = data?.result || null;
    $("out").textContent = JSON.stringify(data, null, 2);
    const valid = data?.result?.valid;
    const good = Boolean(data && data.ok && valid === true);
    if (data && data.ok && valid === false) {
      setStatus("invalid", false);
    } else {
      setStatus(res.ok ? "ok" : "http " + res.status, good);
    }

    const notes = [];
    if (data?.warnings?.length) notes.push("warnings: " + data.warnings.join("; "));
    if (data?.errors?.length) notes.push("errors: " + data.errors.join("; "));
    if ($("hash").checked && data?.result?.hash_note) notes.push(data.result.hash_note);
    $("notes").textContent = notes.length ? notes.join("\n") : "—";
  } catch (e) {
    setStatus("error", false);
    $("out").textContent = String(e);
  }
}

async function copyText(t, label = "Copied") {
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    showToast(label);
  } catch {
    showToast("Copy failed");
  }
}

$("btn").addEventListener("click", parseNow);

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") parseNow();
});

$("btn_example_it").addEventListener("click", () => {
  $("input").value = "0039 333 123 4567";
  $("region").value = "IT";
  parseNow();
});

$("btn_example_us").addEventListener("click", () => {
  $("input").value = "(415) 555-2671";
  $("region").value = "US";
  parseNow();
});

$("copy_e164").addEventListener("click", () => copyText(last?.e164, "Copied: E.164"));
$("copy_tel").addEventListener("click", () => copyText(last?.rfc3966, "Copied: tel:"));
$("copy_json").addEventListener("click", () => copyText($("out").textContent, "Copied: JSON"));

parseNow();
