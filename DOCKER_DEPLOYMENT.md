# Docker Deployment Guide

Vollständige Anleitung zum Deployen der Pokemon Website mit Docker auf einem Ubuntu Server (z.B. Hetzner Cloud).

## Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack (Gehärtet)                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │    Next.js      │  │   PostgreSQL    │  │     Migration       │  │
│  │      App        │◄─┤    Database     │◄─┤     Service         │  │
│  │ 127.0.0.1:3001  │  │  nur intern!    │  │   (runs once)       │  │
│  │  [read-only]    │  │    [expose]     │  │                     │  │
│  │  [non-root]     │  │                 │  │                     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
│         ▲                    │                                      │
│         │                    ▼                                      │
│         │             ┌─────────────┐                               │
│         │             │   Volume    │                               │
│         │             │postgres_data│                               │
│         │             └─────────────┘                               │
└─────────┼───────────────────────────────────────────────────────────┘
          │
    ┌─────┴─────┐
    │   Nginx   │ ◄── SSL/Let's Encrypt
    │  Port 80  │ ◄── Security Headers
    │  Port 443 │ ◄── Rate Limiting
    └───────────┘
          ▲
          │
      Internet
```

## Voraussetzungen

- Ubuntu 20.04+ Server (Hetzner, DigitalOcean, etc.)
- Root-Zugang oder sudo-Rechte
- Mindestens 1GB RAM, 10GB Speicherplatz
- Optional: Domain für SSL

---

## 🔒 Sicherheits-Übersicht

Diese Konfiguration enthält folgende Sicherheitsmaßnahmen:

| Maßnahme | Beschreibung | Schutz gegen |
|----------|--------------|--------------|
| **Non-root Container** | App läuft als User `nextjs` | Privilege Escalation |
| **Read-only Filesystem** | Container-Dateisystem nicht beschreibbar | Malware-Installation |
| **Memory Limits** | Max. 512MB RAM pro Container | DoS durch Memory Exhaustion |
| **no-new-privileges** | Verhindert Rechte-Erweiterung | Privilege Escalation |
| **Datenbank isoliert** | Kein Port nach außen (`expose`) | Datenbank-Angriffe |
| **App nur lokal** | `127.0.0.1:3001` statt `0.0.0.0:3001` | Direkte Angriffe |
| **Rate Limiting** | Max. 5 Login-Versuche/Minute | Brute-Force |
| **Security Headers** | X-Frame-Options, CSP, etc. | XSS, Clickjacking |
| **Image Optimization** | Nur erlaubte Domains | DoS durch Image-Proxy |

---

## Teil 1: Docker Installation

### Ubuntu System vorbereiten

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Benötigte Pakete installieren
sudo apt install -y ca-certificates curl gnupg lsb-release git
```

### Docker installieren

```bash
# Docker GPG Key hinzufügen
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Docker Repository hinzufügen
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker installieren
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker ohne sudo verwenden (optional, erfordert Neuanmeldung)
sudo usermod -aG docker $USER

# Installation testen
docker --version
docker compose version
```

---

## Teil 2: Projekt Setup

### Repository klonen

```bash
# Projekt-Verzeichnis erstellen
sudo mkdir -p /opt
cd /opt

# Projekt klonen (ersetze URL mit deinem Repository)
sudo git clone https://github.com/lukasziesemer/pokemonwebsite.git
cd pokemonwebsite

# Berechtigungen setzen
sudo chown -R $USER:$USER /opt/pokemonwebsite
```

### Umgebungsvariablen konfigurieren

```bash
# Vorlage kopieren
cp env.example .env

# Datei bearbeiten
nano .env
```

**⚠️ WICHTIG: Sichere Passwörter generieren!**

```bash
# Datenbank-Passwort generieren
openssl rand -base64 24

# Session Secret generieren (mindestens 32 Zeichen!)
openssl rand -base64 32

# Admin-Passwort generieren
openssl rand -base64 16
```

**Beispiel `.env` Datei:**

```env
# ================================
# PostgreSQL Database
# ================================
POSTGRES_USER=pokemon
POSTGRES_PASSWORD=abc123xyz789...  # ← openssl rand -base64 24
POSTGRES_DB=pokemon

# ================================
# Application
# ================================
# WICHTIG: Passwort muss mit POSTGRES_PASSWORD übereinstimmen!
DATABASE_URL=postgresql://pokemon:abc123xyz789...@db:5432/pokemon

# Session Secret (mindestens 32 Zeichen!)
SESSION_SECRET=def456uvw012...  # ← openssl rand -base64 32

# Admin Zugangsdaten
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ghi789rst345...  # ← openssl rand -base64 16
```

---

## Teil 3: Container starten

### Erster Start

```bash
cd /opt/pokemonwebsite

# Container bauen und starten
docker compose up -d --build

# Status prüfen (alle Container sollten "running" oder "healthy" sein)
docker compose ps
```

### Was passiert beim Start?

1. **db** (PostgreSQL): Startet die Datenbank (nur intern erreichbar!)
2. **migrate**: Wartet auf DB, führt `prisma db push` aus, erstellt Tabellen
3. **app** (Next.js): Startet erst nachdem migrate erfolgreich war

### Logs prüfen

```bash
# Alle Logs anzeigen
docker compose logs -f

# Nur App-Logs
docker compose logs -f app

# Migration-Logs (einmalig beim Start)
docker compose logs migrate
```

---

## Teil 4: App testen

Die App läuft jetzt auf `127.0.0.1:3001` (nur lokal erreichbar!):

```bash
# Lokaler Test (auf dem Server)
curl http://127.0.0.1:3001

# ⚠️ Von außen ist die App NICHT direkt erreichbar!
# Das ist beabsichtigt - Nginx wird davor geschaltet.
```

---

## Teil 5: Nginx Reverse Proxy mit SSL

### Nginx installieren

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Gehärtete Nginx-Konfiguration

Die mitgelieferte Konfiguration (`deployment/nginx-pokemonwebsite.conf`) enthält bereits:
- ✅ Security Headers (X-Frame-Options, X-Content-Type-Options, etc.)
- ✅ Rate Limiting für Login (5 Versuche/Minute)
- ✅ Server-Version versteckt
- ✅ SSL-Hardening vorbereitet

```bash
# Konfiguration kopieren
sudo cp deployment/nginx-pokemonwebsite.conf /etc/nginx/sites-available/pokemon

# Domain anpassen
sudo nano /etc/nginx/sites-available/pokemon
# Ersetze "deine-domain.de" mit deiner echten Domain
```

### Nginx aktivieren

```bash
# Default-Site deaktivieren
sudo rm -f /etc/nginx/sites-enabled/default

# Neue Config aktivieren
sudo ln -s /etc/nginx/sites-available/pokemon /etc/nginx/sites-enabled/

# Konfiguration testen
sudo nginx -t

# Nginx neustarten
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### SSL-Zertifikat mit Let's Encrypt

```bash
# SSL-Zertifikat erstellen
sudo certbot --nginx -d deine-domain.de -d www.deine-domain.de

# Folge den Anweisungen:
# - E-Mail eingeben
# - Terms of Service akzeptieren (Y)
# - HTTP zu HTTPS Redirect aktivieren (2)
```

Certbot konfiguriert Nginx automatisch für HTTPS und richtet Auto-Renewal ein.

### Firewall konfigurieren

```bash
# UFW aktivieren (falls noch nicht)
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Status prüfen
sudo ufw status
```

**⚠️ Wichtig:** UFW schützt NICHT vor Docker-Ports! Deshalb ist es wichtig, dass die App nur auf `127.0.0.1:3001` gebunden ist (bereits in `docker-compose.yml` konfiguriert).

---

## Teil 6: Erste Schritte in der App

1. **Website öffnen**: `https://deine-domain.de`

2. **Als Admin einloggen**: `/login`
   - Username: Was du in `.env` als `ADMIN_USERNAME` gesetzt hast
   - Passwort: Was du in `.env` als `ADMIN_PASSWORD` gesetzt hast

3. **Pokémon synchronisieren**: `/admin/pokemon`
   - Klicke auf "Nur Gen 1-4 synchronisieren (1-493)"
   - Warte 5-10 Minuten

4. **Spieler erstellen**: `/admin/players`

5. **Routen erstellen**: `/admin/routes`

6. **Encounters dokumentieren**: `/admin/encounters`

---

## 🔒 Sicherheits-Deep-Dive

### Warum diese Maßnahmen?

#### 1. Non-root Container

**Problem:** Standardmäßig laufen Docker-Container als root. Bei einer Sicherheitslücke (z.B. in einem npm-Paket) hat ein Angreifer sofort Root-Rechte.

**Lösung:** Im Dockerfile:
```dockerfile
# User erstellen
RUN addgroup --system --gid 10001 nodejs
RUN adduser --system --uid 10001 nextjs

# Als User ausführen
USER nextjs
```

#### 2. Datenbank nicht öffentlich

**Problem:** Bei `ports: "5432:5432"` ist die Datenbank weltweit erreichbar. Bots scannen ständig nach offenen Datenbank-Ports.

**Lösung:** In `docker-compose.yml`:
```yaml
# FALSCH (öffentlich):
# ports:
#   - "5432:5432"

# RICHTIG (nur intern):
expose:
  - "5432"
```

Die Datenbank ist nur für andere Container im selben Netzwerk erreichbar.

#### 3. App nur lokal binden

**Problem:** Bei `ports: "3001:3000"` umgeht Docker die UFW-Firewall!

**Lösung:**
```yaml
ports:
  - "127.0.0.1:3001:3000"
```

Die App ist nur lokal erreichbar. Traffic von außen MUSS durch Nginx.

#### 4. Rate Limiting

**Problem:** Ohne Schutz kann ein Angreifer unbegrenzt Passwörter ausprobieren.

**Lösung:** In Nginx:
```nginx
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

location /api/auth/login {
    limit_req zone=login_limit burst=3 nodelay;
    # ...
}
```

Max. 5 Login-Versuche pro Minute pro IP.

#### 5. Image Optimization einschränken

**Problem:** Next.js kann Bilder von beliebigen URLs laden und optimieren. Ein Angreifer könnte tausende große Bilder anfordern → Server-Crash.

**Lösung:** In `next.config.ts`:
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'raw.githubusercontent.com',
      pathname: '/PokeAPI/**',
    },
  ],
},
```

Nur Bilder von erlaubten Domains werden verarbeitet.

---

## Nützliche Befehle

### Container-Management

```bash
# Container stoppen
docker compose down

# Container stoppen UND Datenbank löschen (VORSICHT!)
docker compose down -v

# Container neustarten
docker compose restart

# Container neu bauen (nach Code-Änderungen)
docker compose up -d --build

# Nur App neustarten (schnell)
docker compose restart app
```

### Logs

```bash
# Live-Logs aller Container
docker compose logs -f

# Nur App-Logs
docker compose logs -f app

# Nur DB-Logs
docker compose logs -f db

# Letzte 100 Zeilen
docker compose logs --tail=100
```

### Datenbank

```bash
# PostgreSQL CLI öffnen
docker compose exec db psql -U pokemon -d pokemon

# SQL ausführen
docker compose exec db psql -U pokemon -d pokemon -c "SELECT * FROM \"Player\";"

# Backup erstellen
docker compose exec db pg_dump -U pokemon pokemon > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup wiederherstellen
docker compose exec -T db psql -U pokemon pokemon < backup.sql
```

### Container-Shell

```bash
# In App-Container
docker compose exec app sh

# In DB-Container
docker compose exec db sh
```

---

## Updates deployen

```bash
cd /opt/pokemonwebsite

# Neuesten Code holen
git pull origin main

# Container neu bauen und starten
docker compose up -d --build

# Logs prüfen
docker compose logs -f app
```

---

## Backup-Strategie

### Manuelles Backup

```bash
cd /opt/pokemonwebsite

# Datenbank-Backup
docker compose exec db pg_dump -U pokemon pokemon > backup_$(date +%Y%m%d).sql

# Backup komprimieren
gzip backup_*.sql
```

### Automatisches Backup (Cronjob)

```bash
# Crontab bearbeiten
crontab -e

# Tägliches Backup um 3 Uhr nachts
0 3 * * * cd /opt/pokemonwebsite && docker compose exec -T db pg_dump -U pokemon pokemon | gzip > /opt/backups/pokemon_$(date +\%Y\%m\%d).sql.gz

# Alte Backups nach 30 Tagen löschen
0 4 * * * find /opt/backups -name "*.sql.gz" -mtime +30 -delete
```

### Backup-Verzeichnis erstellen

```bash
sudo mkdir -p /opt/backups
sudo chown $USER:$USER /opt/backups
```

---

## Troubleshooting

### Container startet nicht

```bash
# Status prüfen
docker compose ps -a

# Logs prüfen
docker compose logs app
docker compose logs db
docker compose logs migrate
```

### Datenbank-Verbindungsfehler

1. Prüfe ob `db` Container läuft: `docker compose ps`
2. Prüfe `DATABASE_URL` in `.env` (Passwort muss mit `POSTGRES_PASSWORD` übereinstimmen)
3. Warte bis Healthcheck grün ist

### Port 3001 bereits belegt

```bash
# Prüfen was Port 3001 belegt
sudo lsof -i :3001

# Prozess beenden oder anderen Port in docker-compose.yml verwenden
```

### SSL-Zertifikat erneuern

```bash
# Manuell erneuern
sudo certbot renew

# Auto-Renewal testen
sudo certbot renew --dry-run
```

### Speicherplatz voll

```bash
# Docker aufräumen
docker system prune -a

# Nur ungenutzte Images
docker image prune -a

# Alte Backups löschen
find /opt/backups -mtime +30 -delete
```

### Migration schlägt fehl

```bash
# Logs prüfen
docker compose logs migrate

# Manuell ausführen (im Builder-Image)
docker compose run --rm migrate npx prisma db push --skip-generate
```

### Rate Limiting greift (HTTP 429)

Falls du dich selbst ausgesperrt hast:
```bash
# Warte 1 Minute oder passe Nginx-Config temporär an
sudo nginx -s reload
```

---

## Monitoring

### Systemressourcen

```bash
# Docker Stats
docker stats

# Speicherplatz
df -h

# Memory
free -m
```

### Logs überwachen

```bash
# Nginx Access-Logs
sudo tail -f /var/log/nginx/access.log

# Nginx Error-Logs
sudo tail -f /var/log/nginx/error.log

# Rate-Limit Verstöße suchen
sudo grep "limiting requests" /var/log/nginx/error.log
```

---

## 🔒 Sicherheits-Checkliste

### Vor dem Deployment

- [ ] Sichere Passwörter generiert (`openssl rand -base64 ...`)
- [ ] `.env` Datei NICHT in Git committed
- [ ] Alle Standard-Passwörter geändert

### Nach dem Deployment

- [ ] Firewall aktiviert (nur 22, 80, 443)
- [ ] SSL-Zertifikat eingerichtet
- [ ] HTTPS-Redirect funktioniert
- [ ] Website nur über Nginx erreichbar (nicht direkt Port 3001)

### Regelmäßig prüfen

- [ ] System-Updates installieren (`apt update && apt upgrade`)
- [ ] Docker-Images aktualisieren (`docker compose pull`)
- [ ] SSL-Zertifikat gültig (`sudo certbot certificates`)
- [ ] Backups vorhanden und aktuell
- [ ] Logs auf Anomalien prüfen

### Fortgeschritten (optional)

- [ ] SSH Root-Login deaktiviert
- [ ] SSH nur mit Key-Auth (Passwort deaktiviert)
- [ ] Fail2ban installiert
- [ ] Automatische Sicherheits-Updates aktiviert
- [ ] HSTS aktiviert (nach SSL-Test)

---

## Weiterführende Sicherheitsmaßnahmen

### Automatische Sicherheits-Updates

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Fail2ban für SSH

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### SSH absichern

```bash
sudo nano /etc/ssh/sshd_config

# Folgende Zeilen ändern/hinzufügen:
PermitRootLogin no
PasswordAuthentication no

sudo systemctl restart sshd
```

**⚠️ Wichtig:** Stelle sicher, dass dein SSH-Key funktioniert, bevor du Passwort-Auth deaktivierst!

### HSTS aktivieren (nach erfolgreichem SSL-Test)

In der Nginx-Config die HSTS-Zeile einkommentieren:
```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

Dies zwingt Browser, nur noch HTTPS zu verwenden.
