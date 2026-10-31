# Serveroppsett for Sion Molde-appen (Docker)

Samme oppsett på PC-en (Docker Desktop) og på serveren (Ubuntu). Bygget på det offisielle
Supabase-oppsettet for egen server (alle filene her unntatt de under), med et eget lag for appen.

| Fil | Hva |
|---|---|
| `docker-compose.yml`, `volumes/`, `utils/`, `*.sh` | Supabase sine egne filer. **Endres ikke**, så `update.sh` kan oppdatere dem. |
| `docker-compose.sion.yml` | Appen (Caddy), sikkerhetskopi, porter låst til maskinen selv. PC og server. |
| `docker-compose.lokal.yml` | Bare PC-en: database i Docker-volum, e-postfanger, Firebase-emulatoren. |
| `sion/Caddyfile` | Hvilke filer som vises, ruting til Supabase, Studio med passord, testversjonen. |
| `sion/backup.sh` | Nattlig sikkerhetskopi til `backups/`. |
| `sion/firebase/` | Firebase-emulatoren i en container (erstatter Java + firebase-tools på PC-en). |
| `.env` | Passord og nøkler. **Aldri på GitHub** (står i `.gitignore`). Ulik på PC og server. |

## Hva som kjører

| Container | Hva | PC-en |
|---|---|---|
| `sion-web` (Caddy) | Appen + Supabase-API på samme adresse | http://localhost:8088 |
| | Supabase Studio, database-GUI (bruker `sion`, passord `DASHBOARD_PASSWORD` i `.env`) | http://localhost:3001 |
| | Testversjonen mot Firebase-emulatoren (som `lokal/start-test.bat`) | http://localhost:8090 |
| `supabase-*` | Postgres, innlogging, API, sanntid, filer, Studio | |
| `sion-backup` | pg_dump + filer hver natt kl. 03:00, beholder 14 dager | mappen `backups/` |
| `supabase-mail` | Fanger e-post fra innloggingen | http://localhost:9000 |
| `sion-firebase` | Firebase-emulatoren med dataene i `lokal/data` | |

**Status fase 1:** appen bruker fortsatt Firebase (ekte på 8088, emulatoren på 8090). Supabase står klar,
men er tom til `fb.js` er skrevet om (fase 2). Obs: http://localhost:8088 bruker den **ekte** Firebase-databasen.

## Bruk på PC-en

Start Docker Desktop, åpne en terminal i `server/`:

```
docker compose up -d          start alt (første gang tar det noen minutter)
docker compose ps             status
docker compose logs -f auth   logg for én tjeneste
docker compose down           stopp alt (dataene blir liggende)
docker compose exec sion-backup sh /backup.sh now    sikkerhetskopi nå
```

Containerne vises også i Docker Desktop (Containers → gruppen **sion-molde**, navnet settes av
`COMPOSE_PROJECT_NAME` i `.env`), der de kan startes, stoppes og leses logger fra.
Firebase-emulatoren og `lokal/start-test.bat` kan ikke kjøre samtidig (samme porter).

## Sette opp serveren (Ubuntu)

1. Installer Docker Engine og Compose-pluginen (docs.docker.com/engine/install/ubuntu).
2. `git clone https://github.com/sionmoldeapp/app.git` og gå til `app/server`.
3. Lag `.env` på serveren med **nye** hemmeligheter (ikke kopier fra PC-en), og sett:
   - `COMPOSE_FILE=docker-compose.yml:docker-compose.sion.yml` (uten `lokal`)
   - `SITE_URL`, `SUPABASE_PUBLIC_URL` = `https://<app-domenet>`, `API_EXTERNAL_URL` = `https://<app-domenet>/auth/v1`
   - Caddy tar HTTPS selv: `APP_SITE=<app-domenet>`, `APP_HTTP_PORT=80`, `APP_HTTPS_PORT=443`
   - Har serveren allerede en proxy på 80/443 (f.eks. for WordPress): `APP_SITE=:80`, `APP_HTTP_PORT=127.0.0.1:8088`, og la proxyen sende domenet dit.
   - SMTP-innstillingene til en ekte e-postkonto (for «Glemt passord» og bekreftelser).
4. `docker compose up -d`
5. Studio på serveren: `ssh -L 3001:127.0.0.1:3001 bruker@server`, så http://localhost:3001 på egen PC.
6. Oppdatering av appen: `git pull` (filene vises med en gang, Caddy leser dem direkte fra repoet).

## Sikkerhetskopi og gjenoppretting

Kopiene ligger i `server/backups/` på maskinen (foreløpig ikke kopiert andre steder).

```
docker compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists < backups/db_ÅÅÅÅ-MM-DD_TTMM.dump
tar -xzf backups/storage_ÅÅÅÅ-MM-DD_TTMM.tar.gz -C volumes/storage
```

## Oppdatere Supabase

Ta en sikkerhetskopi først. Deretter (fra Git Bash / Linux) `sh update.sh --dry-run`, `sh update.sh`,
`docker compose pull` og `docker compose up -d`. Bildeversjonene er låst i `docker-compose.yml`, så ingenting
oppdateres av seg selv.

## Tabellene og flytting av data (fase 2, påbegynt)

- `sion/sql/001_tabeller.sql`: 37 tabeller, én per samling i Firestore (undersamlinger som chatmeldinger, notater,
  vakter og teamsvar har egne tabeller). Kolonnene heter det samme som feltene i appen. Felt uten egen kolonne
  havner i `ekstra` (jsonb). Row Level Security er på overalt, uten regler ennå: API-et gir ingenting til appen
  før reglene er skrevet. Kjøres på nytt uten skade:
  `docker compose exec -T db psql -U postgres -d postgres < sion/sql/001_tabeller.sql`
- `sion/importer-firestore.js`: kopierer alt fra Firebase-emulatoren til tabellene (upsert, sletter ingenting).
  `node sion/importer-firestore.js --prove` viser først hva som ville blitt kopiert. Ekte data: hent dem inn i
  emulatoren med `lokal/hent-ekte-data.bat` først. Brukerkontoer (innlogging) flyttes ikke av dette skriptet.

## Neste faser

- **Fase 2:** `fb.js` skrives om mot Supabase (innlogging, tabeller, sanntid, filer), `firestore.rules` blir
  Row Level Security, og et skript flytter data og brukere. `sw.js` må da la `/auth/v1`, `/rest/v1` osv. gå forbi hurtigbufferen.
- **Fase 3:** en `worker`-container erstatter Apps Script (push med Web Push/VAPID, e-post, påminnelser, rydding).
