-- Tale i private samtaler i Sionchat (WebRTC, bare lyd). Som tale/{samtale-id} i Firestore.
-- Den som ringer skriver tilbudet (offer) og kan avslutte; den ene mottakeren kan bare skrive svaret (answer) og avslutte (slutt).
-- Selve lyden går direkte mellom telefonene, ikke via databasen. Kjøres etter 002, og kan kjøres på nytt.
set client_min_messages = warning;
create table if not exists public.tale (
  id      text primary key,               -- samtalens id
  fra     text,
  til     text[] not null default '{}',
  offer   text,
  answer  text,
  ms      bigint,
  slutt   boolean not null default false,
  ekstra  jsonb not null default '{}'
);
alter table public.tale enable row level security;
grant select, insert, update, delete on public.tale to authenticated;
drop policy if exists lese on tale;
drop policy if exists ringe on tale;
drop policy if exists endre on tale;
drop policy if exists slett on tale;
create policy lese on tale for select to authenticated using (sion.epost() = any(til) or fra = sion.epost());
create policy ringe on tale for insert to authenticated with check (
  sion.er_medlem() and fra = sion.epost() and cardinality(til) = 1 and length(coalesce(offer, '')) between 1 and 20000
  and sion.len(answer) <= 20000 and ms is not null and ekstra = '{}' and sion.i_samtale(id));
create policy endre on tale for update to authenticated using (fra = sion.epost() or sion.epost() = any(til)) with check (true);
create policy slett on tale for delete to authenticated using (fra = sion.epost() or sion.epost() = any(til));

create or replace function sion.sjekk_tale() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  -- Den som ringer: nytt tilbud (tar over raden fra en tidligere samtale) eller avslutter
  if new.fra = sion.epost() and sion.er_medlem() and cardinality(new.til) = 1 and length(coalesce(new.offer, '')) between 1 and 20000
     and sion.len(new.answer) <= 20000 and new.ms is not null and new.ekstra = '{}' and sion.i_samtale(new.id) then return new; end if;
  -- Mottakeren: svar og avslutning
  if sion.epost() = any(old.til) and e <@ array['answer', 'slutt'] and sion.len(new.answer) <= 20000 then return new; end if;
  raise exception 'Ingen tilgang til å endre samtalen' using errcode = '42501';
end $$;
drop trigger if exists sjekk on tale;
create trigger sjekk before update on tale for each row execute function sion.sjekk_tale();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tale') then
    alter publication supabase_realtime add table public.tale;
  end if;
end $$;
notify pgrst, 'reload schema';
