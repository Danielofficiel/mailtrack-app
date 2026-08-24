const state = {
  apiKey: sessionStorage.getItem("mt_api_key") || "",
  emails: [],
};

const el = (id) => document.getElementById(id);
const originUrl = () => window.location.origin;

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (state.apiKey) headers["x-api-key"] = state.apiKey;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    showLogin("Mot de passe incorrect.");
    throw new Error("unauthorized");
  }
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showLogin(errorMsg) {
  el("app-screen").classList.add("hidden");
  el("login-screen").classList.remove("hidden");
  if (errorMsg) {
    el("login-error").textContent = errorMsg;
    el("login-error").classList.remove("hidden");
  }
}

function showApp() {
  el("login-screen").classList.add("hidden");
  el("app-screen").classList.remove("hidden");
  loadEmails();
}

function pixelUrlFor(id) {
  return `${originUrl()}/pixel/${id}.png`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

async function loadEmails() {
  const list = el("emails-list");
  list.innerHTML = `<p class="muted">Chargement…</p>`;
  try {
    const emails = await api("/api/emails");
    state.emails = emails;
    if (emails.length === 0) {
      list.innerHTML = `<div class="empty-state">Aucun mail suivi pour l'instant. Crée-en un ci-dessus 👆</div>`;
      return;
    }
    list.innerHTML = "";
    for (const e of emails) {
      const item = document.createElement("div");
      item.className = "email-item";
      const opened = e.open_count > 0;
      item.innerHTML = `
        <div class="email-info">
          <div class="label">${escapeHtml(e.label)}</div>
          <div class="sub">${e.recipient ? escapeHtml(e.recipient) + " · " : ""}créé le ${formatDate(e.created_at)}</div>
        </div>
        <div class="badge ${opened ? "opened" : "unopened"}">
          ${opened ? `👁 Ouvert ×${e.open_count}` : "Non ouvert"}
        </div>
      `;
      item.addEventListener("click", () => openDetail(e.id));
      list.appendChild(item);
    }
  } catch (err) {
    if (err.message !== "unauthorized") {
      list.innerHTML = `<p class="error">Erreur de chargement : ${escapeHtml(err.message)}</p>`;
    }
  }
}

async function openDetail(id) {
  try {
    const detail = await api(`/api/emails/${id}`);
    el("detail-label").textContent = detail.label;
    el("detail-meta").textContent = `${detail.recipient ? detail.recipient + " · " : ""}créé le ${formatDate(detail.created_at)}`;
    el("detail-pixel-url").value = pixelUrlFor(detail.id);

    const opensDiv = el("detail-opens");
    if (detail.opens.length === 0) {
      opensDiv.innerHTML = `<p class="muted">Pas encore ouvert.</p>`;
    } else {
      opensDiv.innerHTML = detail.opens
        .map(
          (o) => `<div class="open-entry">🕒 ${formatDate(o.opened_at)}<br><span class="muted small">${escapeHtml(o.user_agent || "")}</span></div>`
        )
        .join("");
    }

    el("delete-email-btn").onclick = async () => {
      if (!confirm("Supprimer ce suivi ?")) return;
      await api(`/api/emails/${id}`, { method: "DELETE" });
      closeModal();
      loadEmails();
    };

    el("detail-modal").classList.remove("hidden");
  } catch (err) {
    if (err.message !== "unauthorized") alert(err.message);
  }
}

function closeModal() {
  el("detail-modal").classList.add("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  });
}

// --- Événements ---

el("login-btn").addEventListener("click", async () => {
  const pw = el("login-password").value;
  state.apiKey = pw;
  try {
    await api("/api/emails");
    sessionStorage.setItem("mt_api_key", pw);
    el("login-error").classList.add("hidden");
    showApp();
  } catch (err) {
    // showLogin déjà appelé par api() si 401
  }
});

el("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") el("login-btn").click();
});

el("new-email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const label = el("label").value.trim();
  const recipient = el("recipient").value.trim();
  try {
    const created = await api("/api/emails", {
      method: "POST",
      body: JSON.stringify({ label, recipient }),
    });
    el("pixel-url").value = pixelUrlFor(created.id);
    el("new-pixel-result").classList.remove("hidden");
    el("new-email-form").reset();
    loadEmails();
  } catch (err) {
    if (err.message !== "unauthorized") alert(err.message);
  }
});

el("copy-pixel-btn").addEventListener("click", () => copyToClipboard(el("pixel-url").value));
el("detail-copy-btn").addEventListener("click", () => copyToClipboard(el("detail-pixel-url").value));
el("refresh-btn").addEventListener("click", loadEmails);
el("close-modal-btn").addEventListener("click", closeModal);
el("detail-modal").addEventListener("click", (e) => {
  if (e.target.id === "detail-modal") closeModal();
});

// --- Démarrage : vérifie si un mot de passe est requis ---
(async function start() {
  try {
    const { required } = await fetch("/api/auth-required").then((r) => r.json());
    if (!required) {
      showApp();
      return;
    }
    if (state.apiKey) {
      try {
        await api("/api/emails");
        showApp();
        return;
      } catch (_) {
        // mot de passe stocké invalide, redemande
      }
    }
    showLogin();
  } catch (_) {
    showLogin();
  }
})();
