# Hetzner Cloud Deployment mit Docker

Vollstaendige Schritt-fuer-Schritt-Anleitung zum Deployen der Pokemon Website auf einem Hetzner Cloud Server mit Docker.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Hetzner Server erstellen](#schritt-1-hetzner-cloud-server-erstellen)
3. [SSH-Zugang einrichten](#schritt-2-ssh-zugang-einrichten)
4. [Server-Setup](#schritt-3-server-setup)
5. [Projekt deployen](#schritt-4-projekt-deployen)
6. [Domain und SSL konfigurieren](#schritt-5-domain--ssl-konfigurieren)
7. [App testen](#schritt-6-app-testen)
8. [Sicherheit haerten](#schritt-7-sicherheit-haerten)
9. [Wartung und Updates](#wartung--updates)

---

## Voraussetzungen

- Hetzner Cloud Account ([Registrierung](https://console.hetzner.cloud/))
- SSH-Client (Windows: PowerShell, PuTTY oder Windows Terminal)
- Optional: Eigene Domain

### Geschaetzte Kosten

| Ressource | Kosten |
|-----------|--------|
| Hetzner CPX11 (2 vCPU, 2GB RAM) | ca. 4,75 EUR/Monat |
| Domain (optional) | ca. 1 EUR/Jahr |
| **Gesamt** | **ca. 5 EUR/Monat** |

---

## Sicherheits-Features dieser Konfiguration

| Massnahme | Status | Beschreibung |
|----------|--------|--------------|
| Non-root Container | Aktiv | App laeuft als User nextjs, nicht als root |
| Datenbank isoliert | Aktiv | PostgreSQL nur intern erreichbar |
| App nur lokal | Aktiv | Port 3001 nur auf 127.0.0.1 gebunden |
| Read-only Container | Aktiv | App-Filesystem nicht beschreibbar |
| Memory Limits | Aktiv | Max. 512MB RAM verhindert DoS |
| Rate Limiting | Aktiv | Login: max. 5 Versuche/Minute |
| Security Headers | Aktiv | X-Frame-Options, CSP, etc. |
| UFW Firewall | Aktiv | Nur Ports 22, 80, 443 offen |

---

## Schritt 1: Hetzner Cloud Server erstellen

### 1.1 In Hetzner Console einloggen

1. Gehe zu [console.hetzner.cloud](https://console.hetzner.cloud/)
2. Erstelle ein Projekt (falls noch keins vorhanden)
3. Klicke auf **Add Server**

### 1.2 Server-Konfiguration

| Einstellung | Empfehlung |
|-------------|------------|
| **Location** | Nuernberg (nbg1) oder Falkenstein (fsn1) |
| **Image** | Ubuntu 22.04 |
| **Type** | CPX11 (2 vCPU, 2 GB RAM) - reicht fuer die App |
| **Volume** | Nicht benoetigt |
| **Network** | Default |
| **SSH Key** | Deinen SSH-Key hinzufuegen (siehe Schritt 2) |
| **Name** | z.B. pokemon-server |

### 1.3 Server erstellen

Klicke auf **Create and Buy Now**. Der Server ist in ca. 30 Sekunden bereit.

**Notiere dir die IP-Adresse!** (z.B. 65.108.xxx.xxx)

---

## Schritt 2: SSH-Zugang einrichten

### 2.1 SSH-Key erstellen (falls noch nicht vorhanden)

**Windows (PowerShell):**
```powershell
# SSH-Key generieren
ssh-keygen -t ed25519 -C "deine-email@example.com"

# Standard-Speicherort akzeptieren: C:\Users\DEIN_NAME\.ssh\id_ed25519

# Oeffentlichen Key anzeigen (kopieren!)
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

**Linux/Mac:**
```bash
ssh-keygen -t ed25519 -C "deine-email@example.com"
cat ~/.ssh/id_ed25519.pub
```

### 2.2 SSH-Key zu Hetzner hinzufuegen

1. In Hetzner Console: **Security** -> **SSH Keys** -> **Add SSH Key**
2. Fuege den oeffentlichen Key ein (beginnt mit ssh-ed25519)
3. Namen vergeben (z.B. Mein Laptop)

### 2.3 Mit Server verbinden

```bash
# Ersetze SERVER_IP mit deiner IP-Adresse
ssh root@SERVER_IP
```

Beim ersten Mal: yes eingeben um den Fingerprint zu akzeptieren.

---

## Schritt 3: Server-Setup

### 3.1 System aktualisieren

```bash
apt update && apt upgrade -y
```

### 3.2 Docker installieren

```bash
# Benoetigte Pakete
apt install -y ca-certificates curl gnupg lsb-release git

# Docker GPG Key
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Docker Repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker installieren
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Testen
docker --version
docker compose version
```

### 3.3 Nginx installieren

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### 3.4 Firewall konfigurieren

```bash
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

**Wichtig:** UFW schuetzt NICHT vor Docker-Ports! Deshalb sind unsere Container so konfiguriert, dass sie nur auf 127.0.0.1 lauschen.

---

## Schritt 4: Projekt deployen

### 4.1 Repository klonen

```bash
# In /opt wechseln
cd /opt

# Projekt klonen (ersetze URL mit deinem Repository)
git clone https://github.com/lukasziesemer/pokemonwebsite.git

cd pokemonwebsite
```

### 4.2 Umgebungsvariablen konfigurieren

```bash
# Vorlage kopieren
cp env.example .env

# Sichere Passwoerter generieren
echo "Datenbank-Passwort:"
openssl rand -base64 24

echo "Session Secret:"
openssl rand -base64 32

echo "Admin-Passwort:"
openssl rand -base64 16

# Datei bearbeiten
nano .env
```

**Inhalt anpassen (mit den generierten Passwoertern):**

```env
# ================================
# PostgreSQL Database
# ================================
POSTGRES_USER=pokemon
POSTGRES_PASSWORD=HIER-GENERIERTES-DB-PASSWORT
POSTGRES_DB=pokemon

# ================================
# Application
# ================================
DATABASE_URL=postgresql://pokemon:HIER-GENERIERTES-DB-PASSWORT@db:5432/pokemon

# Session Secret (der 32+ Zeichen String)
SESSION_SECRET=HIER-GENERIERTES-SESSION-SECRET

# Admin Zugangsdaten
ADMIN_USERNAME=admin
ADMIN_PASSWORD=HIER-GENERIERTES-ADMIN-PASSWORT
```

Speichern: Ctrl+O -> Enter -> Ctrl+X

### 4.3 Container starten

```bash
# Container bauen und starten
docker compose up -d --build

# Warten bis alles laeuft (ca. 1-2 Minuten)
docker compose ps

# Alle Container sollten running oder healthy zeigen
```

### 4.4 Logs pruefen

```bash
# Migration-Logs (sollte "Your database is now in sync" zeigen)
docker compose logs migrate

# App-Logs
docker compose logs app
```

---

## Schritt 5: Domain und SSL konfigurieren

### Option A: Mit eigener Domain (empfohlen)

#### 5.1 DNS konfigurieren

Bei deinem Domain-Anbieter:
- **A-Record**: @ -> DEINE_SERVER_IP
- **A-Record**: www -> DEINE_SERVER_IP

DNS-Propagation kann bis zu 24 Stunden dauern (meist aber nur Minuten)

#### 5.2 Gehaertete Nginx-Konfiguration verwenden

```bash
# Mitgelieferte sichere Konfiguration kopieren
cp /opt/pokemonwebsite/deployment/nginx-pokemonwebsite.conf /etc/nginx/sites-available/pokemon

# Domain anpassen
nano /etc/nginx/sites-available/pokemon
# Ersetze alle "deine-domain.de" mit deiner echten Domain
```

Die mitgelieferte Konfiguration enthaelt bereits:
- Rate Limiting fuer Login-Endpunkt
- Security Headers (X-Frame-Options, X-Content-Type-Options, etc.)
- Server-Version versteckt
- SSL-Hardening vorbereitet

Aktivieren:

```bash
# Default-Config entfernen
rm -f /etc/nginx/sites-enabled/default

# Neue Config aktivieren
ln -s /etc/nginx/sites-available/pokemon /etc/nginx/sites-enabled/

# Testen
nginx -t

# Nginx neustarten
systemctl restart nginx
```

#### 5.3 SSL-Zertifikat erstellen

```bash
certbot --nginx -d deine-domain.de -d www.deine-domain.de
```

Folge den Anweisungen:
1. E-Mail eingeben
2. Terms akzeptieren: Y
3. Redirect zu HTTPS: 2 (empfohlen)

**Fertig!** Deine Website ist jetzt unter https://deine-domain.de erreichbar.

---

### Option B: Ohne Domain (nur IP-Zugriff)

```bash
nano /etc/nginx/sites-available/pokemon
```

```nginx
# Rate Limiting Zone
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

server {
    listen 80;
    server_name _;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate Limited Login
    location /api/auth/login {
        limit_req zone=login_limit burst=3 nodelay;
        limit_req_status 429;
        
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    server_tokens off;
}
```

```bash
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/pokemon /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

Website erreichbar unter: http://DEINE_SERVER_IP

---

## Schritt 6: App testen

### 6.1 Website oeffnen

- Mit Domain: https://deine-domain.de
- Ohne Domain: http://DEINE_SERVER_IP

### 6.2 Als Admin einloggen

1. Gehe zu /login
2. Melde dich mit den Credentials aus .env an

### 6.3 Pokemon-Datenbank fuellen

1. Gehe zu /admin/pokemon
2. Klicke auf **Nur Gen 1-4 synchronisieren (1-493)**
3. Warte 5-10 Minuten bis alle Pokemon geladen sind

### 6.4 Spieler und Routen erstellen

1. /admin/players - Spieler hinzufuegen
2. /admin/routes - Routen erstellen
3. /admin/encounters - Gefangene Pokemon dokumentieren

---

## Schritt 7: Sicherheit haerten

### 7.1 Automatische Sicherheits-Updates aktivieren

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
# Waehle "Yes" fuer automatische Updates
```

### 7.2 Fail2ban installieren (SSH Brute-Force Schutz)

```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Status pruefen
fail2ban-client status sshd
```

### 7.3 SSH absichern (optional, aber empfohlen)

**Stelle sicher, dass dein SSH-Key funktioniert, BEVOR du das machst!**

```bash
nano /etc/ssh/sshd_config
```

Aendere/fuege hinzu:
```
PermitRootLogin prohibit-password
PasswordAuthentication no
```

```bash
systemctl restart sshd
```

### 7.4 HSTS aktivieren (nach erfolgreichem SSL-Test)

Wenn dein SSL-Zertifikat funktioniert und du sicher bist, dass alles laeuft:

```bash
nano /etc/nginx/sites-available/pokemon
```

Fuege im HTTPS-Server-Block hinzu:
```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

```bash
nginx -t
systemctl reload nginx
```

### 7.5 Sicherheits-Check durchfuehren

```bash
# Offene Ports pruefen (sollte nur 22, 80, 443 zeigen)
ss -tlnp

# UFW Status
ufw status verbose

# Docker Container als non-root pruefen
docker compose exec app whoami
# Sollte "nextjs" ausgeben, NICHT "root"

# Rate Limiting testen (6x schnell hintereinander)
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://deine-domain.de/api/auth/login
done
# Die letzten Requests sollten "429" zurueckgeben
```

---

## Wartung und Updates

### Code-Updates deployen

```bash
cd /opt/pokemonwebsite

# Neuesten Code holen
git pull origin main

# Container neu bauen
docker compose up -d --build
```

### Backups

Auf dem Server sichert ein systemd-Timer, kein Cronjob: `pokemon-backup.timer` startet jede Nacht um 03:00 Uhr `pokemon-backup.service`. Dabei passiert Folgendes:

- Datenbank-Dump mit `pg_dump -Fc`, danach eine Probe-Wiederherstellung in eine Test-Datenbank
- Sicherung von Dump, Avatar-Uploads, `.env` und `docker-compose.yml` mit borgmatic in ein verschluesseltes Repository auf der Hetzner Storage Box
- Aufbewahrung: 14 taegliche, 8 woechentliche und 12 monatliche Archive, dazu die letzten 14 Dumps lokal in `/var/backups/pokemon`
- Ueberwachung ueber healthchecks.io: Bleibt das Backup aus oder schlaegt es fehl, kommt eine Mail

#### Manuelles Backup

Vor jedem Deploy ein Backup starten: Der `migrate`-Service fuehrt bei `docker compose up` `prisma db push --accept-data-loss` aus.

```bash
sudo systemctl start pokemon-backup.service
systemctl show -p Result --value pokemon-backup.service  # erwartet: success
```

Dumps nicht von Hand nach `/opt` oder ins Projekt legen. Sie enthalten Nutzerdaten und waeren dort je nach Rechten fuer andere Benutzer lesbar.

### Container-Befehle

```bash
# Status anzeigen
docker compose ps

# Logs anzeigen
docker compose logs -f app

# Container neustarten
docker compose restart

# Container stoppen
docker compose down

# Alles loeschen (VORSICHT: auch Datenbank!)
docker compose down -v
```

### System-Updates

```bash
# Ubuntu Updates
apt update && apt upgrade -y

# Docker Images aktualisieren
docker compose pull
docker compose up -d
```

---

## Troubleshooting

### Container startet nicht

```bash
docker compose logs migrate
docker compose logs app
docker compose logs db
```

### Datenbank-Verbindungsfehler

- Pruefe DATABASE_URL in .env
- Stelle sicher, dass das Passwort mit POSTGRES_PASSWORD uebereinstimmt

### SSL-Zertifikat erneuern

```bash
# Automatisch (sollte via Cron laufen)
certbot renew

# Status pruefen
certbot certificates
```

### Rate Limiting sperrt mich aus (HTTP 429)

Warte 1 Minute oder erhoehe temporaer das Limit:
```bash
nano /etc/nginx/sites-available/pokemon
# Aendere "rate=5r/m" zu "rate=30r/m"
nginx -s reload
```

### Nginx-Fehler

```bash
nginx -t
tail -f /var/log/nginx/error.log
```

### Speicherplatz voll

```bash
# Docker aufraeumen
docker system prune -a
```

---

## Schnellreferenz

| Aktion | Befehl |
|--------|--------|
| Container starten | docker compose up -d |
| Container stoppen | docker compose down |
| Logs anzeigen | docker compose logs -f |
| Neu bauen | docker compose up -d --build |
| DB-Backup | docker compose exec db pg_dump -U pokemon pokemon > backup.sql |
| DB-Restore | docker compose exec -T db psql -U pokemon pokemon < backup.sql |
| SSL erneuern | sudo certbot renew |
| Nginx testen | sudo nginx -t |

---

## Sicherheits-Checkliste

### Initiales Setup

- [ ] SSH-Key statt Passwort verwendet
- [ ] Sichere Passwoerter generiert (nicht "admin"!)
- [ ] .env Datei NICHT in Git committed
- [ ] UFW Firewall aktiviert

### Nach dem Deployment

- [ ] SSL-Zertifikat eingerichtet
- [ ] Website nur ueber HTTPS erreichbar
- [ ] Automatische Updates aktiviert
- [ ] Fail2ban installiert

### Regelmaessig pruefen

- [ ] System-Updates (apt update && apt upgrade)
- [ ] SSL-Zertifikat gueltig (certbot certificates)
- [ ] Backups vorhanden und aktuell
- [ ] Logs auf Anomalien (docker compose logs)

---

## Support

Bei Problemen:
1. Logs pruefen: docker compose logs
2. Container-Status: docker compose ps
3. Nginx-Status: systemctl status nginx
4. Firewall-Status: ufw status
