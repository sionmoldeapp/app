-- Reaksjoner med hvilken som helst emoji: messages.emo («e-post emoji», én per person). Samme regel som emoOK i firestore.rules.
alter table messages add column if not exists emo text[] not null default '{}';
create or replace function sion.emo_ok(o text[], n text[]) returns boolean language sql stable as $$
  select cardinality(n) <= 40
    and (select count(*) from unnest(n) x where not x = any(o)) <= 1
    and (select count(*) from unnest(o) x where not x = any(n)) <= 1
    and coalesce((select bool_and(split_part(x, ' ', 1) = sion.epost() and length(x) <= length(sion.epost()) + 20) from unnest(n) x where not x = any(o)), true)
    and coalesce((select bool_and(split_part(x, ' ', 1) = sion.epost()) from unnest(o) x where not x = any(n)), true) $$;

do $emo$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_messages()'::regprocedure) into f;
  if position('sion.emo_ok' in f) > 0 then return; end if;
  if position('''r_sion'', ''r_amen'']' in f) = 0 then raise exception 'Uventet sjekk_messages. Kontroller funksjonen før migrering.'; end if;
  f := replace(f, '''r_sion'', ''r_amen'']', '''r_sion'', ''r_amen'', ''emo''] and sion.emo_ok(old.emo, new.emo)');
  execute f;
end
$emo$;
