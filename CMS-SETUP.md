# CMS – Inhalte selbst bearbeiten

Die Seite bleibt eine statische Website. Alle Texte, Listen und Bilder liegen als
JSON in [`content/`](content/) und werden im Browser durch [`js/cms.js`](js/cms.js)
in die Seiten eingesetzt (das HTML enthält die Inhalte zusätzlich als Fallback).

Bearbeitet wird alles über **[Pages CMS](https://pagescms.org)** – kostenlos,
gehostet, kein eigener Server, kein Netlify Identity. Jede Speicherung macht einen
Commit ins Repo `olispanda/PinkPartyGirls`, danach deployt Netlify automatisch neu.

```
content/settings.json   Bandname, Footer-Text, Social-Links (überall)
content/home.json       Startseite: Hero-Video/Logo, Slogan, Button
content/about.json      About: Bio, Bandmitglieder, Presse-Zitat
content/music.json      Music: alle Releases
content/shows.json      Shows: Tour-Daten (speist auch den Teaser auf der Startseite)
content/contact.json    Contact: Booking-/Presse-Mail
```

Die Bearbeitungs-Oberfläche ist in [`.pages.yml`](.pages.yml) im Repo-Root definiert.

---

## Einmalig einrichten (~3 Minuten)

1. **[app.pagescms.org](https://app.pagescms.org)** öffnen → **Sign in with GitHub**.
2. Beim ersten Mal: die **Pages CMS GitHub App** installieren. Bei „Repository access"
   **Only select repositories → `olispanda/PinkPartyGirls`** wählen.
3. Zurück in Pages CMS das Repo `PinkPartyGirls` öffnen.
4. `.pages.yml` liegt schon im Repo → die Oberfläche erscheint sofort mit den
   Einträgen **Einstellungen / Startseite / About / Music / Shows / Contact**.
5. Inhalt ändern → **Save**. Fertig – Commit + Netlify-Deploy laufen automatisch,
   nach ~1 Minute ist es live.

### Bandkolleginnen ohne GitHub-Account

In Pages CMS unter **Settings → Collaborators** per E-Mail einladen. Sie können dann
Inhalte und Bilder bearbeiten (aber nicht `.pages.yml` oder die Collaborator-Liste).

### Bilder & Video

Uploads landen automatisch in `Assets/uploads/`. Fürs Hero-Video eine komprimierte
`.mp4` nehmen (idealerweise < 10 MB).

---

## Kontaktformular

Das Formular auf `contact.html` nutzt **Netlify Forms** (`data-netlify="true"`).
Einsendungen erscheinen im Netlify-Dashboard unter **Forms**. Dort optional eine
E-Mail-Benachrichtigung einrichten (**Forms → Settings → Form notifications**).

---

## Lokal testen

```bash
npm install
npm run dev        # Seite auf http://localhost:3000
```

Zum Bearbeiten der Inhalte reicht es, die Dateien unter `content/` direkt im Editor
zu ändern – der Dev-Server lädt bei jeder Änderung neu.

---

## Ein Feld hinzufügen

1. Feld in der passenden Datei unter `content/` ergänzen.
2. Passenden Feld-Eintrag in [`.pages.yml`](.pages.yml) hinzufügen
   ([Feldtypen](https://pagescms.org/docs/configuration/content/fields/)).
3. In [`js/cms.js`](js/cms.js) im jeweiligen `render…()` das Feld ins DOM schreiben
   und im HTML einen `id`- oder `data-cms`-Haken setzen.
