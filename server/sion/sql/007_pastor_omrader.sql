-- Pastorer og områder (02.11.2026). Kjøres etter 002 (og på nytt hver gang 002 er kjørt, fordi 002 sletter alle regler).
-- Pastor: feltet pastor på members/admins. Kan legge ut nyheter til alle, medlemmer og alle grupper (som pastor i firestore.rules).
-- Områder: omrader {name, groups[], ledere[] (hovedledere)}. Medlemmer leser, administratorer endrer.
set client_min_messages = warning;
alter table public.members add column if not exists pastor boolean not null default false;
alter table public.admins add column if not exists pastor boolean not null default false;
-- Sekretær (kontor): sender til alle som pastor, og nås av alle via et ansvarsområde. Administrerer ikke appen.
alter table public.members add column if not exists kontor boolean not null default false;
alter table public.admins add column if not exists kontor boolean not null default false;

create or replace function sion.er_pastor() returns boolean language sql stable security definer set search_path = public as
$$ select sion.er_admin() or exists (select 1 from members where lower(email) = sion.epost() and (pastor or kontor)) $$;
grant execute on function sion.er_pastor() to anon, authenticated, service_role;

drop policy if exists pastor on posts;
create policy pastor on posts for all to authenticated using (sion.er_pastor()) with check (sion.er_pastor());

create table if not exists public.omrader (
  id      text primary key,
  name    text,
  groups  text[] not null default '{}',
  ledere  text[] not null default '{}',
  pastorer text[] not null default '{}',   -- kopi av pastorlisten (ledersamtalen i Sionchat tar dem med)
  ord     integer,
  ekstra  jsonb not null default '{}'
);
alter table public.omrader add column if not exists pastorer text[] not null default '{}';
alter table public.omrader enable row level security;
grant select, insert, update, delete on public.omrader to authenticated;
drop policy if exists lese on omrader;
drop policy if exists admin on omrader;
create policy lese on omrader for select to authenticated using (sion.er_medlem());
create policy admin on omrader for all to authenticated using (sion.er_admin()) with check (sion.er_admin());
notify pgrst, 'reload schema';
