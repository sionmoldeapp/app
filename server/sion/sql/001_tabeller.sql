-- Sion Molde-appen: tabellene i Postgres (Supabase), én per samling i Firestore.
-- Kolonnenavnene er de samme som feltnavnene i appen (derfor "pubAt" osv. i anførselstegn).
-- Felt som ikke har egen kolonne, havner i «ekstra» (jsonb), så ingenting går tapt ved flytting.
-- Row Level Security er på for alle tabeller og ingen regler finnes ennå: bare serveren (service_role)
-- og Studio når dataene. Reglene (som i firestore.rules) kommer sammen med ny fb.js.
-- Kjøres på nytt uten skade (if not exists).

-- ============ Innhold: program, nyheter, faste samlinger ============

create table if not exists events (
  id          text primary key default gen_random_uuid()::text,
  title       text not null default '',
  cat         text,
  start       text,
  "end"       text,
  time        text,
  place       text,
  who         text,
  text        text,
  img         text,
  m           boolean not null default false,
  groups      text[] not null default '{}',
  "remindH"   integer,
  "hideHome"  boolean not null default false,
  "pubAt"     bigint,
  draft       boolean not null default false,
  ekstra      jsonb not null default '{}',
  created     timestamptz not null default now()
);
comment on table events is 'Arrangementer (Program). m = bare for medlemmer, groups = bare for disse gruppene.';

create table if not exists posts (
  id          text primary key default gen_random_uuid()::text,
  t           text not null default '',
  b           text,
  bh          text,
  img         text,
  tag         text,
  audience    text[] not null default '{}',
  groups      text[] not null default '{}',
  ltypes      text[] not null default '{}',
  m           boolean not null default false,
  "hideHome"  boolean not null default false,
  pinned      boolean not null default false,
  draft       boolean not null default false,
  svar        boolean not null default false,
  "pubAt"     bigint,
  "expireAt"  bigint,
  "schedId"   text,
  ekstra      jsonb not null default '{}',
  created     timestamptz not null default now()
);
comment on table posts is 'Nyheter og Pastorens hilsen. t = tittel, b = tekst, bh = formatert tekst.';

create table if not exists regular (
  id          text primary key default gen_random_uuid()::text,
  title       text not null default '',
  day         smallint check (day between 0 and 6),
  time        text,
  note        text,
  cat         text,
  weeks       text,
  place       text,
  who         text,
  text        text,
  m           boolean not null default false,
  groups      text[] not null default '{}',
  ex          jsonb not null default '{}',
  ekstra      jsonb not null default '{}',
  created     timestamptz not null default now()
);
comment on table regular is 'Faste samlinger hver uke. day 0 = søndag. ex = unntak per dato (avlyst/endret).';

create table if not exists categories (
  id      text primary key,
  name    text not null,
  ord     integer,
  ekstra  jsonb not null default '{}'
);
comment on table categories is 'Kategorier i Program (Møter, Ungdom ...).';

-- ============ Brukere, grupper og roller ============

create table if not exists members (
  email    text primary key,
  name     text,
  rolle    text,
  groups   text[] not null default '{}',
  leads    text[] not null default '{}',
  leder    boolean not null default false,
  ltype    text,
  muted    text[] not null default '{}',
  extra    text[] not null default '{}',
  "by"     text,
  ekstra   jsonb not null default '{}',
  created  timestamptz not null default now()
);
comment on table members is 'Medlemmer (e-post er nøkkel). leads = gruppeleder for, leder = rollen Leder, extra = varsel uten å være med.';

create table if not exists admins (
  email    text primary key,
  name     text,
  rolle    text,
  groups   text[] not null default '{}',
  muted    text[] not null default '{}',
  extra    text[] not null default '{}',
  "by"     text,
  ekstra   jsonb not null default '{}',
  created  timestamptz not null default now()
);
comment on table admins is 'Administratorer (e-post er nøkkel).';

create table if not exists groups (
  id      text primary key,
  name    text not null,
  "desc"  text,
  ord     integer,
  vakt    boolean not null default false,
  remind  boolean not null default false,
  ekstra  jsonb not null default '{}'
);
comment on table groups is 'Grupper (Activ8, Kjøkken ...). vakt = har vaktliste, remind = påminnelse før samlinger.';

create table if not exists leader_types (
  id      text primary key,
  name    text not null,
  ord     integer,
  ekstra  jsonb not null default '{}'
);
comment on table leader_types is 'Lederkategorier (Hovedledere, Forkynnere ...). Firestore: leaderTypes.';

create table if not exists roles (
  id       text primary key default gen_random_uuid()::text,
  name     text not null,
  "desc"   text,
  tasks    text[] not null default '{}',
  persons  jsonb not null default '[]',
  emails   text[] not null default '{}',
  ord      integer,
  ekstra   jsonb not null default '{}'
);
comment on table roles is 'Ansvarsområder (hvem har ansvar for hva).';

create table if not exists user_prefs (
  email      text primary key,
  meorder    text[] not null default '{}',
  homeorder  text[] not null default '{}',
  suborder   text,
  ekstra     jsonb not null default '{}'
);
comment on table user_prefs is 'Egen rekkefølge på kort og menyer. Firestore: userPrefs.';

create table if not exists notes (
  owner    text not null,
  id       text not null,
  title    text,
  date     text,
  speaker  text,
  html     text,
  img      text,
  lyd      jsonb,
  ekstra   jsonb not null default '{}',
  updated  timestamptz not null default now(),
  primary key (owner, id)
);
comment on table notes is 'Private møtenotater. Firestore: members/{e-post}/notes. Bare eieren skal se dem.';

-- ============ Påmelding, statistikk og varsler ============

create table if not exists rsvp_counts (
  id  text primary key,
  n   integer not null default 0
);
comment on table rsvp_counts is 'Antall «Jeg kommer» per arrangement (anonymt). Firestore: rsvpCounts.';

create table if not exists rsvps (
  id         text primary key,
  "eventId"  text,
  title      text,
  start      text,
  name       text,
  contact    text,
  groups     text[] not null default '{}',
  ekstra     jsonb not null default '{}',
  created    timestamptz not null default now()
);
comment on table rsvps is 'Påmeldte med navn (id = arrangement + enhet).';

create table if not exists post_views (
  id  text primary key,
  n   integer not null default 0
);
comment on table post_views is 'Antall visninger per nyhet. Firestore: postViews.';

create table if not exists push_tokens (
  token    text primary key,
  email    text,
  groups   text[] not null default '{}',
  ekstra   jsonb not null default '{}',
  created  timestamptz not null default now()
);
comment on table push_tokens is 'Varselkoder per telefon. Firestore: pushTokens.';

create table if not exists reminders (
  id        text primary key,
  token     text,
  title     text,
  "fireAt"  bigint,
  ekstra    jsonb not null default '{}',
  created   timestamptz not null default now()
);
comment on table reminders is '«Minn meg på» per telefon og samling.';

create table if not exists scheduled (
  id         text primary key default gen_random_uuid()::text,
  title      text,
  body       text,
  tab        text,
  "malType"  text,
  groups     text[] not null default '{}',
  ltypes     text[] not null default '{}',
  kopi       boolean not null default false,
  "fireAt"   bigint,
  "by"       text,
  ekstra     jsonb not null default '{}',
  created    timestamptz not null default now()
);
comment on table scheduled is 'Planlagte varsler som sendes når fireAt er passert.';

-- ============ Vakter ============

create table if not exists shift_items (
  gruppe  text not null,
  id      text not null,
  date    text,
  role    text,
  emails  text[] not null default '{}',
  names   text[] not null default '{}',
  ekstra  jsonb not null default '{}',
  primary key (gruppe, id)
);
comment on table shift_items is 'Vakter. Firestore: shifts/{gruppe}/items.';

create table if not exists shift_requests (
  gruppe      text not null,
  id          text not null default gen_random_uuid()::text,
  "shiftId"   text,
  date        text,
  role        text,
  "from"      text,
  "fromName"  text,
  text        text,
  ekstra      jsonb not null default '{}',
  created     timestamptz not null default now(),
  primary key (gruppe, id)
);
comment on table shift_requests is 'Byttebeskjeder om vakter. Firestore: shifts/{gruppe}/requests.';

-- ============ Sionchat ============

create table if not exists threads (
  id          text primary key default gen_random_uuid()::text,
  "roleId"    text,
  "roleName"  text,
  kind        text,
  gid         text,
  "toName"    text,
  "from"      text,
  "fromName"  text,
  parts       text[] not null default '{}',
  last        text,
  "lastBy"    text,
  ms          bigint,
  unread      text[] not null default '{}',
  gone        text[] not null default '{}',
  dempet      text[] not null default '{}',
  farge       text,
  bakgrunn    text,
  bgv         bigint,
  bilde       text,
  ekstra      jsonb not null default '{}',
  created     timestamptz not null default now()
);
comment on table threads is 'Samtaler i Sionchat. parts = deltakernes e-post, unread = hvem som ikke har lest. bgv = versjon av eget bakgrunnsbilde.';
create index if not exists threads_parts on threads using gin (parts);

create table if not exists thread_bg (
  thread_id  text not null references threads(id) on delete cascade,
  id         text not null,
  data       text,
  "by"       text,
  v          bigint,
  primary key (thread_id, id)
);
comment on table thread_bg is 'Eget bakgrunnsbilde i en samtale (JPEG som data-URL). Firestore: threads/{id}/bg/ett.';

create table if not exists messages (
  thread_id  text not null references threads(id) on delete cascade,
  id         text not null default gen_random_uuid()::text,
  "by"       text,
  name       text,
  text       text,
  svar       jsonb,
  img        text,
  lyd        text,
  lsek       integer,
  avst       jsonb,
  pam        boolean not null default false,
  redigert   boolean not null default false,
  slettet    boolean not null default false,
  seen       text[] not null default '{}',
  stjerne    text[] not null default '{}',
  likes      text[] not null default '{}',
  r_hjerte   text[] not null default '{}',
  r_ler      text[] not null default '{}',
  r_wow      text[] not null default '{}',
  r_trist    text[] not null default '{}',
  r_be       text[] not null default '{}',
  r_ild      text[] not null default '{}',
  r_hender   text[] not null default '{}',
  r_sion     text[] not null default '{}',
  r_amen     text[] not null default '{}',
  ekstra     jsonb not null default '{}',
  created    timestamptz not null default now(),
  primary key (thread_id, id)
);
comment on table messages is 'Meldinger i en samtale. Firestore: threads/{id}/messages. likes og r_* = reaksjoner (e-post). pam = påminnelse (kopi av eldre melding).';
create index if not exists messages_tid on messages (thread_id, created);

create table if not exists bonner (
  thread_id  text not null references threads(id) on delete cascade,
  id         text not null default gen_random_uuid()::text,
  t          text,
  "by"       text,
  navn       text,
  ms         bigint,
  bedt       text[] not null default '{}',
  besvart    boolean not null default false,
  ekstra     jsonb not null default '{}',
  primary key (thread_id, id)
);
comment on table bonner is 'Bønneliste i en samtale. Firestore: threads/{id}/bonner.';

create table if not exists avst (
  id        text primary key default gen_random_uuid()::text,
  sp        text,
  val       text[] not null default '{}',
  "by"      text,
  "byNavn"  text,
  grupper   text[] not null default '{}',
  ms        bigint,
  v0        text[] not null default '{}',
  v1        text[] not null default '{}',
  v2        text[] not null default '{}',
  v3        text[] not null default '{}',
  v4        text[] not null default '{}',
  ekstra    jsonb not null default '{}'
);
comment on table avst is 'Avstemninger i chatten. v0..v4 = e-postene som stemte på hvert valg.';

create table if not exists tilstede (
  email  text primary key,
  sist   timestamptz not null default now()
);
comment on table tilstede is 'Online-merke: sist aktiv.';

create table if not exists ringer (
  id          text primary key,
  fra         text,
  "fraNavn"   text,
  til         text[] not null default '{}',
  status      text,
  ms          bigint,
  "svarNavn"  text,
  "callId" text,
  "startAt" bigint,
  levert text[] not null default '{}',
  avvist text[] not null default '{}',
  opptatt text[] not null default '{}',
  ekstra      jsonb not null default '{}'
);
comment on table ringer is 'Ringebjelle i Sionchat (id = samtalen).';

-- ============ Forbønn, lederrådet, raske svar ============

create table if not exists prayers (
  id      text primary key default gen_random_uuid()::text,
  t       text,
  name    text,
  "by"    text,
  ms      bigint,
  ber     text[] not null default '{}',
  bedt    bigint,
  ekstra  jsonb not null default '{}'
);
comment on table prayers is 'Forbønn (bønneemner). by = brukerens id.';

create table if not exists lrsaker (
  id        text primary key default gen_random_uuid()::text,
  tittel    text,
  t         text,
  bh        text,
  name      text,
  "by"      text,
  ms        bigint,
  done      boolean not null default false,
  "doneMs"  bigint,
  ekstra    jsonb not null default '{}'
);
comment on table lrsaker is 'Saker til lederrådet.';

create table if not exists post_svar (
  post_id  text not null references posts(id) on delete cascade,
  email    text not null,
  "by"     text,
  name     text,
  k        text,
  t        text,
  ms       bigint,
  ekstra   jsonb not null default '{}',
  primary key (post_id, email)
);
comment on table post_svar is 'Raske svar på gruppebeskjeder. Firestore: posts/{id}/svar/{e-post}.';

-- ============ Politiattest ============

create table if not exists attester (
  email     text primary key,
  dato      text,
  "by"      text,
  godkjent  boolean not null default true,
  fil       boolean not null default false,
  ekstra    jsonb not null default '{}',
  updated   timestamptz not null default now()
);
comment on table attester is 'Politiattest: datoen den ble godkjent.';

create table if not exists attestfil (
  email  text primary key,
  data   text,
  ftype  text,
  fnavn  text,
  ms     bigint
);
comment on table attestfil is 'Dokumentet til gjeldende politiattest.';

create table if not exists attestfilny (
  email  text primary key,
  data   text,
  ftype  text,
  fnavn  text,
  ms     bigint
);
comment on table attestfilny is 'Foreslått nytt dokument, venter på bekreftelse.';

create table if not exists attestforslag (
  email    text primary key,
  k        text,
  dato     text,
  "by"     text,
  "okM"    boolean not null default false,
  "okL"    boolean not null default false,
  "okLby"  text,
  fil      boolean not null default false,
  ms       bigint,
  ekstra   jsonb not null default '{}'
);
comment on table attestforslag is 'Endring av politiattest som venter på bekreftelse fra medlem og leder.';

-- ============ Utleie ============

create table if not exists bookinger (
  id                  text primary key default gen_random_uuid()::text,
  tittel              text,
  rom                 text[] not null default '{}',
  dato                text,
  dato2               text,
  tider               text[] not null default '{}',
  fra                 text,
  til                 text,
  status              text,
  leier               text,
  kontakt             text,
  epost               text,
  pris                text,
  notat               text,
  gjester             integer,
  servering           text,
  allergener          text[] not null default '{}',
  "allergenNotat"     text,
  maaltider           jsonb not null default '[]',
  "remindH"           integer,
  "teamMaal"          integer,
  fakturert           boolean not null default false,
  "fakturertMs"       bigint,
  "fakturaVentH"      integer,
  "fakturaUtsattTil"  bigint,
  "by"                text,
  ms                  bigint,
  ekstra              jsonb not null default '{}'
);
comment on table bookinger is 'Utleie av bygget.';
create index if not exists bookinger_dato on bookinger (dato);

create table if not exists booking_team (
  booking_id  text not null references bookinger(id) on delete cascade,
  email       text not null,
  n           text,
  k           text,
  oppg        text,
  ms          bigint,
  ekstra      jsonb not null default '{}',
  primary key (booking_id, email)
);
comment on table booking_team is 'Teamsvar på en booking. Firestore: bookinger/{id}/team/{e-post}.';

-- ============ Innstillinger og sikkerhetspunkter ============

create table if not exists settings (
  id    text primary key,
  data  jsonb not null default '{}'
);
comment on table settings is 'Enkeltdokumenter: contact, giving, personvern, utleie, julemesse.';

create table if not exists snapshots (
  id       text primary key default gen_random_uuid()::text,
  label    text,
  "by"     text,
  counts   jsonb not null default '{}',
  created  timestamptz not null default now()
);
comment on table snapshots is 'Sikkerhetspunkter i appen (oversikt).';

create table if not exists snapshot_data (
  id    text primary key references snapshots(id) on delete cascade,
  json  text
);
comment on table snapshot_data is 'Innholdet i et sikkerhetspunkt. Firestore: snapshotData.';

-- ============ Kolonner lagt til senere (for databaser laget før de kom) ============
alter table threads add column if not exists bgv bigint;
alter table messages add column if not exists pam boolean not null default false;
alter table posts add column if not exists img text;
alter table regular add column if not exists img text;   -- bilde på faste samlinger (02.11.2026)
alter table notes add column if not exists lyd jsonb;

-- ============ Låst til reglene er skrevet ============
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
alter table members add column if not exists pastor boolean not null default false;   -- pastor (02.11.2026), se 007
alter table admins add column if not exists pastor boolean not null default false;
alter table members add column if not exists kontor boolean not null default false;   -- sekretær, se 007
alter table admins add column if not exists kontor boolean not null default false;

-- Lesekvitteringer for eksisterende installasjoner (regler/RPC i 009).
alter table messages add column if not exists seen text[] not null default '{}';

-- Navn per deltaker i Sionchat (Min profil), regel i 013.
alter table threads add column if not exists navn jsonb;

-- Område for ledersamtaler (014).
alter table threads add column if not exists omr text;

-- Flere lederkategorier per leder (ltype er den første). Se 015.
alter table members add column if not exists ltyper text[] not null default '{}';

-- Meldingsstatus Levert (017).
alter table threads add column if not exists levert text[] not null default '{}';

-- Vedlegg i Sionchat (018).
alter table messages add column if not exists fil jsonb;

-- Fri emoji-reaksjon (019).
alter table messages add column if not exists emo text[] not null default '{}';

-- Feste/arkivere, blokkere og rapportere i Sionchat (020, tabellen rapporter ligger der).
alter table threads add column if not exists festet text[] not null default '{}';
alter table threads add column if not exists arkiv text[] not null default '{}';
alter table user_prefs add column if not exists blokkert text[] not null default '{}';
