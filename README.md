# Pokemon Playthrough Dokumentations-Website

Eine vollstaendige Web-Applikation zur Dokumentation eines Parallel-Playthroughs von Pokemon-Spielen mit speziellen Regeln.

## Features

- **Oeffentliche Ansichten:**
  - **Dashboard** (`/`): Teams aller Spieler, Orden-Fortschritt mit Level-Caps, Defensiv-Abdeckung und Gesamtbilanz des aktuellen Runs
  - **Pokeroute** (`/pokeroute`): Uebersicht der aktuellen Teams und aller gefangenen Pokemon pro Route und Spieler
  - **Pokeradar** (`/pokeradar`): Vergleichstool fuer Basiswerte, Profile (Radar Chart) und Typen; Teams als Quelle waehlbar, Vergleichssets werden lokal im Browser gespeichert
  - **Tabelle** (`/tabelle`): Tabellarische Uebersicht aller Encounters
  - **Statistik** (`/statistik`): Run-Historie, Run-Vergleich, Trends und Auswertungen ueber alle Runs
  - **Streams** (`/streams`): Eingebettete YouTube-Streams der Spieler mit Team-Overlay und Run-Status
  - **Pokemon-Details**: Popouts mit editionsspezifischen Level-up-Attacken und Entwicklungskette (von PokeAPI, in der Datenbank gecacht)
  - **Live-Updates**: Ansichten aktualisieren sich automatisch (Polling alle 3 Sekunden); Ereignisse wie K.O., Orden oder Run-Ende werden als Overlay eingeblendet
  - Dark Mode und Umschaltung zwischen statischen und animierten Sprites

- **Admin-Panel:**
  - Admin-Uebersicht (`/admin`) mit Schnellzugriffen und Datenhinweisen
  - Spieler-Verwaltung (CRUD) inkl. Avatar-Upload mit Zuschnitt
  - Routen- und Encounter-Verwaltung direkt auf `/pokeroute` (als Admin eingeloggt)
  - Encounter-Links: verbundene Pokemon einer Route gemeinsam aktualisieren, inkl. Entwicklungen
  - Team-Builder (6 Pokemon pro Spieler)
  - K.O. und "Nicht gefangen" Status
  - Run-Verwaltung: Runs mit Spielversion (Gen 1-9) starten, beenden, wieder oeffnen und neu starten; Orden-Zaehler und Pause
  - Spielstand-System (Speichern/Laden, Download und Import als JSON)
  - CSV-Import fuer Routen und Encounters (`/admin/import`)
  - Stream-Verwaltung auf `/streams`
  - PokeAPI-Integration mit lokalem Cache (inkl. animierter GIF-Sprites)

- **Technische Features:**
  - Session-basierte Authentifizierung mit iron-session
  - Offline-First: Alle Pokemon-Daten werden lokal gecacht
  - Responsive Design mit Tailwind CSS
  - TypeScript fuer Type-Safety
  - PostgreSQL-Datenbank mit Prisma ORM
  - Docker-Support fuer einfaches Deployment
  - Unit-Tests mit Vitest, E2E-Tests mit Playwright

## Tech Stack

- **Framework**: Next.js 16 (App Router) mit React 19
- **Sprache**: TypeScript
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **Authentifizierung**: iron-session
- **Datenbank**: Prisma 7 (Driver Adapter `@prisma/adapter-pg`) + PostgreSQL 16
- **Bildverarbeitung**: sharp, react-easy-crop (Avatare)
- **API**: PokeAPI (gecacht)
- **Tests**: Vitest, Playwright
- **Deployment**: Docker + Docker Compose (Node.js 24)

---

## Schnellstart mit Docker (empfohlen)

### Voraussetzungen

- Docker Desktop installiert ([Download](https://www.docker.com/products/docker-desktop/))

### Setup

```bash
# 1. Repository klonen
git clone https://github.com/lukasziesemer/pokemonwebsite.git
cd pokemonwebsite

# 2. Umgebungsvariablen konfigurieren
cp env.example .env
# Bearbeite .env und setze sichere Passwoerter!

# 3. Container starten
docker compose up -d --build

# 4. App oeffnen
# http://localhost:3001
```

Bei jedem `docker compose up` legt der `migrate`-Service das Datenbankschema per `npx prisma db push` an bzw. aktualisiert es, bevor die App startet.

---

## Lokale Entwicklung (ohne Docker)

### Voraussetzungen

- Node.js 24+ installiert (siehe `.nvmrc`)
- PostgreSQL Datenbank

### Setup-Schritte

1. **Repository klonen:**
   ```bash
   git clone https://github.com/lukasziesemer/pokemonwebsite.git
   cd pokemonwebsite
   ```

2. **Dependencies installieren:**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren:**
   
   Erstelle eine `.env` Datei:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/pokemon"
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="dein-sicheres-passwort"
   SESSION_SECRET="ein-mindestens-32-zeichen-langer-geheimer-schluessel"
   ```

4. **Datenbank initialisieren:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   Der Prisma Client wird nach `generated/prisma` erzeugt (nicht eingecheckt). Seit Prisma 7 erzeugt `db push` den Client nicht mehr selbst, daher ist `prisma generate` separat noetig.

5. **Development Server starten:**
   ```bash
   npm run dev
   ```

6. **Im Browser oeffnen:**
   ```
   http://localhost:3000
   ```
   (Port 3001 gilt nur fuer das Docker-Setup.)

---

## Erste Schritte in der App

### 1. Als Admin einloggen

1. Navigiere zu `/login`
2. Melde dich mit den Credentials aus der `.env` an

### 2. Pokemon-Datenbank synchronisieren

1. Gehe zu `/admin/pokemon`
2. Klicke auf "Nur Gen 1-4 synchronisieren (1-493)"
3. Warte 5-10 Minuten, bis alle Pokemon geladen sind

### 3. Spieler erstellen

1. Gehe zu `/admin/players`
2. Fuege Spieler mit Namen und Farbe hinzu (optional mit Avatar)

### 4. Run starten

1. Gehe zu `/admin/gamesaves`
2. Starte einen neuen Run und waehle die Spielversion

### 5. Routen erstellen

1. Gehe (als Admin eingeloggt) zu `/pokeroute`
2. Erstelle Routen in der Spielreihenfolge
3. Alternativ: Routen und Encounters gesammelt per CSV unter `/admin/import` anlegen

### 6. Encounters dokumentieren

1. Gehe zu `/pokeroute`
2. Waehle pro Route und Spieler das gefangene Pokemon

### 7. Teams zusammenstellen

1. Gehe zu `/pokeroute`
2. Weise Pokemon den Team-Slots zu

---

## Projektstruktur

```
pokemonwebsite/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── auth/         # Login/Logout/Status
│   │   ├── admin/        # Admin-Endpunkte (geschuetzt)
│   │   ├── events/       # Public: Live-Updates (Polling)
│   │   ├── pokemon/      # Public: Pokemon-Liste, Details, Entwicklungen
│   │   ├── players/      # Public: Spieler & Teams
│   │   ├── pokeradar/    # Public: Teams fuer den Vergleich
│   │   ├── routes/       # Public: Routen & Encounters
│   │   ├── runs/         # Public: Run-Statistiken, Historie, Vergleich
│   │   ├── streams/      # Public: Streams
│   │   └── uploads/      # Auslieferung hochgeladener Avatare
│   ├── admin/            # Admin-Seiten (geschuetzt): Uebersicht, Spieler,
│   │                     # Pokemon-Cache, Spielstaende, CSV-Import
│   ├── pokeradar/        # Vergleichstool
│   ├── pokeroute/        # Routen-Dokumentation
│   ├── statistik/        # Run-Statistiken
│   ├── streams/          # Stream-Ansicht
│   ├── tabelle/          # Tabellenansicht
│   ├── login/            # Login-Seite
│   └── page.tsx          # Dashboard
├── components/            # React-Komponenten
├── lib/                   # Utility-Funktionen
├── prisma/
│   ├── schema.prisma     # Datenbankschema
│   ├── migrations/       # SQL-Migrationen
│   └── seed-versions.ts  # Seed fuer Spielversionen
├── generated/prisma/      # Generierter Prisma Client (nicht eingecheckt)
├── tests/                 # Unit-Tests (Vitest)
├── e2e/                   # E2E-Tests (Playwright)
├── scripts/               # Hilfsskripte (z.B. Orden-Bilder herunterladen)
├── deployment/           # Deployment-Dateien & Configs
├── Dockerfile            # Docker Build
├── docker-compose.yml    # Docker Orchestrierung
├── prisma.config.ts      # Prisma-CLI-Konfiguration
└── proxy.ts              # Login-Rate-Limiting & Security Headers
```

---

## Sicherheit

Diese Anwendung ist mit mehreren Sicherheitsmassnahmen ausgestattet:

### Docker-Sicherheit
- **Non-root Container**: App laeuft als User `nextjs` (UID/GID 10001), nicht als root
- **Keine Capabilities**: `cap_drop: ALL` und `no-new-privileges`
- **Read-only Filesystem**: Container kann nicht beschrieben werden (ausser `/tmp` und den Volumes fuer Avatare und Image-Cache)
- **Memory Limits**: Max. 512MB RAM verhindert DoS-Angriffe
- **Datenbank isoliert**: PostgreSQL nur intern erreichbar (kein Port nach aussen)
- **App nur lokal gebunden**: Port 3001 nur auf 127.0.0.1

### Nginx-Sicherheit
- **Rate Limiting**: Max. 5 Login-Versuche pro Minute pro IP
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **Server-Version versteckt**: Keine Nginx-Versionsnummer in Responses
- **SSL-Hardening**: TLS 1.2+ mit sicheren Ciphers

### Anwendungs-Sicherheit
- **Session-Cookies**: httpOnly, sameSite=strict, secure (in Production), 7 Tage gueltig
- **Passwort-Validierung**: SESSION_SECRET muss mind. 32 Zeichen lang sein
- **Admin-Login**: Timing-sicherer Vergleich; ohne gesetzte `ADMIN_USERNAME`/`ADMIN_PASSWORD` ist kein Login moeglich
- **Login-Rate-Limiting in der App** (`proxy.ts`): Max. 5 Versuche pro 15 Minuten pro IP (In-Memory)
- **Security Headers in der App** (`proxy.ts`): Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Image Optimization**: Nur erlaubte Domains (verhindert DoS)

### Wichtige Hinweise

1. **Sichere Passwoerter generieren:**
   ```bash
   openssl rand -base64 24  # Datenbank-Passwort
   openssl rand -base64 32  # Session Secret
   openssl rand -base64 16  # Admin-Passwort
   ```

2. **Niemals Standard-Passwoerter in Production verwenden!**

3. **.env Datei niemals in Git committen!**

Detaillierte Sicherheitsinformationen: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md#sicherheits-deep-dive)

---

## Deployment

### Docker auf Hetzner/VPS (empfohlen)

Siehe [HETZNER_DEPLOYMENT.md](HETZNER_DEPLOYMENT.md) fuer eine vollstaendige Anleitung mit:
- Server-Setup
- Docker-Installation
- SSL-Zertifikat
- Sicherheits-Haertung
- Backup-Strategien

**Kurzfassung:**
```bash
# Auf dem Server
git clone <repo>
cd pokemonwebsite
cp env.example .env
# .env bearbeiten mit sicheren Passwoertern!
docker compose up -d --build
```

### Detaillierte Docker-Anleitung

Siehe [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) fuer:
- Docker Installation
- Nginx Reverse Proxy
- SSL mit Let's Encrypt
- Sicherheits-Deep-Dive
- Troubleshooting

---

## Nuetzliche Befehle

### Docker

```bash
# Container starten
docker compose up -d

# Container stoppen
docker compose down

# Logs anzeigen
docker compose logs -f app

# Neu bauen nach Aenderungen
docker compose up -d --build

# Datenbank-Backup
docker compose exec db pg_dump -U pokemon pokemon > backup.sql
```

### Entwicklung

```bash
# Dev-Server
npm run dev

# Build
npm run build

# Production-Server (nach Build)
npm run start

# Linting
npm run lint

# Unit-Tests (Vitest, fuehrt vorher prisma generate aus)
npm run test

# E2E-Tests (Playwright, erwartet laufende App unter E2E_BASE_URL,
# Standard: http://127.0.0.1:3001; Admin-Login ueber ADMIN_USERNAME/ADMIN_PASSWORD).
# Achtung: Port 3001 ist auch die Docker-App mit echten Daten. Fuer lokale Laeufe
# eine eigene Testdatenbank nutzen (Name muss "e2e" enthalten) und befuellen mit:
# node e2e/seed-test-db.mjs
npm run test:e2e
npm run test:e2e:headed

# Unit- und E2E-Tests
npm run test:all

# Prisma Studio (DB-GUI)
npx prisma studio

# Datenbank-Schema aktualisieren
npx prisma db push
```

---

## API-Endpunkte

### Oeffentliche APIs
- `GET /api/pokemon` - Alle gecachten Pokemon
- `GET /api/players` - Alle Spieler mit Teams
- `GET /api/routes` - Alle Routen mit Encounters
- `GET /api/pokemon/[pokedexId]/details?gameVersion=...` - Editionsspezifische Details (Attacken, Entwicklungskette)
- `GET /api/pokemon/[pokedexId]/evolutions` - Vor- und Nachentwicklungen
- `GET /api/pokeradar/teams` - Teams fuer den Vergleich
- `GET /api/pokeradar/context` - Edition und Level-Cap des aktuellen Runs
- `GET /api/streams` - Alle Streams mit Teams und Run-Daten
- `GET /api/events/latest?since=...` - Live-Events und Aenderungsstaende (Polling)
- `GET /api/runs/stats`, `/api/runs/overview`, `/api/runs/history`, `/api/runs/history/[id]`, `/api/runs/compare`, `/api/runs/analytics` - Run-Statistiken
- `GET /api/uploads/avatars/[filename]` - Hochgeladene Avatare (auch ueber `/uploads/avatars/...` erreichbar)

### Auth APIs
- `POST /api/auth/login` - Admin-Login
- `POST /api/auth/logout` - Admin-Logout
- `GET /api/auth/status` - Auth-Status pruefen

### Admin APIs (geschuetzt)
- **Players**: `/api/admin/players`
- **Avatare**: `/api/admin/avatars/upload`, `/api/admin/avatars/[filename]`
- **Routes**: `/api/admin/routes` (inkl. `/[id]/knockout`, `/[id]/notcaught`, `/[id]/set-team-slot`)
- **Encounters**: `/api/admin/encounters` (inkl. `/[id]/evolve`)
- **Encounter-Links**: `/api/admin/encounter-links/[routeId]`, `/api/admin/encounter-links/audit`
- **Pokemon**: `/api/admin/pokemon/sync`, `/api/admin/pokemon/sync/progress`, `/api/admin/pokemon/sync-gifs`, `/api/admin/pokemon/add`, `/api/admin/pokemon/options`
- **Gamesaves**: `/api/admin/gamesaves` (inkl. `/[id]/download`, `/import`, `/load`, `/newgame`, `/reset`)
- **Runs**: `/api/admin/runs` (inkl. `/[id]/end`, `/[id]/reopen`, `/next`, `/restart`), `/api/runs/badges`, `/api/runs/pause`
- **Spielversionen**: `/api/admin/game-versions`
- **Streams**: `/api/admin/streams`
- **CSV-Import**: `/api/admin/import/csv`

---

## Troubleshooting

### Docker: Container startet nicht

```bash
docker compose logs app
docker compose logs db
```

### Prisma-Fehler nach Schema-Aenderungen

```bash
npx prisma generate
npx prisma db push
```

### Session-Secret zu kurz

`SESSION_SECRET` muss mindestens 32 Zeichen lang sein:
```bash
openssl rand -base64 32
```

### PokeAPI Synchronisierung schlaegt fehl

- Pruefe Internetverbindung
- PokeAPI koennte Rate-Limiting haben - warte und versuche es erneut

### Rate Limiting sperrt mich aus (HTTP 429)

Es gibt zwei Limits: Nginx (5 Login-Versuche pro Minute) und die App selbst (`proxy.ts`, 5 Versuche pro 15 Minuten pro IP). Warte bis zu 15 Minuten, starte den App-Container neu (der Zaehler liegt nur im Speicher) oder erhoehe temporaer das Limit in der Nginx-Config.

---

## Lizenz

Dieses Projekt ist fuer private Zwecke erstellt.
