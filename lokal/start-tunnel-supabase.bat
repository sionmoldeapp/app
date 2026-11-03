@echo off
rem Gir Supabase-versjonen (localhost:8091) en offentlig https-adresse (trycloudflare.com), så den kan prøves fra telefon.
rem Adressen endres hver gang. PC-en og Docker (server/) må kjøre. Lukk vinduet for å stenge adressen.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8091
