const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "e164_admin_token";

function setStatus(t) {
  $("status").textContent = t;
}

function getToken() {
  return $("admin_token").value.trim();
}

function authHeaders() {
  const t = getToken();
  if (!t) return null;
  return { authorization: `Bearer ${t}`, "content-type": "application/json" };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[c]));
}

async function refresh() {
  const h = authHeaders();
  if (!h) {
    setStatus("missing token");
    return;
  }

  setStatus("loading…");
  const res = await fetch("/v1/admin/keys", { headers: h });
  if (!res.ok) {
    setStatus("error");
    $("rows").innerHTML = `<tr><td colspan="8">${escapeHtml(await res.text())}</td></tr>`;
    return;
  }
  const data = await res.json();
  const items = data.items || data.keys || [];

  $("rows").innerHTML = items
    .map((k) => {
      return `<tr>
        <td>${k.id}</td>
        <td>${escapeHtml(k.label ?? "")}</td>
        <td>${k.enabled ? "yes" : "no"}</td>
        <td>${k.rpm_parse}</td>
        <td>${k.rpm_batch}</td>
        <td>${k.max_batch_rows ?? ""}</td>
        <td>${k.max_batch_bytes ?? ""}</td>
        <td>
          <button data-act="toggle" data-id="${k.id}" data-enabled="${k.enabled ? 1 : 0}">${
            k.enabled ? "Disable" : "Enable"
          }</button>
          <button data-act="edit" data-id="${k.id}">Edit limits</button>
        </td>
      </tr>`;
    })
    .join("");

  setStatus("ok");
}

async function createKey() {
  const h = authHeaders();
  if (!h) {
    setStatus("missing token");
    return;
  }

  const payload = {
    label: $("label").value.trim() || null,
    rpm_parse: Number($("rpm_parse").value || 60),
    rpm_batch: Number($("rpm_batch").value || 10),
    max_batch_rows: Number($("max_batch_rows").value || 5000),
    max_batch_bytes: Number($("max_batch_bytes").value || 1048576),
  };

  setStatus("creating…");
  const res = await fetch("/v1/admin/keys", { method: "POST", headers: h, body: JSON.stringify(payload) });
  const txt = await res.text();

  if (!res.ok) {
    setStatus("error");
    $("created_wrap").style.display = "none";
    alert(txt);
    return;
  }

  const data = JSON.parse(txt);
  $("created_key").textContent = data.api_key || "(missing api_key)";
  $("created_wrap").style.display = "block";
  setStatus("created");

  await refresh();
}

async function patchKey(id, patch) {
  const h = authHeaders();
  if (!h) {
    setStatus("missing token");
    return;
  }

  setStatus("updating…");
  const res = await fetch(`/v1/admin/keys/${id}`, { method: "PATCH", headers: h, body: JSON.stringify(patch) });
  if (!res.ok) {
    setStatus("error");
    alert(await res.text());
    return;
  }
  setStatus("ok");
  await refresh();
}

$("save_token").addEventListener("click", () => {
  const t = $("admin_token").value.trim();
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  setStatus("token saved");
});

$("clear_token").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  $("admin_token").value = "";
  setStatus("token cleared");
});

$("refresh").addEventListener("click", refresh);
$("create").addEventListener("click", createKey);

$("copy_created").addEventListener("click", async () => {
  const v = $("created_key").textContent.trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    alert("Copied.");
  } catch {
    alert("Copy failed (clipboard not available).");
  }
});

$("hide_created").addEventListener("click", () => {
  $("created_wrap").style.display = "none";
  $("created_key").textContent = "";
});

$("rows").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;

  const id = Number(b.dataset.id);
  const act = b.dataset.act;

  if (act === "toggle") {
    const enabled = Number(b.dataset.enabled) ? 0 : 1;
    await patchKey(id, { enabled });
    return;
  }

  if (act === "edit") {
    const rows = prompt("Max batch rows:", "5000");
    if (rows === null) return;
    const bytes = prompt("Max batch bytes:", "1048576");
    if (bytes === null) return;
    await patchKey(id, { max_batch_rows: Number(rows), max_batch_bytes: Number(bytes) });
  }
});

$("admin_token").value = sessionStorage.getItem(TOKEN_KEY) || "";
refresh().catch(() => setStatus("idle"));
