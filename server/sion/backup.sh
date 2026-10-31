#!/bin/sh
# Sikkerhetskopi av databasen og opplastede filer til /backups (mappen server/backups på maskinen).
# Kjører hver natt kl. BACKUP_TIME og sletter kopier eldre enn BACKUP_KEEP_DAYS dager.
# Ta en kopi nå:  docker compose exec sion-backup sh /backup.sh now
# Gjenopprett:    se SION.md

DAGER="${BACKUP_KEEP_DAYS:-14}"
TID="${BACKUP_TIME:-03:00}"

kjor() {
	stamp=$(date +%Y-%m-%d_%H%M)
	mkdir -p /backups
	# supabase_admin eier Supabase sine interne skjemaer; postgres-brukeren får ikke lest alt.
	if pg_dump -U supabase_admin -Fc -f "/backups/db_$stamp.dump.tmp"; then
		mv "/backups/db_$stamp.dump.tmp" "/backups/db_$stamp.dump"
		echo "$(date '+%F %T') Database: db_$stamp.dump"
	else
		rm -f "/backups/db_$stamp.dump.tmp"
		echo "$(date '+%F %T') FEIL: pg_dump mislyktes" >&2
	fi
	if tar -czf "/backups/storage_$stamp.tar.gz" -C /storage .; then
		echo "$(date '+%F %T') Filer: storage_$stamp.tar.gz"
	fi
	find /backups -maxdepth 1 \( -name 'db_*.dump' -o -name 'storage_*.tar.gz' \) -mtime +"$DAGER" -delete
}

if [ "${1:-}" = "now" ]; then
	kjor
	exit 0
fi

# Sekunder til neste BACKUP_TIME. Ren regning (date i bildet forstår ikke «today 03:00»).
# awk tåler ledende nuller (08, 09) som sh ellers leser som ugyldige oktaltall.
ventetid() {
	date '+%H %M %S' | awk -v t="$TID" '{
		split(t, k, ":"); maal = k[1]*3600 + k[2]*60
		naa = $1*3600 + $2*60 + $3
		v = maal - naa; if (v <= 0) v += 86400
		print v
	}'
}

echo "Sikkerhetskopi hver dag kl. $TID, beholder $DAGER dager"
while true; do
	v=$(ventetid)
	# Sikring: aldri en løkke uten pause hvis utregningen feiler
	case "$v" in ''|*[!0-9]*) echo "Ugyldig ventetid «$v», venter en time" >&2; v=3600 ;; esac
	[ "$v" -lt 60 ] && v=60
	sleep "$v"
	kjor
done
