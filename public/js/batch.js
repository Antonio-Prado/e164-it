const $ = (id) => document.getElementById(id);

const apiKeyEl = $("api_key");

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

function setStatus(t) {
  $("status").textContent = t;
}

function previewText(text) {
  const lines = text.split(/\r?\n/).slice(0, 40).join("\n");
  $("preview").textContent = lines || "—";
}

$("run").addEventListener("click", async () => {
  const f = $("file").files?.[0];
  if (!f) {
    setStatus("missing file");
    return;
  }

  const phoneCol = $("phone_column").value.trim();
  if (!phoneCol) {
    setStatus("missing phone_column");
    return;
  }

  setStatus("uploading…");
  $("download").style.display = "none";
  $("download").removeAttribute("href");

  const fd = new FormData();
  fd.append("file", f, f.name);
  fd.append("phone_column", phoneCol);
  fd.append("default_region", $("region").value || "");
  fd.append("has_header", $("has_header").checked ? "true" : "false");
  fd.append("delimiter", $("delimiter").value);
  fd.append("mask_mode", $("mask").value);
  fd.append("hash_enabled", $("hash").checked ? "true" : "false");

  try {
    const apiKey = ($("api_key")?.value || "").trim();
    const headers = apiKey ? { "x-api-key": apiKey } : undefined;

    const res = await fetch("/v1/batch/parse", { method: "POST", headers, body: fd });

    const bt = res.headers.get("x-batch-rows-total");
    const bo = res.headers.get("x-batch-rows-ok");
    const bf = res.headers.get("x-batch-rows-failed");
    const bs = $("batch_stats");
    if (bs) bs.textContent = bt && bo && bf ? `Batch stats: ${bo} ok, ${bf} failed, ${bt} total` : "Batch stats: —";
    updateRateLimit(res);

    if (!res.ok) {
      const t = await res.text();
      setStatus("error");
      previewText(t);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = $("download");
    a.href = url;
    a.style.display = "inline-block";
    a.textContent = "Download result";

    try {
      a.click();
    } catch {}

    const txt = await blob.text();
    previewText(txt);

    setStatus("done");
  } catch (e) {
    setStatus("error");
    previewText(String(e));
  }
});
