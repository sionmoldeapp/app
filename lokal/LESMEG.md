# Testversjon med lokal database

Samme app (`index.html`, `fb.js`), men databasen og innloggingen kjører på PC-en i Firebase-emulatoren. Ingen kvote, og ekte data berøres aldri.

- **Ekte versjon:** https://sionmoldeapp.github.io/app/ (Firebase `sion-molde-app`).
- **Testversjon:** http://localhost:8090 (eller tunnelens adresse). Appen kjenner seg igjen på adressen (`TEST` i `index.html` og `fb.js`) og viser en rød stripe «TESTVERSJON · lokal database» nederst.
- I testversjonen sendes **ingen** push-varsler, e-post (Apps Script) eller Google Skjema. Varselknapper skjules.

## Start
1. `lokal\start-test.bat` (starter emulator og tjener).
2. Første gang (tom database): `node lokal\seed.js`. Det legger inn eksempeldata og en testadministrator. Innloggingen står i `lokal\innlogging.txt`.
3. Utenfor wifi: `lokal\start-tunnel.bat` gir en https-adresse. PC-en må være på.

## Regler og sikkerhet
- Reglene er de samme som i `firestore.rules` (emulatoren leser filen ved start).
- `server.js` stenger `/emulator/*` og fjerner «Bearer owner» fra kall utenfra, slik at ingen kan tømme databasen eller omgå reglene via tunnelen.
- Tunnelen er åpen for alle som kjenner adressen. Legg aldri ekte medlemsdata i testversjonen.
- Dataene ligger i `lokal\data` (ikke på GitHub).
