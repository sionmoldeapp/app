-- Selvbetjeningslenker for leietakere (erstatter samlingen selvlenker i Firestore, som bare Apps Script brukte).
-- Lages og leses bare av varseltjenesten (postgres); appen har ingen tilgang direkte.
create table if not exists public.selvlenker (
  bid       text primary key,   -- bookingens id
  tok       text not null,      -- hemmelig del av lenken (32 heks-tegn)
  "by"      text,               -- den som la inn bookingen (får beskjed når skjemaet sendes inn)
  brukt     boolean not null default false,
  ms        bigint,
  "bruktMs" bigint
);
alter table public.selvlenker enable row level security;   -- ingen regler: bare varseltjenesten bruker den
