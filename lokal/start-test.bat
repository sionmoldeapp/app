@echo off
rem Starter testversjonen: lokal database (Firebase-emulator) og tjeneren som viser appen.
rem Data lagres i lokal\data og er der neste gang. Lukk vinduene for å stoppe.
cd /d "%~dp0.."
if not exist lokal\data mkdir lokal\data
set "JAVA_HOME=C:Program FilesMicrosoftjdk-21.0.13.21-hotspot"
set "PATH=%JAVA_HOME%bin;%PATH%"
start "Emulator (database)" cmd /k firebase emulators:start --only firestore,auth --project sion-molde-app --import=lokal\data --export-on-exit=lokal\data
timeout /t 12 /nobreak >nul
start "Testversjon (app)" cmd /k node lokal\server.js
echo.
echo Appen: http://localhost:8090
echo Tom database? Kjor en gang:  node lokal\seed.js
echo Fra telefon utenfor wifi: kjor lokal\start-tunnel.bat og bruk adressen som vises.
