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

## Hosting: GitHub Pages + Domain `www.pinkpartygirls.ch`

### 1. GitHub Pages aktivieren

Repo → **Settings → Pages** → **Source: Deploy from a branch** → Branch **`main`**,
Ordner **`/ (root)`** → **Save**. Jeder Commit auf `main` (auch die von Pages CMS)
deployt danach automatisch neu.

Die Datei [`CNAME`](CNAME) im Repo-Root enthält bereits `www.pinkpartygirls.ch` –
GitHub übernimmt die Domain automatisch, sobald Pages aktiv ist und das DNS steht.

### 2. DNS bei GoDaddy

GoDaddy → Domain `pinkpartygirls.ch` → **DNS → DNS Records**. GoDaddy kann kein
ALIAS am Root, daher vier A-Records:

| Typ | Name (Host) | Wert | TTL |
|---|---|---|---|
| `A` | `@` | `185.199.108.153` | 600 |
| `A` | `@` | `185.199.109.153` | 600 |
| `A` | `@` | `185.199.110.153` | 600 |
| `A` | `@` | `185.199.111.153` | 600 |
| `CNAME` | `www` | `olispanda.github.io` | 600 |

Optional zusätzlich IPv6 (vier `AAAA` auf `@`):
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`

**Vorhandene Einträge anpassen:** GoDaddys Standard-Parking-`A`-Record auf `@` und
den `CNAME www → @` (bzw. Parking) editieren/löschen, damit sie nicht kollidieren.
MX-Einträge (falls E-Mail an der Domain hängt) **nicht anfassen**.

### 3. HTTPS

Wenn das DNS greift (10 Min – 1 h), zeigt Repo → **Settings → Pages** einen grünen
Haken bei der Domain. Dann **Enforce HTTPS** anhaken (Zertifikat kommt in ~15 Min).
`pinkpartygirls.ch` (ohne www) leitet automatisch auf `www.pinkpartygirls.ch`.

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
