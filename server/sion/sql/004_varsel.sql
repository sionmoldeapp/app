-- Husker hvilke automatiske varsler som er sendt (vakt, politiattest, samling, booking), så ingen sendes to ganger.
create table if not exists public.varsel_sendt (
  nokkel text primary key,
  ms bigint not null
);
alter table public.varsel_sendt enable row level security;   -- ingen regler: bare varseltjenesten (postgres) bruker den
