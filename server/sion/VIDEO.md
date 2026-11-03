# Gruppevideo i Sionchat

Appen har en videoknapp i gruppechattene på egen Supabase-server. Alle i samme chat kan åpne samme samtale, opptil 12 samtidig. Kamera og mikrofon velges før «Bli med», med valgfri forhåndsvisning. Det sendes ingen automatisk invitasjon, melding eller push. Lydsamtalen for to personer er separat.

Videotjenesten er LiveKit på egen server. Serveren sjekker innlogging og `threads.parts` før hvert adgangsbevis. Kun `kind='gruppe'` godtas. Rom og deltakeridentiteter er pseudonyme og forskjellige mellom grupper; visningsnavnet hentes fra medlemsregisteret. Tokens varer to minutter og gir kun adgang til ett rom med kamera/mikrofon. De gir ingen romadministrasjon, opptak eller skjermdeling. Tilkoblet video avsluttes ikke når tokenet utløper. Utmelding fra chat stenger nye innlogginger; umiddelbar utestenging fra en pågående videosamtale er ikke implementert.

## Status

Videotjenesten er **aktivert på denne PC-en 03.11.2026**. Appadressen er https://desktop-fn64rpa.taila112aa.ts.net, og videoens signaladresse er samme adresse med `/video`. App og kryptert TURN deler sikker port 443 gjennom Tailscale Funnel og en HAProxy-inngang. Telefonene trenger ikke Tailscale. PC-en, Docker og Tailscale må kjøre.

Toveis kunstig video bestod driftstesten med offentlig DNS og tvungen TURN-reléforbindelse. Dette erstatter ikke sluttprøve på to reelle telefoner og mobilnett, eller belastningstest med 12 samtidige videostrømmer.

## Aktivt oppsett på PC-en

- `server/.env` har nye tilfeldige videonøkler og video-adressen. Filen er ignorert av Git. Ingen hemmeligheter skal kopieres til appen eller dette notatet.
- `COMPOSE_FILE` beholder de gamle filene og har i tillegg `docker-compose.video.yml` og `docker-compose.video-funnel.yml`.
- LiveKit sin TURN-tjeneste ligger internt på 10000. LiveKit annonserer denne som TURN/TLS på **443**, derfor deler gatewayen denne sikre porten mellom HTTP/WebSocket og binær TURN. Tailscale avslutter TLS på samme maskin; lokal transport videre går over loopback og Docker-nettet.
- Kun loopback-innganger er publisert av Docker: videoens API på 7880 og gatewayen på 17900. Ingen ruterporter, Windows-brannmur, databaseadgang eller Firebase Rules ble endret.
- Aktiv deling: `tailscale funnel --bg --yes --tls-terminated-tcp=443 tcp://127.0.0.1:17900`. Denne fortsetter etter omstart. Den tidligere delingen til 8091 i et åpent vindu er erstattet. Et midlertidig forsøk på 10000 er fjernet.
- `lokal/start-tailscale-supabase.bat` starter riktig deling igjen. Fra `server/`: `docker compose up -d sion-web sion-varsel sion-video sion-video-gateway` starter tjenestene. Docker og Tailscale må selv være startet etter omstart av Windows.
- Ved feil i videogatewayen kan vanlig appdeling gjenopprettes med `tailscale funnel --tls-terminated-tcp=443 off`, deretter `tailscale funnel --bg --yes --https=443 http://127.0.0.1:8091`. Dette kobler fra video, men beholder nettsiden. Nøkler trenger ikke byttes.
- Driftstest (kun kunstige deltakere): sett `SION_VIDEO_DEPLOYED_TEST=1`, kjør `node --test server/sion/video-deployed.test.js`. Testen leser nøkler i minnet uten å skrive dem ut, bruker syntetiske rom, tester ekte video over TLS/relay og sletter bare sine egne testrom.

Funnel har båndbreddebegrensninger. Kapasiteten for 12 videostrømmer må måles før store gruppemøter; en egen server med direkte medietrafikk kan bli nødvendig. [Tailscale-begrensninger](https://tailscale.com/docs/features/tailscale-funnel).


## Alternativt oppsett på en annen server

1. Opprett `LIVEKIT_API_KEY` og en tilfeldig `LIVEKIT_API_SECRET` på minst 32 tegn i `server/.env`. Ikke legg hemmelighetene i repoet eller i appen.
2. Legg `docker-compose.video.yml` til eksisterende `COMPOSE_FILE` (behold alle filene som allerede står der). Tjenesten har faste bibliotekversjoner og maks 12 deltakere også som serverstandard.
3. For en isolert test på samme PC: `LIVEKIT_URL=ws://localhost:7880`. Standardbindingene tillater bare denne maskinen. Oppsettet bruker `LIVEKIT_NODE_IP=127.0.0.1`. Appen åpnes på `http://localhost:8091`.
4. For telefoner: velg en video-nettadresse med gyldig HTTPS-sertifikat, for eksempel `LIVEKIT_URL=wss://video.dittdomene.no`. Reverse proxy må sende WebSocket og API til tjenestens interne port 7880. Konfigurer en adresse og medieporter som telefonene faktisk kan nå. Standardbindingene i compose-filen gir ikke ekstern tilgang. Funnel for nettsiden alene videresender ikke WebRTC-medietrafikken; PC-oppsettet over løser dette med TURN/TLS og felles gateway.
5. Gjennomgå og avklar nettverkstilgangen før bindinger/brannmur endres. LiveKit trenger ICE/TCP 7881 og ICE/UDP 7882 med denne konfigurasjonen. `LIVEKIT_NODE_IP` må være adressen klientene når. Ved NAT må ruting/portvideresending fungere. TURN/TLS på egen adresse anbefales for mobilnett og strenge nettverk. Dette krever ytterligere LiveKit-konfigurasjon og sertifikat; det er ikke aktivert av denne filen.
6. Start `sion-video` og gjenskap `sion-varsel` med den utvidede compose-konfigurasjonen. Sjekk at appens videofiler og den nye serverkoden er tilgjengelige. Ingen Firebase Rules eller SQL-migrering er nødvendig.

Dokumentasjon: [LiveKit utrulling](https://docs.livekit.io/transport/self-hosting/deployment/), [nettverksporter](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

## Kontroller

`node --test server/sion/varsel/video.test.js` tester autorisasjon og JWT-grants med SDK-et, uten ekte kontoer eller utsendinger. `node --test server/sion/video-client.test.js` tester avbrudd og kamerarydding med en simulert nettleser.

Gjennomført lokalt: 14 tester for adgang og grensesnitt bestod. En isolert LiveKit 1.13.11 på loopback og Chrome med kunstig kamera/mikrofon bekreftet toveis medier, stopp av kamerasporet ved avslutning, 12 samtidige tilkoblinger og avvisning av nummer 13. Dette er ikke en belastningstest med 12 videostrømmer eller en mobilnettest. Den isolerte testserveren ble fjernet etterpå. Den aktive videotjenesten er en egen tjeneste. Den valgfrie testen ligger i `video-integration.test.js` og bruker kun loopback og syntetiske identiteter.

Før aktivering: prøv forhåndsvisning, avbryt, kamera/mikrofon av, nektet kameratilgang, utlogging, nettverksbrudd, gjeninnmelding, lyd på i Safari og 12 deltakere. Nummer 13 skal avvises. Prøv både wifi og mobilnett, og sjekk at kameraindikatoren slukker når man forlater samtalen.

Nettleserbiblioteket `lib/livekit-client-2.23.0.umd.js` er hentet fra npm-pakken `livekit-client@2.23.0`. Lisensen ligger ved siden av filen. Det lastes kun når gruppevideo åpnes.
