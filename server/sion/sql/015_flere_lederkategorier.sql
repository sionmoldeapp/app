-- Flere lederkategorier per leder: members.ltyper (ltype er alltid den første, for eldre kode).
-- Gruppeledere som oppretter medlemmer kan ikke sette kategorier (samme som ltype).
alter table members add column if not exists ltyper text[] not null default '{}';
update members set ltyper = array[ltype] where leder and ltype is not null and ltype <> '' and ltyper = '{}';
drop policy if exists leder_ny on members;
create policy leder_ny on members for insert to authenticated with check (
  sion.er_gruppeleder() and sion.leder_for_alle(groups)
  and name is null and leads = '{}' and leder = false and not pastor and not kontor and ltype is null and ltyper = '{}' and muted = '{}' and extra = '{}' and ekstra = '{}');
