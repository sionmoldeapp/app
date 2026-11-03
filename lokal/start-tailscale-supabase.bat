@echo off
rem Gir Supabase-versjonen (localhost:8091) den faste adressen https://desktop-fn64rpa.taila112aa.ts.net via Tailscale Funnel (åpen for alle som har adressen).
rem PC-en, Tailscale og Docker (server/) må kjøre, inkludert sion-video-gateway.
rem Adressen deler nettsiden og kryptert gruppevideo på samme sikre port. Kjører i bakgrunnen også etter omstart.
rem Første gang kan Tailscale be deg slå på HTTPS og Funnel i nettleseren: følg lenken i vinduet og kjør filen på nytt.
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg --yes --tls-terminated-tcp=443 tcp://127.0.0.1:17900
if errorlevel 1 goto slutt
echo Appen og gruppevideo er tilgjengelig paa den sikre adressen.
echo Steng delingen med: tailscale funnel --tls-terminated-tcp=443 off
:slutt
pause
