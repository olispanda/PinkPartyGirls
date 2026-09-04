# CMS – Inhalte selbst bearbeiten

Die Seite bleibt eine statische Website. Alle Texte, Listen und Bilder liegen
als JSON in [`content/`](content/) und werden über ein Login-geschütztes
Admin-Panel unter **`/admin`** bearbeitet ([Decap CMS](https://decapcms.org)).
Jede Änderung wird automatisch ins Git committet und Netlify deployed die Seite neu.

```
content/settings.json   Bandname, Footer-Text, Social-Links (überall)
content/home.json       Startseite: Hero-Video/Logo, Slogan, Button
content/about.json      About: Bio, Bandmitglieder, Presse-Zitat
content/music.json      Music: alle Releases
content/shows.json      Shows: Tour-Daten (füttert auch den Teaser auf der Startseite)
content/contact.json    Contact: Booking-/Presse-Mail
```

Die HTML-Dateien enthalten die Inhalte weiterhin als Fallback – wenn JavaScript
oder ein Abruf fehlschlägt, zeigt die Seite trotzdem etwas an.
Gerendert wird zur Laufzeit im Browser durch [`js/cms.js`](js/cms.js).

---

## Einmalig einrichten (Netlify)

1. **Repo zu GitHub pushen** (falls noch nicht geschehen).
2. Auf [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → dieses Repo wählen.
   Build command: *leer lassen*. Publish directory: `.` (steht schon in `netlify.toml`).
3. Nach dem ersten Deploy: **Site configuration → Identity → Enable Identity**.
4. Unter **Identity → Registration** auf **Invite only** stellen.
5. Unter **Identity → Services → Git Gateway** → **Enable Git Gateway**.
6. **Identity → Invite users** → eigene E-Mail-Adresse eintragen (und die der Bandkolleginnen).
7. Einladungs-Mail öffnen → Passwort setzen. Fertig.

Danach: **https://pinkpartygirls.netlify.app/admin/** öffnen, einloggen, Inhalte
ändern, **Publish** klicken. Nach ~1 Minute ist die Änderung live.

> `site_url` / `display_url` in [`admin/config.yml`](admin/config.yml) stehen auf
> `https://pinkpartygirls.netlify.app`. Bei eigener Domain dort anpassen.

### Bilder & Video
Uploads landen in `Assets/uploads/`. Für das Hero-Video am besten eine
komprimierte `.mp4` (< ~10 MB) hochladen.

---

## Lokal testen (ohne Netlife-Login)

```bash
npm install
npm run cms      # Terminal 1: Decap-Proxy auf :8081 (schreibt direkt in ./content)
npm run dev      # Terminal 2: Seite + /admin auf :3000
```

Dann [http://localhost:3000/admin/](http://localhost:3000/admin/) öffnen – kein
Login nötig, Änderungen gehen direkt in die JSON-Dateien im Projektordner
(`local_backend: true` in der Config).

---

## Kontaktformular

Das Formular auf `contact.html` nutzt **Netlify Forms** (`data-netlify="true"`).
Einsendungen erscheinen in Netlify unter **Forms**. Optional dort eine
E-Mail-Benachrichtigung einrichten (**Forms → Settings → Form notifications**).

---

## Ein Feld hinzufügen

1. Feld in der passenden Datei unter `content/` ergänzen.
2. Passendes `widget` in [`admin/config.yml`](admin/config.yml) eintragen.
3. In [`js/cms.js`](js/cms.js) im jeweiligen `render…()` das Feld ins DOM schreiben
   und im HTML einen `id`- oder `data-cms`-Haken setzen.
