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
| | Testversjonen mot Supabase (`supa.js`) | http://localhost:8091 |
| `supabase-*` | Postgres, innlogging, API, sanntid, filer, Studio | |
| `sion-backup` | pg_dump + filer hver natt kl. 03:00, beholder 14 dager | mappen `backups/` |
| `supabase-mail` | Fanger e-post fra innloggingen | http://localhost:9000 |
| `sion-firebase` | Firebase-emulatoren med dataene i `lokal/data` | |

**Status:** appen kan kjøre mot Supabase (testversjonen på 8091), men den ekte appen bruker fortsatt Firebase
(ekte på 8088, emulatoren på 8090). Obs: http://localhost:8088 bruker den **ekte** Firebase-databasen.

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
  havner i `ekstra` (jsonb). Row Level Security er på overalt (reglene ligger i 002). Kjøres på nytt uten skade:
  `docker compose exec -T db psql -U postgres -d postgres < sion/sql/001_tabeller.sql`
- `sion/sql/002_tilgang.sql`: tilgangsreglene (Row Level Security), oversatt fra `firestore.rules`. Regler for hvem som
  leser og skriver hvilke rader; «bare disse feltene kan endres» ligger i triggere (`sion.sjekk_*`); tellere, påmelding,
  varselkoder og påminnelser skrives via funksjoner (`rsvp_tell`, `nyhet_sett`, `meld_paa`, `meld_av`, `kode_lagre`,
  `kode_fjern`, `paaminnelse_fjern`). Kjøres etter 001, og på nytt etter hver endring:
  `docker compose exec -T db psql -U postgres -d postgres < sion/sql/002_tilgang.sql`
- `sion/test-tilgang.js`: tester reglene som besøkende, fremmed, medlem, gruppeleder og administrator (75 tester, lager og
  sletter egne testbrukere). Kjør etter hver endring av reglene: `node sion/test-tilgang.js`. Bare lokalt.
- `sion/importer-firestore.js`: kopierer alt fra Firebase-emulatoren til tabellene (upsert, sletter ingenting).
  `node sion/importer-firestore.js --prove` viser først hva som ville blitt kopiert. Ekte data: hent dem inn i
  emulatoren med `lokal/hent-ekte-data.bat` først. Brukerkontoer (innlogging) flyttes ikke av dette skriptet.

## Appen mot Supabase (fase 2)

- `fb.js` velger database ved oppstart: på port 8091 lastes `supa.js`, ellers Firebase som før. `supa.js` etterligner de
  Firebase-funksjonene `fb.js` bruker (dokumenter, spørringer, batcher, sanntid og innlogging) mot tabellene, så resten
  av `fb.js` og hele `index.html` er felles. Supabase-klienten ligger i `lib/` (ikke fra CDN, av personvernhensyn).
- `sion-konfig.json` lages av Caddy fra `ANON_KEY` i `.env` (offentlig nøkkel), så nøkkelen ikke ligger i repoet.
- Kolonnelisten `KOL` øverst i `supa.js` må holdes lik tabellene. Ny kolonne: legg den til i `001_tabeller.sql`
  (`alter table … add column`), og i `KOL`. Felt uten kolonne havner i `ekstra` og virker likevel.
- Nye brukere og «Glemt passord?»: e-post med lenke, lenken åpner appen med `?velg=1`, og brukeren velger passord der.
  Lokalt fanges e-posten i Inbucket (http://localhost:9000). Lenken må peke til en adresse i `SITE_URL` eller
  `ADDITIONAL_REDIRECT_URLS` i `.env`.
- `sql/003_sanntid_og_konto.sql`: sanntid for chat, ringing og avstemninger, og `slett_min_konto()` for «Slett meg».
- **Rekkefølge ved nyoppsett:** 001, 002, så 003–010 i nummerrekkefølge. `002_tilgang.sql` sletter alle regler før den lager nye, så **kjører du 002 på nytt, må 003 og alle senere filer kjøres på nytt** (ellers forsvinner reglene for tale, lesekvitteringer og anrop). `node server/sion/test-tilgang.js` sjekker at alt henger sammen (125 tester).
- `010_anropsstatus.sql` og anropsstatuser: den som ringer ser Prøver å nå, Ringer hos, Avvist, Opptatt, Ingen svar (45 s) eller Forbindelsesfeil; mottakeren bekrefter levering (`chat_ring_event`). Klientkoden testes av `server/sion/anrop.test.js`.
- Virker ikke ennå mot Supabase: push-varsler, e-post via Apps Script (varsler, notat, forbønn, saker, velkomst),
  anonym forbønn uten innlogging. Det kommer i fase 3. E-postene fra innloggingen er på engelsk (malene kan oversettes).
- `importer-firestore.js` oppdaterer bare felt som finnes i kilden; felt som er fjernet i Firestore blir stående.

## Neste faser

- **Resten av fase 2:** flytte de ekte dataene og brukerne (brukerne må velge nytt passord; Firebase sine passord kan
  ikke flyttes), og slå på Supabase for den ekte adressen på serveren (`SUPA` øverst i `fb.js`).
- **Fase 3:** en `worker`-container erstatter Apps Script (push med Web Push/VAPID, e-post, påminnelser, rydding).

## E-post fra innloggingen (passordlenker og nye brukere)

- Avsender: Gmail via SMTP (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = Gmail-adressen, `SMTP_PASS` = et **app-passord** fra Google, ikke det vanlige passordet). Krever totrinnsbekreftelse på Google-kontoen. Gmail tillater ca. 500 e-poster i døgnet.
- Norske maler i `sion/epost/` (ny bruker, nytt passord, invitasjon, ny e-post, innlogging). `sion-web` viser dem på den interne porten 8099, og `auth` henter dem (`GOTRUE_MAILER_TEMPLATES_*` og emnene `GOTRUE_MAILER_SUBJECTS_*` i `docker-compose.sion.yml`). Endres en mal: `docker restart sion-web supabase-auth`.
- Lenkene i e-posten bygges fra `API_EXTERNAL_URL` og `SITE_URL` i `.env`. På PC-en peker de til Tailscale-adressen (`lokal/start-tailscale-supabase.bat` må kjøre), på serveren til serverens domene.
- Endringer i `.env` krever at `auth` lages på nytt: `docker compose -f docker-compose.yml -f docker-compose.sion.yml -f docker-compose.lokal.yml up -d auth` (på serveren uten `docker-compose.lokal.yml`).
- Tilbake til Inbucket (falsk postkasse, http://localhost:9000): `SMTP_HOST=supabase-mail`, `SMTP_PORT=2500`, `SMTP_USER` og `SMTP_PASS` tomme.

## Push-varsler (sion-varsel)

Appen sender varsler gjennom `/varsel` på samme adresse som appen (Caddy sender det videre til containeren `sion-varsel`, se `sion/varsel/varsel.js`). Det er de samme kallene som tidligere gikk til Apps Script, så `index.html` og `fb.js` bruker `PUSH_URL` uendret.

- Enhetene registrerer seg med Web Push (VAPID). Abonnementet lagres som tekst `{e: endpoint, p: p256dh, a: auth}` i `push_tokens` (funksjonen `kode_lagre`).
- Nøklene ligger i `server/.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Den offentlige nøkkelen leses av appen fra `sion-konfig.json`. Bytter du nøkler, må alle slå på varsler på nytt.
- Støttet: vanlige varsler (administrator eller gruppeleder), beskjeder i Sionchat (`beskjed`), planlagte varsler (`scheduled`) og påminnelser (`reminders`), sjekket hvert minutt.
- Automatiske varsler (`sion/varsel/auto.js`, hvert minutt, hvert tilfelle én gang i tabellen `varsel_sendt`, `sion/sql/004_varsel.sql`): vakt dagen før (etter kl. 17), politiattest 60 dager før utløp (til personen og administratorer/gruppeledere), samlingspåminnelse `remindH` timer før (grupper med `remind`), bookingpåminnelse til vertskap og «kvelden før» til teamet.
- E-post (`sion/varsel/epost.js`, SMTP fra `.env`, samme Gmail som innloggingen): møtenotat til egen adresse (`notat`), nye forbønner (`bonn`, administrator og bønneledere), saker til lederrådet (`saker`), velkomst til nye brukere (`velkomst`), påmeldte (`paameldte`) og hilsen til medlemmer (`epost`, blindkopi 40 om gangen). Samme tilgangssjekker og «vent 8 sekunder» som i Apps Script.
- Fakturapåminnelse hvert 10. minutt (1 døgn etter at en utleie er over, gjentas etter `fakturaVentH`), til `settings/utleie.fakturaEpost` eller post@sionmolde.no. **På PC-en** overstyrer `FAKTURA_TIL` (i `docker-compose.lokal.yml`, = `SMTP_ADMIN_EMAIL`), så testdata aldri gir e-post til kontoret.
- Daglig rydding etter kl. 03 (`ryddGamle`): forbønner etter 30 dager, påmeldinger 90 dager etter arrangementet, samtaler etter 365 dager uten bruk.
- Uten innlogging (`sion/varsel/apen.js`): anonyme forbønner (`bonnutfordring`/`bonnanon`: signert regnestykke, brukes én gang, 3 s–15 min, maks 10 i timen og 40 i døgnet) og leietakerens skjema (`selvlenke` for administrator/gruppen Utleie, `selvhent`, `selvsend`; tabellen `selvlenker`, `sion/sql/005_selvlenker.sql`). Lenken bruker `APP_URL` (= `SITE_URL`).
- Dermed brukes ikke Apps Script lenger av Supabase-versjonen.
- Start/oppdatering: `docker compose up -d sion-varsel` (installerer pakkene første gang). Logg: `docker logs sion-varsel`.

## Tale i Sionchat

`sion/sql/006_tale.sql`: tabellen `tale` (tilbud og svar for WebRTC i private samtaler, med regler og sanntid). Lyden går direkte mellom telefonene. Appen bruker Googles STUN-tjener; for samtaler over mobilnett som stopper direkte forbindelse trengs en TURN-tjener (for eksempel coturn i en egen container på serveren), som ikke er satt opp ennå.

## Passordtilbakestilling med kode (02.11.2026)
Supabase-versjonens «Glemt passord?» sender engangskode med {{ .Token }} fra sion/epost/nytt-passord.html. supa.js åpner kode-/passorddialog og verifiserer med verifyOtp(type: recovery) før updateUser. Ingen verifiseringslenke i denne e-posten, slik at automatisk lenkekontroll ikke bruker opp koden. Bruk nyeste kode; lukk og be om ny ved behov. Eldre lenker og opprettelse av nye brukere beholder eksisterende flyt. Lokale isolerte tester bestått; ekte e-post og telefon må sluttprøves av brukeren. sw.js v76.
