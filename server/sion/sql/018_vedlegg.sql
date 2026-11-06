-- Vedlegg (filer) i Sionchat: messages.fil {navn,type,str,data} med data-URL (maks 700 000 tegn). Samme regel som i firestore.rules.
alter table messages add column if not exists fil jsonb;
drop policy if exists ny on messages;
create policy ny on messages for insert to authenticated with check (
  sion.i_samtale(thread_id) and "by" = sion.epost()
  and name is not null and length(name) <= 60 and text is not null and length(text) <= 1000
  and (length(text) >= 1 or img is not null or lyd is not null or avst is not null or fil is not null)
  and (fil is null or (jsonb_typeof(fil) = 'object' and sion.nokler_ok(fil, '{navn,type,str,data}') and sion.tekst_ok(fil, 'navn', 120, true) and sion.tekst_ok(fil, 'type', 100, true)
       and length(fil->>'data') <= 700000 and fil->>'data' like 'data:%'))
  and (lyd is null or (length(lyd) <= 200000 and lsek is not null and lsek <= 120))
  and (avst is null or (jsonb_typeof(avst) = 'object' and sion.nokler_ok(avst, '{id}')))
  and sion.len(img) <= 200000
  and (svar is null or (sion.nokler_ok(svar, '{id,navn,tekst}') and sion.tekst_ok(svar, 'navn', 60, true) and sion.tekst_ok(svar, 'tekst', 120, true)))
  and redigert = false and slettet = false and seen = '{}' and stjerne = '{}' and likes = '{}'
  and r_hjerte = '{}' and r_ler = '{}' and r_wow = '{}' and r_trist = '{}' and r_be = '{}'
  and r_ild = '{}' and r_hender = '{}' and r_sion = '{}' and r_amen = '{}' and ekstra = '{}');

do $fil$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_messages()'::regprocedure) into f;
  if position('''avst'', ''fil'']' in f) > 0 then return; end if;
  if position('array[''text'', ''slettet'', ''img'', ''svar'', ''lyd'', ''lsek'', ''avst'']' in f) = 0 then
    raise exception 'Uventet sjekk_messages. Kontroller funksjonen før migrering.';
  end if;
  f := replace(f, 'array[''text'', ''slettet'', ''img'', ''svar'', ''lyd'', ''lsek'', ''avst'']', 'array[''text'', ''slettet'', ''img'', ''svar'', ''lyd'', ''lsek'', ''avst'', ''fil'']');
  f := replace(f, 'new.img is null and new.svar is null', 'new.img is null and new.svar is null and new.fil is null');
  execute f;
end
$fil$;
