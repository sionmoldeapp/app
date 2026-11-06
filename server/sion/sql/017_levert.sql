-- Meldingsstatus «Levert»: threads.levert har «e-post:ms» fra mottakere hvis enhet har fått siste melding.
-- Ny melding tømmer listen; en deltaker kan bare legge til sin egen kvittering for samtalens ms. Samme regel som i firestore.rules.
alter table threads add column if not exists levert text[] not null default '{}';

do $levert$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('Levert: deltakeren' in f) > 0 then return; end if;
  if position('array[''last'', ''lastBy'', ''ms'', ''unread'', ''gone''] and new.unread <@ old.parts' in f) = 0 or position('  -- Skjule samtalen for seg selv' in f) = 0 then
    raise exception 'Uventet sjekk_threads. Kontroller funksjonen før migrering.';
  end if;
  f := replace(f, 'array[''last'', ''lastBy'', ''ms'', ''unread'', ''gone''] and new.unread <@ old.parts',
                  'array[''last'', ''lastBy'', ''ms'', ''unread'', ''gone'', ''levert''] and new.unread <@ old.parts and (not ''levert'' = any(e) or new.levert = ''{}'')');
  f := replace(f, '  -- Skjule samtalen for seg selv',
'  -- Levert: deltakeren legger bare til «egen e-post:samtalens ms»
  if e <@ array[''levert''] and old.levert <@ new.levert and cardinality(new.levert) <= 200
     and (select bool_and(x = sion.epost() || '':'' || old.ms::text) from unnest(new.levert) x where not x = any(old.levert)) then return new; end if;
  -- Skjule samtalen for seg selv');
  execute f;
end
$levert$;
