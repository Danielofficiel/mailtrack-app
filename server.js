require("dotenv").config();
const express = require("express");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { db, init } = require("./db");

const app = express();
app.use(express.json());
// --- Notification push (ntfy.sh) à la première ouverture, sans SMTP ---
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";

const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "";

if (!NTFY_TOPIC) {
    console.log("Notifications désactivées (NTFY_TOPIC non configuré).");
}

async function sendOpenNotification(email) {
    if (!NTFY_TOPIC) return;
    try {
          const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
                  method: "POST",
                  headers: { Title: `Mail ouvert : ${email.label}` },
                  body: `Ton mail "${email.label}"${email.recipient ? ` (envoyé à ${email.recipient})` : ""} vient d'être ouvert pour la première fois.`,
          });
          if (!res.ok) {
                  console.error(`Erreur ntfy.sh (${res.status}):`, await res.text());
          } else {
                  console.log(`Notification envoyée pour l'ouverture de "${email.label}".`);
          }
    } catch (err) {
          console.error("Erreur lors de l'envoi de la notification:", err);
    }
}

// Pixel PNG transparent 1x1, servi tel quel en binaire.
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

// --- Auth très simple pour protéger le dashboard/API (pas la route du pixel,
// qui doit rester publique pour que les clients mail puissent la charger) ---
function requireAuth(req, res, next) {
  if (!DASHBOARD_PASSWORD) return next(); // pas de mot de passe configuré = ouvert (dev local)
  const provided = req.get("x-api-key") || req.query.key;
  if (provided === DASHBOARD_PASSWORD) return next();
  return res.status(401).json({ error: "Non autorisé. Fournis le bon mot de passe." });
}

// --- Route du pixel : PUBLIQUE, jamais derrière l'auth ---
app.get("/pixel/:id.png", async (req, res) => {
  const { id } = req.params;
  res.set({
    "Content-Type": "image/png",
    "Content-Length": TRANSPARENT_PIXEL.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.status(200).end(TRANSPARENT_PIXEL);

  // Log l'ouverture de façon asynchrone, sans bloquer la réponse image.
  try {
    const exists = await db.execute({
      sql: "SELECT id, label, recipient FROM emails WHERE id = ?",
      args: [id],
    });
    if (exists.rows.length > 0) {
      const email = exists.rows[0];
      const ua = req.get("user-agent") || "";
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
      await db.execute({
        sql: "INSERT INTO opens (email_id, opened_at, user_agent, ip) VALUES (?, ?, ?, ?)",
        args: [id, new Date().toISOString(), ua, ip],
      });

      const countRes = await db.execute({
        sql: "SELECT COUNT(*) as c FROM opens WHERE email_id = ?",
        args: [id],
      });
      const openCount = Number(countRes.rows[0]?.c || 0);
      if (openCount === 1) {
        sendOpenNotification(email);
      }
    }
  } catch (err) {
    console.error("Erreur lors de l'enregistrement de l'ouverture:", err);
  }
});

// Indique si un mot de passe dashboard est requis (public, pour adapter le frontend
// avant même de savoir si l'utilisateur est authentifié)
app.get("/api/auth-required", (req, res) => {
  res.json({ required: Boolean(DASHBOARD_PASSWORD) });
});

// --- API (protégée à partir d'ici) ---
app.use("/api", requireAuth);

// Créer un nouveau mail suivi
app.post("/api/emails", async (req, res) => {
  const { label, recipient } = req.body || {};
  if (!label || !label.trim()) {
    return res.status(400).json({ error: "Le champ 'label' (sujet du mail) est requis." });
  }
  const id = uuidv4();
  const created_at = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO emails (id, label, recipient, created_at) VALUES (?, ?, ?, ?)",
    args: [id, label.trim(), (recipient || "").trim(), created_at],
  });
  res.status(201).json({ id, label, recipient, created_at });
});

// Lister tous les mails suivis, avec compteur d'ouvertures
app.get("/api/emails", async (req, res) => {
  const emails = await db.execute("SELECT * FROM emails ORDER BY created_at DESC");
  const opensAgg = await db.execute(`
    SELECT email_id, COUNT(*) as open_count, MIN(opened_at) as first_open, MAX(opened_at) as last_open
    FROM opens GROUP BY email_id
  `);
  const aggMap = {};
  for (const row of opensAgg.rows) {
    aggMap[row.email_id] = row;
  }
  const result = emails.rows.map((e) => ({
    ...e,
    open_count: aggMap[e.id]?.open_count || 0,
    first_open: aggMap[e.id]?.first_open || null,
    last_open: aggMap[e.id]?.last_open || null,
  }));
  res.json(result);
});

// Détail d'un mail suivi + historique des ouvertures
app.get("/api/emails/:id", async (req, res) => {
  const { id } = req.params;
  const email = await db.execute({ sql: "SELECT * FROM emails WHERE id = ?", args: [id] });
  if (email.rows.length === 0) return res.status(404).json({ error: "Introuvable" });
  const opens = await db.execute({
    sql: "SELECT * FROM opens WHERE email_id = ? ORDER BY opened_at DESC",
    args: [id],
  });
  res.json({ ...email.rows[0], opens: opens.rows });
});

// Supprimer un mail suivi
app.delete("/api/emails/:id", async (req, res) => {
  const { id } = req.params;
  await db.execute({ sql: "DELETE FROM opens WHERE email_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM emails WHERE id = ?", args: [id] });
  res.status(204).end();
});

// --- Fichiers statiques du dashboard ---
app.use(express.static(path.join(__dirname, "public")));

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`MailTrack maison démarré sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erreur d'initialisation de la base de données:", err);
    process.exit(1);
  });
