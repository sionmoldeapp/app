-- Nytt navn i Min profil vises i Sionchat: threads.navn {e-post: navn}.
-- Deltakeren endrer bare sin egen nøkkel, fromName hvis samtalen er startet av vedkommende,
-- og toName hvis vedkommende er mottakeren i en privat samtale. Samme regel som i firestore.rules.
alter table threads add column if not exists navn jsonb;

do $chatnavn$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('Eget navn (Min profil)' in f) > 0 then return; end if;
  if position('raise exception ''Ingen tilgang til å endre samtalen''' in f) = 0 then
    raise exception 'Uventet sjekk_threads. Kontroller funksjonen før migrering.';
  end if;
  f := replace(f, '  raise exception ''Ingen tilgang til å endre samtalen''',
'  -- Eget navn (Min profil)
  if e <@ array[''navn'', ''fromName'', ''toName'']
     and jsonb_typeof(coalesce(new.navn, ''{}'')) = ''object''
     and (select count(*) from jsonb_object_keys(coalesce(new.navn, ''{}''))) <= 41
     and (coalesce(new.navn, ''{}'') - sion.epost()) = (coalesce(old.navn, ''{}'') - sion.epost())
     and coalesce(jsonb_typeof(new.navn -> sion.epost()), ''string'') = ''string''
     and length(coalesce(new.navn ->> sion.epost(), '''')) <= 60
     and (not ''fromName'' = any(e) or old."from" = sion.epost())
     and (not ''toName'' = any(e) or (old.kind = ''dm'' and old.parts[2] = sion.epost()))
     and length(coalesce(new."fromName", '''')) <= 60 and length(coalesce(new."toName", '''')) <= 60 then return new; end if;
  raise exception ''Ingen tilgang til å endre samtalen''');
  execute f;
end
$chatnavn$;
