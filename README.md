# MailTrack maison 📬

Une petite app pour suivre l'ouverture de tes mails, sur le même principe que Mailtrack :
un pixel invisible (image 1x1 transparente) est inséré dans le mail, et quand le
destinataire l'ouvre, son client mail charge cette image depuis ton serveur — ce qui
te permet de savoir quand (et combien de fois) le mail a été ouvert.

## Comment ça marche

1. Dans le dashboard, tu crées un "mail suivi" (un libellé, un destinataire optionnel).
2. L'app te donne une URL unique de pixel : `https://ton-app.onrender.com/pixel/<id>.png`.
3. Tu colles cette image dans ton mail Gmail avant de l'envoyer (voir plus bas).
4. Dès que le destinataire ouvre le mail (et que les images se chargent), le dashboard
   affiche "Ouvert" avec la date et l'heure.

## ⚠️ Limites à connaître (comme pour n'importe quel outil de ce type, Mailtrack inclus)

- **Le suivi ne marche que si les images se chargent.** Beaucoup de clients mail
  bloquent les images par défaut tant que le destinataire ne clique pas sur
  "Afficher les images". Si le destinataire ne charge jamais les images, aucune
  ouverture ne sera détectée.
- **Gmail met les images en cache via son propre proxy** (Google télécharge l'image une
  fois et la sert ensuite depuis son cache). Résultat : plusieurs ouvertures
  rapprochées par le même destinataire peuvent ne compter que comme une seule.
  Les en-têtes anti-cache envoyés par l'app limitent ce problème mais ne l'éliminent
  pas complètement — c'est une limite technique de tous les outils basés sur un pixel.
- Ce n'est pas fiable à 100 %, mais ça donne une bonne indication, exactement comme
  Mailtrack.

## 1. Tester en local

```bash
npm install
npm start
```

Ouvre `http://localhost:3000`. Comme aucun `DASHBOARD_PASSWORD` n'est configuré, tu
arrives directement sur le dashboard (pratique pour tester). Une base SQLite locale
(`data.db`) est créée automatiquement.

## 2. Déploiement gratuit (Turso + Render)

Pour que le pixel fonctionne, ton serveur doit être accessible publiquement sur
internet 24/7 (ton ordinateur ne suffit pas). Voici comment le déployer gratuitement
avec **Render** (hébergement) et **Turso** (base de données persistante — le disque
gratuit de Render n'est pas garanti persistant, donc autant utiliser une vraie base
dès le départ).

### Étape A — Créer la base de données (Turso, gratuit)

1. Va sur [turso.tech](https://turso.tech) et crée un compte gratuit.
2. Crée une nouvelle base de données (bouton "Create Database").
3. Une fois créée, récupère :
   - l'**URL de connexion** (commence par `libsql://...`)
   - un **token d'authentification** (bouton "Create Token")
4. Garde ces deux valeurs sous la main, tu en auras besoin à l'étape C.

### Étape B — Mettre le code sur GitHub

1. Crée un nouveau dépôt sur [github.com](https://github.com) (public ou privé).
2. Depuis ce dossier, exécute :
   ```bash
   git init
   git add .
   git commit -m "Première version de MailTrack maison"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/TON-DEPOT.git
   git push -u origin main
   ```

### Étape C — Déployer sur Render (gratuit)

1. Va sur [render.com](https://render.com) et crée un compte gratuit (tu peux te
   connecter avec ton compte GitHub).
2. Clique sur **New +** → **Web Service**.
3. Choisis le dépôt GitHub que tu viens de créer.
4. Configure :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
5. Dans la section **Environment Variables**, ajoute :
   - `LIBSQL_URL` = l'URL Turso de l'étape A (`libsql://...`)
   - `LIBSQL_AUTH_TOKEN` = le token Turso de l'étape A
   - `DASHBOARD_PASSWORD` = un mot de passe de ton choix (important : l'app sera
     publique sur internet, ce mot de passe protège ton dashboard — la route du
     pixel, elle, reste toujours accessible, c'est normal, sinon le suivi ne
     fonctionnerait pas)
6. Clique sur **Create Web Service**. Le premier déploiement prend 1 à 2 minutes.
7. Une fois déployé, Render te donne une URL du type
   `https://mailtrack-app-xxxx.onrender.com` — c'est ton app !

**Note sur le plan gratuit de Render** : le service se met en veille après 15
minutes d'inactivité, et met quelques secondes à se "réveiller" au prochain appel
(y compris pour recevoir une ouverture de pixel — le premier chargement après une
veille peut être un peu plus lent, mais ça fonctionne). Si tu veux éviter ça, Render
propose des plans payants sans mise en veille.

## 3. Utiliser l'app avec Gmail

1. Ouvre ton dashboard déployé (ex : `https://mailtrack-app-xxxx.onrender.com`),
   connecte-toi avec ton mot de passe.
2. Crée un nouveau mail suivi (sujet + destinataire optionnel).
3. Copie l'URL du pixel générée.
4. Dans Gmail, compose ton mail, puis clique sur l'icône **Insérer une photo**
   (dans la barre d'outils en bas de la fenêtre de composition).
5. Choisis l'onglet **Adresse web (URL)**, colle l'URL du pixel, valide.
6. Une petite image (invisible car transparente) apparaît dans ton mail — c'est
   normal, ne la supprime pas.
7. Envoie ton mail normalement.
8. Reviens sur ton dashboard : dès que le destinataire ouvre le mail, le statut
   passera à "Ouvert" avec l'heure exacte.

## Structure du projet

```
mailtrack-app/
├── server.js         # API + route du pixel de suivi
├── db.js             # Connexion et schéma de la base (SQLite/Turso via libSQL)
├── public/
│   ├── index.html     # Dashboard
│   ├── style.css
│   └── app.js
├── package.json
└── .env.example        # Variables d'environnement à configurer
```

## Sécurité & vie privée

- Définis toujours `DASHBOARD_PASSWORD` en production : sans lui, n'importe qui
  connaissant l'URL de ton app pourrait voir la liste de tes mails suivis.
- L'app enregistre, pour chaque ouverture : la date/heure, l'adresse IP et le
  user-agent (navigateur/client) du destinataire. Ces informations restent dans ta
  propre base de données, elles ne sont envoyées à aucun tiers.
