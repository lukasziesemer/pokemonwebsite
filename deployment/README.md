# Deployment Dateien

Dieses Verzeichnis enthaelt alle Dateien fuer das sichere Deployment auf Hetzner Cloud oder anderen VPS-Anbietern.

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `hetzner-setup.sh` | Automatisches Setup-Script fuer den Server |
| `deploy.sh` | Deployment-Script fuer Updates |
| `nginx-pokemonwebsite.conf` | Gehaertete Nginx Konfiguration mit Security Headers |
| `pokemonwebsite.service` | Systemd Service File (optional) |

## Sicherheits-Features

Die mitgelieferten Konfigurationen enthalten folgende Sicherheitsmassnahmen:

### Docker (docker-compose.yml)
- Container laufen als non-root User (`nextjs`)
- Read-only Filesystem fuer App-Container
- Memory Limits (max. 512MB)
- Datenbank nur intern erreichbar (kein Port nach aussen)
- App nur auf 127.0.0.1 gebunden (nicht weltweit)
- no-new-privileges Flag gesetzt

### Nginx (nginx-pokemonwebsite.conf)
- Rate Limiting fuer Login (max. 5 Versuche/Minute)
- Security Headers:
  - X-Frame-Options (Clickjacking-Schutz)
  - X-Content-Type-Options (MIME-Sniffing-Schutz)
  - X-XSS-Protection (XSS-Schutz)
  - Referrer-Policy
  - Permissions-Policy
- Server-Version versteckt
- SSL-Hardening vorbereitet (TLS 1.2+)

### Next.js (next.config.ts)
- Image Optimization nur fuer erlaubte Domains
- Verhindert DoS durch externe Bild-Requests

## Schnellstart

### 1. Server Setup

```bash
# Script auf Server kopieren
scp hetzner-setup.sh root@SERVER_IP:/root/

# Mit Server verbinden
ssh root@SERVER_IP

# Script ausfuehrbar machen und starten
chmod +x /root/hetzner-setup.sh
/root/hetzner-setup.sh
```

### 2. Projekt deployen

```bash
cd /opt
git clone https://github.com/lukasziesemer/pokemonwebsite.git
cd pokemonwebsite

# Sichere Passwoerter generieren
openssl rand -base64 24  # Datenbank
openssl rand -base64 32  # Session Secret
openssl rand -base64 16  # Admin Passwort

# .env konfigurieren
cp env.example .env
nano .env

# Container starten
docker compose up -d --build
```

### 3. Nginx konfigurieren

```bash
# Gehaertete Config kopieren
cp deployment/nginx-pokemonwebsite.conf /etc/nginx/sites-available/pokemon

# Domain anpassen
nano /etc/nginx/sites-available/pokemon

# Aktivieren
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/pokemon /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# SSL einrichten
certbot --nginx -d deine-domain.de
```

## Sicherheits-Checkliste

Vor dem Go-Live:

- [ ] Alle Passwoerter mit openssl rand generiert
- [ ] .env NICHT in Git committed (.gitignore pruefen)
- [ ] UFW Firewall aktiviert (nur 22, 80, 443)
- [ ] SSL-Zertifikat eingerichtet
- [ ] Fail2ban installiert
- [ ] Automatische Updates aktiviert

Nach dem Go-Live:

- [ ] Rate Limiting testen (6x Login -> 429)
- [ ] Container laeuft als non-root (`docker compose exec app whoami`)
- [ ] Datenbank nicht von aussen erreichbar
- [ ] Security Headers pruefen (z.B. securityheaders.com)

## Dokumentation

Detaillierte Anleitungen:
- [DOCKER_DEPLOYMENT.md](../DOCKER_DEPLOYMENT.md) - Docker Setup mit Sicherheits-Deep-Dive
- [HETZNER_DEPLOYMENT.md](../HETZNER_DEPLOYMENT.md) - Schritt-fuer-Schritt Hetzner Guide

## Haeufige Fehler

### Docker umgeht UFW Firewall

**Problem:** Docker oeffnet Ports direkt, UFW blockiert sie nicht.

**Loesung:** Ports immer an 127.0.0.1 binden:
```yaml
# FALSCH:
ports:
  - "3001:3000"

# RICHTIG:
ports:
  - "127.0.0.1:3001:3000"
```

### Rate Limiting greift nicht

**Loesung:** Nginx-Config pruefen, ob limit_req_zone definiert ist:
```nginx
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
```

### Container laeuft als root

**Loesung:** Dockerfile pruefen, ob USER Direktive vorhanden:
```dockerfile
USER nextjs
```
