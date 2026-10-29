@echo off
rem Gir testversjonen en offentlig https-adresse (trycloudflare.com) slik at den virker fra telefon utenfor wifi.
rem Adressen endres hver gang tunnelen startes. PC-en må være på og start-test.bat må kjøre.
"C:Program Files (x86)oudflaredoudflared.exe" tunnel --url http://localhost:8090
