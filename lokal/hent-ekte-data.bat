@echo off
rem Henter brukere og innhold fra den ekte databasen til testversjonen. Emulatoren må kjøre (start-test.bat).
cd /d "%~dp0.."
node lokal\hent-fra-ekte.js
pause
