-- Sion Molde-appen: tilgangsregler (Row Level Security) oversatt fra firestore.rules.
-- Kjøres etter 001_tabeller.sql, og kan kjøres på nytt (alle regler slettes og lages på nytt).
--
-- Slik er det bygget:
--  * Regler (policies) bestemmer hvem som kan lese, opprette, endre og slette hvilke rader.
--  * Firestore-regler som sier «bare disse feltene kan endres» krever at man ser den gamle raden.
--    Det kan ikke en policy, så de ligger i triggere (sion.sjekk_*), som stopper ulovlige endringer.
--  * Tellere og «slett hvis du kjenner id-en» (Jeg kommer, visninger, varselkoder, påminnelser)
--    går via funksjoner (rpc), så ingen kan telle feil eller slette alt på en gang.
--  * Brukeren er e-postadressen i innloggingsbeviset (sion.epost()), som request.auth.token.email i Firestore.
--  * Serveren (service_role), Studio og funksjonene selv (security definer) går forbi alt dette.

set client_min_messages = warning;
create schema if not exists sion;
grant usage on schema sion to anon, authenticated, service_role;

-- ============ Hjelpefunksjoner ============

create or replace function sion.epost() returns text language sql stable as
$$ select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '') $$;

create or replace function sion.len(x text) returns integer language sql immutable as
$$ select coalesce(length(x), 0) $$;

-- Navnene på kolonnene som er endret mellom gammel og ny rad
create or replace function sion.endret(o jsonb, n jsonb) returns text[] language sql immutable as
$$ select coalesce(array_agg(k), '{}') from (select jsonb_object_keys(o) k union select jsonb_object_keys(n)) s
   where o -> k is distinct from n -> k $$;

-- Det som er lagt til og tatt bort i en liste, ligger innenfor «lov»
create or replace function sion.endring_innenfor(gml text[], ny text[], lov text[]) returns boolean language sql immutable as
$$ select not exists (select 1 from unnest(coalesce(ny, '{}')) x where x <> all(coalesce(gml, '{}')) and x <> all(coalesce(lov, '{}')))
      and not exists (select 1 from unnest(coalesce(gml, '{}')) x where x <> all(coalesce(ny, '{}')) and x <> all(coalesce(lov, '{}'))) $$;

-- Brukeren har bare lagt til eller fjernet sin egen e-post (reaksjoner, stemmer, stjerner ...). Som lykOK i firestore.rules.
create or replace function sion.bare_meg(gml text[], ny text[]) returns boolean language sql stable as
$$ select sion.epost() is not null and sion.endring_innenfor(gml, ny, array[sion.epost()]) $$;

-- Firestore sitt keys().hasOnly() for jsonb
create or replace function sion.nokler_ok(d jsonb, lov text[]) returns boolean language sql immutable as
$$ select jsonb_typeof(d) = 'object' and not exists (select 1 from jsonb_object_keys(d) k where k <> all(lov)) $$;

create or replace function sion.tekst_ok(d jsonb, k text, maks integer, paakrevd boolean default false) returns boolean language sql immutable as
$$ select case when d ? k then jsonb_typeof(d -> k) = 'string' and length(d ->> k) <= maks else not paakrevd end $$;

-- Roller. security definer: leser members/admins uten å gå via reglene på de tabellene.
create or replace function sion.er_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where email = sion.epost()) $$;

create or replace function sion.er_medlem() returns boolean language sql stable security definer set search_path = public as
$$ select sion.er_admin() or exists (select 1 from members where email = sion.epost()) $$;

create or replace function sion.mine_grupper() returns text[] language sql stable security definer set search_path = public as
$$ select coalesce((select groups from members where email = sion.epost()), '{}') $$;

create or replace function sion.mine_leads() returns text[] language sql stable security definer set search_path = public as
$$ select coalesce((select leads from members where email = sion.epost()), '{}') $$;

-- Gruppeleder (isLeader): står i members og har minst én gruppe i leads
create or replace function sion.er_gruppeleder() returns boolean language sql stable as
$$ select cardinality(sion.mine_leads()) > 0 $$;

-- ledGroups: listen er ikke tom og inneholder bare grupper brukeren leder
create or replace function sion.leder_for_alle(g text[]) returns boolean language sql stable as
$$ select cardinality(coalesce(g, '{}')) > 0 and g <@ sion.mine_leads() $$;

create or replace function sion.leder_for(g text) returns boolean language sql stable as
$$ select g = any(sion.mine_leads()) $$;

-- inGroup: administrator, eller medlem i gruppen
create or replace function sion.i_gruppe(g text) returns boolean language sql stable as
$$ select sion.epost() is not null and (sion.er_admin() or g = any(sion.mine_grupper())) $$;

create or replace function sion.utleie() returns boolean language sql stable as
$$ select sion.i_gruppe('utleie') $$;

create or replace function sion.vertskap() returns boolean language sql stable as
$$ select 'vertskap' = any(sion.mine_grupper()) $$;

-- prayReader: administratorer og gruppen Bønneledere
create or replace function sion.bonneleser() returns boolean language sql stable as
$$ select sion.i_gruppe('bonneledere') $$;

-- Opplysninger om et annet medlem (for regler om privat beskjed og politiattest)
create or replace function sion.medlem_finnes(e text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from members where email = e) $$;
create or replace function sion.medlem_grupper(e text) returns text[] language sql stable security definer set search_path = public as
$$ select coalesce((select groups from members where email = e), '{}') $$;
create or replace function sion.medlem_leads(e text) returns text[] language sql stable security definer set search_path = public as
$$ select coalesce((select leads from members where email = e), '{}') $$;

-- Deltaker i en samtale
create or replace function sion.i_samtale(tid text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from threads where id = tid and sion.epost() = any(parts)) $$;
create or replace function sion.samtale_fra(tid text) returns text language sql stable security definer set search_path = public as
$$ select "from" from threads where id = tid $$;

-- Gruppene en nyhet gjelder, og om den tar imot raske svar
create or replace function sion.post_grupper(pid text) returns text[] language sql stable security definer set search_path = public as
$$ select coalesce((select groups from posts where id = pid), '{}') $$;
create or replace function sion.post_svar_aktiv(pid text) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select svar from posts where id = pid), false) $$;

-- Politiattest (attestLeder, attSelf, attLed, attParter, attFerdig, attRydd i firestore.rules)
create or replace function sion.att_selv(e text) returns boolean language sql stable as
$$ select sion.epost() = e and sion.er_medlem() $$;
create or replace function sion.att_led(e text) returns boolean language sql stable as
$$ select sion.epost() is not null and (sion.er_admin()
     or (sion.er_gruppeleder() and sion.medlem_finnes(e) and sion.medlem_grupper(e) && sion.mine_leads() and sion.epost() <> e)) $$;
create or replace function sion.att_parter(e text) returns boolean language sql stable as
$$ select sion.att_selv(e) or sion.att_led(e) $$;
create or replace function sion.att_forslag(e text) returns attestforslag language sql stable security definer set search_path = public as
$$ select * from attestforslag where email = e $$;
create or replace function sion.att_ferdig(e text, kind text) returns boolean language sql stable as
$$ select coalesce((select f."okM" and f."okL" and f.k = kind from sion.att_forslag(e) f where f.email is not null), false) $$;
create or replace function sion.att_rydd(e text) returns boolean language sql stable as
$$ select sion.epost() is not null and not sion.medlem_finnes(e) and (sion.epost() = e or sion.er_admin()) $$;

-- Innstillinger: hvilke felt hvert dokument kan ha
create or replace function sion.settings_ok(id text, d jsonb) returns boolean language sql immutable as $$
  select case id
    when 'contact' then sion.nokler_ok(d, '{address,hours,phone,email}')
    when 'giving' then sion.nokler_ok(d, '{konto,bank,vipps,giro,annet,testament}')
      and sion.tekst_ok(d, 'konto', 40, true) and sion.tekst_ok(d, 'annet', 800, true)
      and sion.tekst_ok(d, 'giro', 400, true) and sion.tekst_ok(d, 'testament', 600)
    when 'julemesse' then sion.nokler_ok(d, '{on,tittel,tid,sted,tekst,loddOn,loddFra,loddTil,loddInfo,premier,trukket,trukketMs}')
      and jsonb_typeof(d -> 'on') = 'boolean' and jsonb_typeof(d -> 'loddOn') = 'boolean'
      and sion.tekst_ok(d, 'tittel', 80, true) and sion.tekst_ok(d, 'tid', 80, true) and sion.tekst_ok(d, 'sted', 80, true)
      and sion.tekst_ok(d, 'tekst', 1500, true) and sion.tekst_ok(d, 'loddInfo', 600, true) and sion.tekst_ok(d, 'premier', 1500, true)
      and jsonb_typeof(d -> 'loddFra') = 'number' and jsonb_typeof(d -> 'loddTil') = 'number'
      and jsonb_typeof(d -> 'trukket') = 'array' and jsonb_array_length(d -> 'trukket') <= 50
      and jsonb_typeof(d -> 'trukketMs') = 'number'
    when 'utleie' then sion.nokler_ok(d, '{rom,fakturaEpost,vertskapLedere}')
      and (not d ? 'vertskapLedere' or (jsonb_typeof(d -> 'vertskapLedere') = 'array' and jsonb_array_length(d -> 'vertskapLedere') <= 6))
      and (not d ? 'rom' or (jsonb_typeof(d -> 'rom') = 'array' and jsonb_array_length(d -> 'rom') <= 20))
      and sion.tekst_ok(d, 'fakturaEpost', 100)
    when 'pastor' then sion.nokler_ok(d, '{img}') and sion.tekst_ok(d, 'img', 250000)
    when 'personvern' then sion.nokler_ok(d, '{text,updated}')
      and sion.tekst_ok(d, 'text', 20000, true) and sion.tekst_ok(d, 'updated', 10, true)
    else false end
$$;

grant execute on all functions in schema sion to anon, authenticated, service_role;

-- Setter et tidsfelt til servertid ved innsending fra appen (som «== request.time» i Firestore)
create or replace function sion.tid_naa() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], now()));
  end if;
  return new;
end $$;

-- Gjelder triggerne under: bare appens brukere sjekkes (serveren, Studio og funksjonene går forbi)
create or replace function sion.fra_appen() returns boolean language sql stable as
$$ select current_user in ('anon', 'authenticated') $$;

-- ============ Start på nytt: slett alle regler i public ============
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Datoer lagres som tekst («ÅÅÅÅ-MM-DD»), som i Firestore (tomme felt og klokkeslett gir da ingen feil).
-- Gjøres her fordi typen ikke kan endres mens reglene finnes. Ingen endring hvis den allerede er tekst.
do $$
declare c record;
begin
  for c in select table_name, column_name from information_schema.columns
           where table_schema = 'public' and data_type = 'date' loop
    execute format('alter table public.%I alter column %I type text using %I::text', c.table_name, c.column_name, c.column_name);
  end loop;
end $$;

-- ============ Program, nyheter, faste samlinger ============
-- Åpent innhold (m = false) kan alle lese, m = true krever medlem. Administratorer skriver alt.
-- Gruppeledere oppretter, endrer og sletter arrangementer og nyheter som bare gjelder egne grupper (og er medlemsinnhold).

create policy lese on events for select using (m = false or sion.er_medlem());
create policy admin on events for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy leder_ny on events for insert to authenticated with check (sion.leder_for_alle(groups) and m);
create policy leder_endre on events for update to authenticated using (sion.leder_for_alle(groups)) with check (sion.leder_for_alle(groups) and m);
create policy leder_slett on events for delete to authenticated using (sion.leder_for_alle(groups));

create policy lese on posts for select using (m = false or sion.er_medlem());
create policy admin on posts for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy leder_ny on posts for insert to authenticated with check (sion.leder_for_alle(groups) and m);
create policy leder_endre on posts for update to authenticated using (sion.leder_for_alle(groups)) with check (sion.leder_for_alle(groups) and m);
create policy leder_slett on posts for delete to authenticated using (sion.leder_for_alle(groups));

create policy lese on regular for select using (m = false or sion.er_medlem());
create policy admin on regular for all to authenticated using (sion.er_admin()) with check (sion.er_admin());

-- Raske svar (posts/{id}/svar/{e-post})
create policy lese on post_svar for select to authenticated using (
  email = sion.epost() or sion.er_admin() or (sion.er_gruppeleder() and sion.mine_leads() && sion.post_grupper(post_id)));
create policy svare on post_svar for insert to authenticated with check (
  sion.er_medlem() and email = sion.epost() and "by" = sion.epost()
  and k in ('ok', 'kommer', 'ikke', 'tekst') and name is not null and length(name) <= 60 and t is not null and length(t) <= 140
  and ms is not null and ekstra = '{}' and sion.post_svar_aktiv(post_id)
  and (sion.er_admin() or sion.mine_grupper() && sion.post_grupper(post_id)));
create policy endre on post_svar for update to authenticated using (email = sion.epost()) with check (
  sion.er_medlem() and email = sion.epost() and "by" = sion.epost()
  and k in ('ok', 'kommer', 'ikke', 'tekst') and name is not null and length(name) <= 60 and t is not null and length(t) <= 140
  and ms is not null and ekstra = '{}' and sion.post_svar_aktiv(post_id)
  and (sion.er_admin() or sion.mine_grupper() && sion.post_grupper(post_id)));
create policy slett on post_svar for delete to authenticated using (email = sion.epost() or sion.er_admin());

-- ============ Kategorier, grupper, lederkategorier, ansvarsområder ============

create policy lese on categories for select using (true);
create policy admin on categories for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy lese on groups for select using (true);
create policy admin on groups for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy admin on leader_types for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy lese on roles for select to authenticated using (sion.er_medlem());
create policy admin on roles for all to authenticated using (sion.er_admin()) with check (sion.er_admin());

-- ============ Medlemmer og administratorer ============
-- Brukeren ser seg selv; administratorer og gruppeledere ser listen. Administratorer styrer den.
-- Brukeren kan endre eget navn og avslåtte gruppevarsler, og slette seg selv (ikke administratorer).
-- Gruppeledere kan legge nye medlemmer inn i egne grupper og endre groups/extra/muted for egne grupper (sjekkes i trigger).

create policy lese on members for select to authenticated using (email = sion.epost() or sion.er_admin() or sion.er_gruppeleder());
create policy admin on members for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy selv_endre on members for update to authenticated using (email = sion.epost()) with check (email = sion.epost());
create policy selv_slett on members for delete to authenticated using (email = sion.epost() and not sion.er_admin());
create policy leder_ny on members for insert to authenticated with check (
  sion.er_gruppeleder() and sion.leder_for_alle(groups)
  and name is null and leads = '{}' and leder = false and ltype is null and muted = '{}' and extra = '{}' and ekstra = '{}');
create policy leder_endre on members for update to authenticated using (sion.er_gruppeleder()) with check (sion.er_gruppeleder());

create or replace function sion.sjekk_members() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() or sion.er_admin() then return new; end if;
  -- Seg selv: navn og avslåtte gruppevarsler
  if old.email = sion.epost() and e <@ array['name', 'muted']
     and sion.len(new.name) <= 60 and cardinality(new.muted) <= 30 then return new; end if;
  -- Gruppeleder: bare grupper vedkommende selv leder
  if sion.er_gruppeleder() and e <@ array['groups', 'extra', 'muted']
     and sion.endring_innenfor(old.groups, new.groups, sion.mine_leads())
     and sion.endring_innenfor(old.extra, new.extra, sion.mine_leads())
     and sion.endring_innenfor(old.muted, new.muted, sion.mine_leads()) then return new; end if;
  raise exception 'Ingen tilgang til å endre dette medlemmet' using errcode = '42501';
end $$;
drop trigger if exists sjekk on members;
create trigger sjekk before update on members for each row execute function sion.sjekk_members();

create policy lese on admins for select to authenticated using (email = sion.epost() or sion.er_admin());
create policy admin on admins for all to authenticated using (sion.er_admin()) with check (sion.er_admin());

-- Egne innstillinger (rekkefølge på kort og menyer)
create policy egen on user_prefs for all to authenticated using (email = sion.epost()) with check (
  email = sion.epost() and cardinality(meorder) <= 20 and cardinality(homeorder) <= 20 and sion.len(suborder) <= 1500 and ekstra = '{}');

-- Private møtenotater: bare eieren (ikke engang administratorer), n1 til n100
create policy egen on notes for all to authenticated using (owner = sion.epost() and sion.er_medlem()) with check (
  owner = sion.epost() and sion.er_medlem() and id ~ '^n([1-9]|[1-9][0-9]|100)$'
  and title is not null and length(title) <= 120 and speaker is not null and length(speaker) <= 80
  and date is not null and length(date) <= 10 and html is not null and length(html) <= 20000
  and sion.len(img) <= 60000 and (lyd is null or (jsonb_typeof(lyd) = 'array' and jsonb_array_length(lyd) <= 3)) and ekstra = '{}');
drop trigger if exists tid on notes;
create trigger tid before insert or update on notes for each row execute function sion.tid_naa('updated');

-- ============ Vakter ============

create policy lese on shift_items for select to authenticated using (sion.i_gruppe(gruppe) or sion.leder_for(gruppe));
create policy endre on shift_items for all to authenticated using (sion.er_admin() or sion.leder_for(gruppe))
  with check (sion.er_admin() or sion.leder_for(gruppe));

create policy ny on shift_requests for insert to authenticated with check (
  (sion.i_gruppe(gruppe) or sion.leder_for(gruppe)) and "from" = sion.epost() and text is not null and length(text) <= 300 and ekstra = '{}');
create policy lese on shift_requests for select to authenticated using (sion.er_admin() or sion.leder_for(gruppe) or "from" = sion.epost());
create policy slett on shift_requests for delete to authenticated using (sion.er_admin() or sion.leder_for(gruppe) or "from" = sion.epost());
drop trigger if exists tid on shift_requests;
create trigger tid before insert on shift_requests for each row execute function sion.tid_naa('created');

-- ============ Sionchat ============

create policy lese on threads for select to authenticated using (sion.epost() = any(parts));
create policy ny on threads for insert to authenticated with check (
  sion.er_medlem() and "from" = sion.epost() and "lastBy" = sion.epost()
  and "fromName" is not null and length("fromName") <= 60 and "roleId" is not null
  and last is not null and length(last) <= 140 and ms is not null
  and gone = '{}' and dempet = '{}' and farge is null and bakgrunn is null and bgv is null and bilde is null and ekstra = '{}'
  and unread <@ parts
  and (
    -- Beskjed til et ansvarsområde: alle andre deltakere står på området
    (kind is null and gid is null and "toName" is null
      and "roleName" is not null and length("roleName") <= 60
      and cardinality(parts) between 2 and 8 and sion.epost() = any(parts)
      and sion.endring_innenfor(array[]::text[], parts, coalesce((select r.emails from roles r where r.id = "roleId"), '{}') || sion.epost()))
    -- Privat beskjed fra administrator/gruppeleder til et medlem (eller fra gruppen utleie til en leder for vertskap)
    or (kind = 'dm' and "roleId" = 'dm' and gid is null
      and "roleName" is not null and length("roleName") <= 60 and "toName" is not null and length("toName") <= 60
      and cardinality(parts) = 2 and parts[1] = sion.epost() and parts[2] <> sion.epost() and sion.medlem_finnes(parts[2])
      and (sion.er_admin()
        or (sion.er_gruppeleder() and sion.medlem_grupper(parts[2]) && sion.mine_leads())
        or (sion.utleie() and 'vertskap' = any(sion.medlem_leads(parts[2])))))
    -- Gruppesamtale fra administrator eller gruppeleder for gruppen
    or (kind = 'gruppe' and "roleId" = 'gruppe' and gid is not null and "toName" is null
      and "roleName" is not null and length("roleName") between 1 and 60
      and cardinality(parts) between 3 and 40 and parts[1] = sion.epost()
      and (sion.er_admin() or sion.leder_for(gid)))
  ));
create policy endre on threads for update to authenticated using (sion.epost() = any(parts)) with check (sion.epost() = any(parts));
create policy slett on threads for delete to authenticated using (sion.er_admin() or "from" = sion.epost());
drop trigger if exists tid on threads;
create trigger tid before insert on threads for each row execute function sion.tid_naa('created');

create or replace function sion.sjekk_threads() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  if new.parts is distinct from old.parts then raise exception 'Deltakerne kan ikke endres' using errcode = '42501'; end if;
  -- Markere som lest
  if e <@ array['unread'] and new.unread <@ old.parts then return new; end if;
  -- Ny melding
  if e <@ array['last', 'lastBy', 'ms', 'unread', 'gone'] and new.unread <@ old.parts
     and (not 'gone' = any(e) or new.gone = '{}')
     and new."lastBy" = sion.epost() and new.last is not null and length(new.last) <= 140 and new.ms is not null then return new; end if;
  -- Skjule samtalen for seg selv
  if e <@ array['gone'] and cardinality(new.gone) <= 40 and sion.bare_meg(old.gone, new.gone) then return new; end if;
  -- Farge og bakgrunn (bgv = versjon av eget bakgrunnsbilde i thread_bg)
  if e <@ array['farge', 'bakgrunn', 'bgv']
     and coalesce(new.farge, 'blaa') in ('blaa', 'rosa', 'gronn', 'lilla', 'oransje', 'rod', 'turkis', 'gull')
     and coalesce(new.bakgrunn, 'ingen') in ('ingen', 'himmel', 'solnedgang', 'skog', 'natt', 'rosa', 'sion', 'eget', 'aurora', 'neon1', 'neon2', 'neon3', 'neon4', 'neon5', 'neon6', 'neon7', 'neon8', 'neon9', 'neon10', 'neon11', 'neon12', 'neon13', 'neon14', 'neon15') then return new; end if;
  -- Samtalebilde
  if e <@ array['bilde'] and (new.bilde is null or (length(new.bilde) <= 30000 and new.bilde like 'data:image/jpeg;base64,%')) then return new; end if;
  -- Dempe for seg selv
  if e <@ array['dempet'] and sion.bare_meg(old.dempet, new.dempet) then return new; end if;
  raise exception 'Ingen tilgang til å endre samtalen' using errcode = '42501';
end $$;
drop trigger if exists sjekk on threads;
create trigger sjekk before update on threads for each row execute function sion.sjekk_threads();

-- Eget bakgrunnsbilde i samtalen (threads/{id}/bg/ett): alle deltakerne ser og bytter det
create policy lese on thread_bg for select to authenticated using (sion.i_samtale(thread_id));
create policy slett on thread_bg for delete to authenticated using (sion.i_samtale(thread_id));
create policy ny on thread_bg for insert to authenticated with check (
  sion.i_samtale(thread_id) and "by" = sion.epost() and v is not null
  and data like 'data:image/jpeg;base64,%' and length(data) <= 640000);
create policy endre on thread_bg for update to authenticated using (sion.i_samtale(thread_id)) with check (
  sion.i_samtale(thread_id) and "by" = sion.epost() and v is not null
  and data like 'data:image/jpeg;base64,%' and length(data) <= 640000);

-- Meldinger (pam = påminnelse: kopi av en eldre melding, lenket til originalen via svar)
create policy lese on messages for select to authenticated using (sion.i_samtale(thread_id));
create policy slett on messages for delete to authenticated using (sion.er_admin() or sion.samtale_fra(thread_id) = sion.epost());
create policy ny on messages for insert to authenticated with check (
  sion.i_samtale(thread_id) and "by" = sion.epost()
  and name is not null and length(name) <= 60 and text is not null and length(text) <= 1000
  and (length(text) >= 1 or img is not null or lyd is not null or avst is not null)
  and (lyd is null or (length(lyd) <= 200000 and lsek is not null and lsek <= 120))
  and (avst is null or (jsonb_typeof(avst) = 'object' and sion.nokler_ok(avst, '{id}')))
  and sion.len(img) <= 200000
  and (svar is null or (sion.nokler_ok(svar, '{id,navn,tekst}') and sion.tekst_ok(svar, 'navn', 60, true) and sion.tekst_ok(svar, 'tekst', 120, true)))
  and redigert = false and slettet = false and stjerne = '{}' and likes = '{}'
  and r_hjerte = '{}' and r_ler = '{}' and r_wow = '{}' and r_trist = '{}' and r_be = '{}'
  and r_ild = '{}' and r_hender = '{}' and r_sion = '{}' and r_amen = '{}' and ekstra = '{}');
create policy endre on messages for update to authenticated using (sion.i_samtale(thread_id)) with check (sion.i_samtale(thread_id));
drop trigger if exists tid on messages;
create trigger tid before insert on messages for each row execute function sion.tid_naa('created');

create or replace function sion.sjekk_messages() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  -- Angre egen melding: teksten tømmes, vedlegg fjernes
  if old."by" = sion.epost() and e <@ array['text', 'slettet', 'img', 'svar', 'lyd', 'lsek', 'avst']
     and new.slettet and new.text = '' and new.img is null and new.svar is null
     and new.lyd is null and new.lsek is null and new.avst is null then return new; end if;
  -- Redigere egen tekstmelding
  if old."by" = sion.epost() and e <@ array['text', 'redigert'] and new.redigert
     and length(new.text) between 1 and 1000 and not old.slettet and old.img is null then return new; end if;
  -- Reaksjoner: bare egen e-post legges til eller fjernes
  if e <@ array['likes', 'r_hjerte', 'r_ler', 'r_wow', 'r_trist', 'r_be', 'r_ild', 'r_hender', 'r_sion', 'r_amen']
     and sion.bare_meg(old.likes, new.likes) and sion.bare_meg(old.r_hjerte, new.r_hjerte)
     and sion.bare_meg(old.r_ler, new.r_ler) and sion.bare_meg(old.r_wow, new.r_wow)
     and sion.bare_meg(old.r_trist, new.r_trist) and sion.bare_meg(old.r_be, new.r_be)
     and sion.bare_meg(old.r_ild, new.r_ild) and sion.bare_meg(old.r_hender, new.r_hender)
     and sion.bare_meg(old.r_sion, new.r_sion) and sion.bare_meg(old.r_amen, new.r_amen) then return new; end if;
  -- Stjernemerke for seg selv
  if e <@ array['stjerne'] and sion.bare_meg(old.stjerne, new.stjerne) then return new; end if;
  raise exception 'Ingen tilgang til å endre meldingen' using errcode = '42501';
end $$;
drop trigger if exists sjekk on messages;
create trigger sjekk before update on messages for each row execute function sion.sjekk_messages();

-- Bønneliste i samtalen
create policy lese on bonner for select to authenticated using (sion.i_samtale(thread_id));
create policy ny on bonner for insert to authenticated with check (
  sion.i_samtale(thread_id) and "by" = sion.epost() and length(t) between 1 and 200
  and navn is not null and length(navn) <= 60 and ms is not null and bedt = '{}' and besvart = false and ekstra = '{}');
create policy endre on bonner for update to authenticated using (sion.i_samtale(thread_id)) with check (sion.i_samtale(thread_id));
create policy slett on bonner for delete to authenticated using ("by" = sion.epost() or sion.er_admin());

create or replace function sion.sjekk_bonner() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  if e <@ array['bedt'] and sion.bare_meg(old.bedt, new.bedt) then return new; end if;
  if e <@ array['besvart'] then return new; end if;
  raise exception 'Ingen tilgang til å endre bønneemnet' using errcode = '42501';
end $$;
drop trigger if exists sjekk on bonner;
create trigger sjekk before update on bonner for each row execute function sion.sjekk_bonner();

-- Avstemninger: opprettes av administrator eller gruppeleder for egne grupper; medlemmer i gruppene leser og stemmer
create policy lese on avst for select to authenticated using (
  sion.er_medlem() and (sion.er_admin() or "by" = sion.epost() or sion.mine_grupper() && grupper));
create policy ny on avst for insert to authenticated with check (
  sion.er_medlem() and "by" = sion.epost() and length(sp) between 1 and 120 and cardinality(val) between 2 and 5
  and "byNavn" is not null and length("byNavn") <= 60 and ms is not null
  and v0 = '{}' and v1 = '{}' and v2 = '{}' and v3 = '{}' and v4 = '{}' and ekstra = '{}'
  and (sion.er_admin() or sion.leder_for_alle(grupper)));
create policy stemme on avst for update to authenticated using (
  sion.er_medlem() and (sion.er_admin() or "by" = sion.epost() or sion.mine_grupper() && grupper)) with check (true);
create policy slett on avst for delete to authenticated using ("by" = sion.epost() or sion.er_admin());

create or replace function sion.sjekk_avst() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  if e <@ array['v0', 'v1', 'v2', 'v3', 'v4']
     and sion.bare_meg(old.v0, new.v0) and sion.bare_meg(old.v1, new.v1) and sion.bare_meg(old.v2, new.v2)
     and sion.bare_meg(old.v3, new.v3) and sion.bare_meg(old.v4, new.v4) then return new; end if;
  raise exception 'Ingen tilgang til å endre avstemningen' using errcode = '42501';
end $$;
drop trigger if exists sjekk on avst;
create trigger sjekk before update on avst for each row execute function sion.sjekk_avst();

-- Online-merke: hvert medlem skriver bare sitt eget tidspunkt (servertid)
create policy lese on tilstede for select to authenticated using (sion.er_medlem());
create policy egen on tilstede for insert to authenticated with check (sion.er_medlem() and email = sion.epost());
create policy endre on tilstede for update to authenticated using (email = sion.epost()) with check (sion.er_medlem() and email = sion.epost());
create policy slett on tilstede for delete to authenticated using (email = sion.epost());
drop trigger if exists tid on tilstede;
create trigger tid before insert or update on tilstede for each row execute function sion.tid_naa('sist');

-- Ringebjelle: den som ringer oppretter og avbryter; mottakerne kan bare svare
create policy lese on ringer for select to authenticated using (sion.epost() = any(til) or fra = sion.epost());
create policy ringe on ringer for insert to authenticated with check (
  sion.er_medlem() and fra = sion.epost() and cardinality(til) between 1 and 8
  and "fraNavn" is not null and length("fraNavn") <= 60 and status in ('ring', 'avbrutt', 'vibr') and ms is not null
  and sion.len("svarNavn") <= 60 and ekstra = '{}' and sion.i_samtale(id));
create policy endre on ringer for update to authenticated using (fra = sion.epost() or sion.epost() = any(til)) with check (true);
create policy slett on ringer for delete to authenticated using (fra = sion.epost());

create or replace function sion.sjekk_ringer() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  -- Den som ringer: ringer på nytt eller avbryter
  if old.fra = sion.epost() and new.fra = sion.epost() and cardinality(new.til) between 1 and 8
     and new."fraNavn" is not null and length(new."fraNavn") <= 60 and new.status in ('ring', 'avbrutt', 'vibr') and new.ms is not null
     and sion.len(new."svarNavn") <= 60 and new.ekstra = '{}' and sion.i_samtale(new.id) then return new; end if;
  -- Mottaker: svarer
  if sion.epost() = any(old.til) and e <@ array['status', 'svarNavn'] and new.status = 'svart'
     and sion.len(new."svarNavn") <= 60 then return new; end if;
  raise exception 'Ingen tilgang til å endre ringingen' using errcode = '42501';
end $$;
drop trigger if exists sjekk on ringer;
create trigger sjekk before update on ringer for each row execute function sion.sjekk_ringer();

-- ============ Forbønn og lederrådet ============
-- Forbønn: by er brukerens id (auth.uid()). Leserne (administratorer og Bønneledere) ser alle, forfatteren ser egne.
-- Anonyme emner uten innlogging kommer via serveren (fase 3), ikke direkte.

create policy lese on prayers for select to authenticated using (sion.bonneleser() or "by" = auth.uid()::text);
create policy ny on prayers for insert to authenticated with check (
  sion.er_medlem() and length(t) between 1 and 400 and length(name) between 1 and 60 and ms is not null
  and ber = '{}' and bedt is null and "by" = auth.uid()::text and ekstra = '{}');
create policy bedt on prayers for update to authenticated using (sion.bonneleser()) with check (sion.bonneleser());
create policy slett on prayers for delete to authenticated using (sion.er_medlem() and ("by" = auth.uid()::text or sion.bonneleser()));

create or replace function sion.sjekk_prayers() returns trigger language plpgsql as $$
begin
  if not sion.fra_appen() then return new; end if;
  if sion.endret(to_jsonb(old), to_jsonb(new)) <@ array['bedt'] then return new; end if;
  raise exception 'Bare «bedt» kan endres' using errcode = '42501';
end $$;
drop trigger if exists sjekk on prayers;
create trigger sjekk before update on prayers for each row execute function sion.sjekk_prayers();

create policy lese on lrsaker for select to authenticated using (sion.i_gruppe('lederradet'));
create policy ny on lrsaker for insert to authenticated with check (
  sion.i_gruppe('lederradet') and length(t) between 1 and 2000 and sion.len(tittel) <= 100 and sion.len(bh) <= 8000
  and name is not null and length(name) <= 60 and "by" = sion.epost() and ms is not null
  and done = false and "doneMs" is null and ekstra = '{}');
create policy behandlet on lrsaker for update to authenticated using (sion.i_gruppe('lederradet')) with check (sion.i_gruppe('lederradet'));
create policy slett on lrsaker for delete to authenticated using (sion.er_admin() or "by" = sion.epost());

create or replace function sion.sjekk_lrsaker() returns trigger language plpgsql as $$
begin
  if not sion.fra_appen() then return new; end if;
  if sion.endret(to_jsonb(old), to_jsonb(new)) <@ array['done', 'doneMs'] then return new; end if;
  raise exception 'Bare «behandlet» kan endres' using errcode = '42501';
end $$;
drop trigger if exists sjekk on lrsaker;
create trigger sjekk before update on lrsaker for each row execute function sion.sjekk_lrsaker();

-- ============ Politiattest ============
-- Alle endringer går via et forslag som må bekreftes av både medlemmet og en gruppeleder/administrator.

create policy lese on attester for select to authenticated using (sion.att_parter(email));
create policy ny on attester for insert to authenticated with check (
  sion.att_parter(email) and sion.att_ferdig(email, 'sett')
  and dato = (sion.att_forslag(email)).dato and godkjent and fil = (sion.att_forslag(email)).fil
  and "by" = sion.epost() and ekstra = '{}');
create policy endre on attester for update to authenticated using (sion.att_parter(email)) with check (sion.att_parter(email));
create policy slett on attester for delete to authenticated using (
  (sion.att_parter(email) and sion.att_ferdig(email, 'slett')) or sion.att_rydd(email));
drop trigger if exists tid on attester;
create trigger tid before insert or update on attester for each row execute function sion.tid_naa('updated');

create or replace function sion.sjekk_attester() returns trigger language plpgsql as $$
declare e text[] := array_remove(sion.endret(to_jsonb(old), to_jsonb(new)), 'updated');
        f attestforslag := sion.att_forslag(old.email);
begin
  if not sion.fra_appen() then return new; end if;
  -- Fullført forslag om ny dato
  if sion.att_ferdig(old.email, 'sett') and new.dato = f.dato and new.godkjent
     and new.fil = (f.fil or old.fil) and new."by" = sion.epost() and new.ekstra = old.ekstra then return new; end if;
  -- Eldre dato som ventet på godkjenning
  if sion.att_led(old.email) and not old.godkjent and e <@ array['godkjent', 'by']
     and new.godkjent and new."by" = sion.epost() then return new; end if;
  raise exception 'Politiattesten kan bare endres etter bekreftelse fra begge' using errcode = '42501';
end $$;
drop trigger if exists sjekk on attester;
create trigger sjekk before update on attester for each row execute function sion.sjekk_attester();

create policy lese on attestforslag for select to authenticated using (sion.att_parter(email));
create policy ny on attestforslag for insert to authenticated with check (
  sion.att_parter(email) and k in ('sett', 'slett')
  and (case when k = 'slett' then dato is null else dato ~ '^\d{4}-\d{2}-\d{2}$' end)
  and "by" = sion.epost() and ms is not null and "okLby" is not null and ekstra = '{}'
  and (case
    when sion.att_selv(email) and sion.att_led(email) then "okM" and "okL" and "okLby" = sion.epost()
    when sion.att_selv(email) then "okM" and not "okL" and "okLby" = ''
    else not "okM" and "okL" and "okLby" = sion.epost() end));
create policy bekrefte on attestforslag for update to authenticated using (sion.att_parter(email)) with check (sion.att_parter(email));
create policy slett on attestforslag for delete to authenticated using (sion.att_parter(email) or sion.att_rydd(email));

create or replace function sion.sjekk_attestforslag() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
        selv boolean := sion.att_selv(old.email);
        led boolean := sion.att_led(old.email);
begin
  if not sion.fra_appen() then return new; end if;
  if e <@ array['okM', 'okL', 'okLby'] then
    if selv and not led and new."okM" and new."okL" = old."okL" and new."okLby" = old."okLby" then return new; end if;
    if led and not selv and new."okL" and new."okLby" = sion.epost() and new."okM" = old."okM" then return new; end if;
  end if;
  raise exception 'Ingen tilgang til å bekrefte forslaget' using errcode = '42501';
end $$;
drop trigger if exists sjekk on attestforslag;
create trigger sjekk before update on attestforslag for each row execute function sion.sjekk_attestforslag();

create policy lese on attestfil for select to authenticated using (sion.att_parter(email));
create policy ny on attestfil for insert to authenticated with check (
  sion.att_parter(email) and sion.att_ferdig(email, 'sett') and (sion.att_forslag(email)).fil and sion.len(data) <= 950000 and data is not null);
create policy endre on attestfil for update to authenticated using (sion.att_parter(email)) with check (
  sion.att_parter(email) and sion.att_ferdig(email, 'sett') and (sion.att_forslag(email)).fil and sion.len(data) <= 950000 and data is not null);
create policy slett on attestfil for delete to authenticated using (
  (sion.att_parter(email) and sion.att_ferdig(email, 'slett')) or sion.att_rydd(email));

create policy lese on attestfilny for select to authenticated using (sion.att_parter(email));
create policy ny on attestfilny for insert to authenticated with check (
  sion.att_parter(email) and (sion.att_forslag(email))."by" = sion.epost() and (sion.att_forslag(email)).fil
  and data is not null and length(data) <= 950000);
create policy endre on attestfilny for update to authenticated using (sion.att_parter(email)) with check (
  sion.att_parter(email) and (sion.att_forslag(email))."by" = sion.epost() and (sion.att_forslag(email)).fil
  and data is not null and length(data) <= 950000);
create policy slett on attestfilny for delete to authenticated using (sion.att_parter(email) or sion.att_rydd(email));

-- ============ Utleie ============
-- Administratorer og gruppen utleie leser og endrer; gruppen vertskap leser.

create policy lese on bookinger for select to authenticated using (sion.utleie() or sion.vertskap());
create policy slett on bookinger for delete to authenticated using (sion.utleie());
create policy ny on bookinger for insert to authenticated with check (sion.utleie());
create policy endre on bookinger for update to authenticated using (sion.utleie()) with check (sion.utleie());
-- Feltreglene gjelder både ny og endret booking
create or replace function sion.booking_ok(b bookinger) returns boolean language sql immutable as $$
  select b.tittel is not null and length(b.tittel) <= 100 and cardinality(b.rom) between 1 and 10
    and length(b.dato) = 10 and sion.len(b.dato2) <= 10
    and cardinality(b.tider) <= 62 and coalesce(b.gjester between 0 and 2000, true) and sion.len(b.servering) <= 200
    and coalesce(b."teamMaal" between 0 and 50, true) and jsonb_typeof(b.maaltider) = 'array' and jsonb_array_length(b.maaltider) <= 8
    and cardinality(b.allergener) <= 20 and sion.len(b."allergenNotat") <= 200
    and coalesce(b."fakturaVentH" between 1 and 720, true) and coalesce(b."remindH" between 0 and 720, true)
    and length(b.fra) = 5 and length(b.til) = 5 and b.leier is not null and length(b.leier) <= 100
    and b.kontakt is not null and length(b.kontakt) <= 100 and sion.len(b.epost) <= 100
    and b.pris is not null and length(b.pris) <= 30 and b.status in ('foresporsel', 'bekreftet')
    and b.notat is not null and length(b.notat) <= 500 and b."by" is not null and length(b."by") <= 80 and b.ms is not null
    and b.ekstra = '{}'
$$;
create or replace function sion.sjekk_bookinger() returns trigger language plpgsql as $$
begin
  if sion.fra_appen() and not sion.booking_ok(new) then
    raise exception 'Bookingen har ugyldige felt' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists sjekk on bookinger;
create trigger sjekk before insert or update on bookinger for each row execute function sion.sjekk_bookinger();

create policy lese on booking_team for select to authenticated using (sion.utleie() or sion.vertskap());
create policy svar on booking_team for insert to authenticated with check (
  sion.er_medlem() and (email = sion.epost() or sion.utleie() or sion.er_gruppeleder())
  and sion.len(oppg) <= 30 and n is not null and length(n) <= 60 and k in ('ja', 'nei', 'vet', 'ingen') and ms is not null and ekstra = '{}');
create policy endre on booking_team for update to authenticated
  using (sion.er_medlem() and (email = sion.epost() or sion.utleie() or sion.er_gruppeleder()))
  with check (sion.er_medlem() and (email = sion.epost() or sion.utleie() or sion.er_gruppeleder())
    and sion.len(oppg) <= 30 and n is not null and length(n) <= 60 and k in ('ja', 'nei', 'vet', 'ingen') and ms is not null and ekstra = '{}');
create policy slett on booking_team for delete to authenticated using (sion.utleie());

-- ============ Innstillinger, sikkerhetspunkter, planlagte varsler ============

create policy lese on settings for select using (true);
create policy admin on settings for all to authenticated using (sion.er_admin()) with check (sion.er_admin() and sion.settings_ok(id, data));

create policy admin on snapshots for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy admin on snapshot_data for all to authenticated using (sion.er_admin()) with check (sion.er_admin());

create policy ny on scheduled for insert to authenticated with check (
  title is not null and length(title) <= 100 and "fireAt" is not null and ekstra = '{}'
  and (sion.er_admin() or (sion.er_gruppeleder() and "malType" = 'grupper' and sion.leder_for_alle(groups))));
create policy admin on scheduled for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
drop trigger if exists tid on scheduled;
create trigger tid before insert on scheduled for each row execute function sion.tid_naa('created');

-- ============ Tellere, påmelding, varselkoder og påminnelser ============
-- Lesing som i firestore.rules. Skriving går via funksjonene under (rpc), ikke direkte.

create policy lese on rsvp_counts for select using (true);
create policy admin_slett on rsvp_counts for delete to authenticated using (sion.er_admin());
create policy lese on rsvps for select to authenticated using (sion.er_admin() or sion.er_gruppeleder());
create policy lese on post_views for select to authenticated using (sion.er_admin() or sion.er_gruppeleder());
create policy admin on push_tokens for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy admin on reminders for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
create policy ny on reminders for insert with check (
  token is not null and length(token) between 100 and 500 and title is not null and length(title) <= 200
  and "fireAt" is not null and ekstra = '{}');
drop trigger if exists tid on reminders;
create trigger tid before insert on reminders for each row execute function sion.tid_naa('created');

-- «Jeg kommer»-telleren: opp eller ned med én
create or replace function public.rsvp_tell(p_id text, p_d integer) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_id is null or length(p_id) > 200 or p_d not in (1, -1) then raise exception 'Ugyldig' using errcode = '22023'; end if;
  insert into rsvp_counts as r (id, n) values (p_id, greatest(p_d, 0))
    on conflict (id) do update set n = greatest(r.n + p_d, 0)
    returning r.n into n;
  return n;
end $$;

-- Antall som har sett en nyhet: opp med én
create or replace function public.nyhet_sett(p_id text) returns void
language sql security definer set search_path = public as $$
  insert into post_views as v (id, n) select p_id, 1 where p_id is not null and length(p_id) <= 200
    on conflict (id) do update set n = v.n + 1
$$;

-- Påmelding med navn (alle kan melde seg på og av; bare administratorer og gruppeledere leser listen)
create or replace function public.meld_paa(p_id text, p_event text, p_title text, p_start text, p_name text, p_contact text, p_groups text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or length(p_id) > 200 or p_event is null or length(p_event) > 80
     or length(coalesce(p_name, '')) not between 1 and 80 or sion.len(p_contact) > 120
     or sion.len(p_title) > 200 or sion.len(p_start) > 20 or cardinality(coalesce(p_groups, '{}')) > 20 then
    raise exception 'Ugyldig påmelding' using errcode = '22023';
  end if;
  insert into rsvps (id, "eventId", title, start, name, contact, groups, created)
    values (p_id, p_event, coalesce(p_title, ''), coalesce(p_start, ''), p_name, coalesce(p_contact, ''), coalesce(p_groups, '{}'), now())
    on conflict (id) do update set "eventId" = excluded."eventId", title = excluded.title, start = excluded.start,
      name = excluded.name, contact = excluded.contact, groups = excluded.groups, created = now();
end $$;
create or replace function public.meld_av(p_id text) returns void
language sql security definer set search_path = public as $$ delete from rsvps where id = p_id $$;

-- Varselkode for push: registreres uten grupper; e-post kan bare være brukerens egen
create or replace function public.kode_lagre(p_token text, p_email text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) not between 100 and 900 then raise exception 'Ugyldig varselkode' using errcode = '22023'; end if;
  if p_email is not null and p_email is distinct from sion.epost() then raise exception 'Bare egen e-post' using errcode = '42501'; end if;
  insert into push_tokens (token, email, groups, created) values (p_token, p_email, '{}', now())
    on conflict (token) do update set email = excluded.email, groups = '{}', created = now();
end $$;
create or replace function public.kode_fjern(p_token text) returns void
language sql security definer set search_path = public as $$ delete from push_tokens where token = p_token $$;

-- Påminnelse: den som kjenner id-en kan slette den
create or replace function public.paaminnelse_fjern(p_id text) returns void
language sql security definer set search_path = public as $$ delete from reminders where id = p_id $$;

revoke execute on function public.rsvp_tell, public.nyhet_sett, public.meld_paa, public.meld_av,
  public.kode_lagre, public.kode_fjern, public.paaminnelse_fjern from public;
grant execute on function public.rsvp_tell, public.nyhet_sett, public.meld_paa, public.meld_av,
  public.kode_lagre, public.kode_fjern, public.paaminnelse_fjern to anon, authenticated, service_role;

-- Sjekk: alle tabeller har RLS og minst én regel
do $$
declare t record; mangler text := '';
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
             and (not c.relrowsecurity or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)) loop
    mangler := mangler || ' ' || t.relname;
  end loop;
  if mangler <> '' then raise notice 'Tabeller uten RLS eller uten regler:%', mangler; end if;
end $$;
