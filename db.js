const { createClient } = require("@libsql/client");
require("dotenv").config();

// En local (dev) : utilise un fichier SQLite dans ce dossier.
// En production : définis LIBSQL_URL + LIBSQL_AUTH_TOKEN (ex: base Turso gratuite)
// dans les variables d'environnement pour avoir une base persistante.
const url = process.env.LIBSQL_URL || "file:./data.db";
const authToken = process.env.LIBSQL_AUTH_TOKEN || undefined;

const db = createClient({ url, authToken });

async function init() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      recipient TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS opens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT,
      FOREIGN KEY (email_id) REFERENCES emails(id)
    )
  `);
}

module.exports = { db, init };
