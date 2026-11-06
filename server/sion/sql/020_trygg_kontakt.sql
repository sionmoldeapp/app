-- Sionchat: feste og arkivere samtaler for seg selv, blokkere personer (user_prefs.blokkert) og rapportere (rapporter, bare administratorer leser).
-- Samme regler som i firestore.rules.
alter table threads add column if not exists festet text[] not null default '{}';
alter table threads add column if not exists arkiv text[] not null default '{}';
alter table user_prefs add column if not exists blokkert text[] not null default '{}';

drop policy if exists egen on user_prefs;
create policy egen on user_prefs for all to authenticated using (email = sion.epost()) with check (
  email = sion.epost() and cardinality(meorder) <= 20 and cardinality(homeorder) <= 20 and sion.len(suborder) <= 1500 and cardinality(blokkert) <= 200 and ekstra = '{}');

create table if not exists rapporter (
  id         text primary key default gen_random_uuid()::text,
  fra        text not null,
  "fraNavn"  text,
  tid        text,
  mid        text,
  hvem       text,
  "hvemNavn" text,
  utdrag     text,
  grunn      text not null,
  ms         bigint,
  ekstra     jsonb not null default '{}',
  created    timestamptz not null default now()
);
comment on table rapporter is 'Rapporter fra Sionchat (melding eller samtale). Bare administratorer leser. Firestore: rapporter.';
alter table rapporter enable row level security;
drop policy if exists lese on rapporter;
create policy lese on rapporter for select to authenticated using (sion.er_admin());
drop policy if exists slett on rapporter;
create policy slett on rapporter for delete to authenticated using (sion.er_admin());
drop policy if exists ny on rapporter;
create policy ny on rapporter for insert to authenticated with check (
  sion.er_medlem() and fra = sion.epost() and sion.len("fraNavn") <= 60 and sion.len(tid) <= 60 and sion.len(mid) <= 60
  and sion.len(hvem) <= 120 and sion.len("hvemNavn") <= 60 and sion.len(utdrag) <= 500 and length(grunn) between 1 and 500 and ekstra = '{}');
grant select, insert, delete on rapporter to authenticated;

do $trygg$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('Feste og arkivere for seg selv' in f) > 0 then return; end if;
  if position('  if e <@ array[''dempet''] and sion.bare_meg(old.dempet, new.dempet) then return new; end if;' in f) = 0 then
    raise exception 'Uventet sjekk_threads. Kontroller funksjonen før migrering.';
  end if;
  f := replace(f, '  if e <@ array[''dempet''] and sion.bare_meg(old.dempet, new.dempet) then return new; end if;',
'  if e <@ array[''dempet''] and sion.bare_meg(old.dempet, new.dempet) then return new; end if;
  -- Feste og arkivere for seg selv
  if e <@ array[''festet'', ''arkiv''] and cardinality(new.festet) <= 40 and cardinality(new.arkiv) <= 40
     and sion.bare_meg(old.festet, new.festet) and sion.bare_meg(old.arkiv, new.arkiv) then return new; end if;');
  execute f;
end
$trygg$;
