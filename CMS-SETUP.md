# CMS – Inhalte selbst bearbeiten

Die Seite bleibt eine statische Website. Alle Texte, Listen und Bilder liegen als
JSON in [`content/`](content/) und werden im Browser durch [`js/cms.js`](js/cms.js)
in die Seiten eingesetzt (das HTML enthält die Inhalte zusätzlich als Fallback).

Bearbeitet wird alles über **[Pages CMS](https://pagescms.org)** – kostenlos,
gehostet, kein eigener Server. Jede Speicherung macht einen Commit ins Repo
`olispanda/PinkPartyGirls`; **GitHub Pages** deployt die Seite danach automatisch neu.

Drei getrennte Bausteine:

| Rolle | Was |
|---|---|
| Quelle | GitHub-Repo `olispanda/PinkPartyGirls` |
| Editor | Pages CMS (`.pages.yml`) |
| Hosting | GitHub Pages – liefert die Seite aus, hier hängt die Domain |

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
5. Inhalt ändern → **Save**. Fertig – Commit + GitHub-Pages-Deploy laufen
   automatisch, nach 1–2 Minuten ist es live.

### Bandkolleginnen ohne GitHub-Account

In Pages CMS unter **Settings → Collaborators** per E-Mail einladen. Sie können dann
Inhalte und Bilder bearbeiten (aber nicht `.pages.yml` oder die Collaborator-Liste).

### Bilder & Video

Uploads landen automatisch in `Assets/uploads/`. Fürs Hero-Video eine komprimierte
`.mp4` nehmen (idealerweise < 10 MB).

---

## Hosting: GitHub Pages

1. Im Repo **Settings → Pages**.
2. **Source: Deploy from a branch** → Branch **`main`**, Ordner **`/ (root)`** → **Save**.
3. Nach 1–2 Min ist die Seite unter `https://olispanda.github.io/PinkPartyGirls/` live.
4. **Custom Domain** (siehe unten): unter *Settings → Pages → Custom domain* die
   Domain eintragen → GitHub legt automatisch eine `CNAME`-Datei im Repo an →
   danach **Enforce HTTPS** aktivieren.

Jeder Commit auf `main` (auch die von Pages CMS) deployt automatisch neu.

## Custom Domain (DNS beim Registrar)

`www.<deine-domain>` als Hauptadresse. Beim Registrar im DNS anlegen:

| Typ | Host | Wert |
|---|---|---|
| `CNAME` | `www` | `olispanda.github.io` |
| `ALIAS`/`ANAME` | `@` | `olispanda.github.io` |

Wenn der Registrar **kein** ALIAS/ANAME am Root kann, stattdessen **vier A-Records** auf `@`:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`

## Kontaktformular

Das Formular auf `contact.html` läuft über **[Web3Forms](https://web3forms.com)**
(gratis, kein Account). Einrichten:

1. Auf [web3forms.com](https://web3forms.com) die eigene E-Mail eingeben → Access Key
   kommt per Mail.
2. In [`contact.html`](contact.html) `REPLACE_WITH_WEB3FORMS_ACCESS_KEY` durch den
   Key ersetzen, committen.

Einsendungen kommen dann direkt als E-Mail. Spam-Schutz (Honeypot) ist eingebaut.

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
