-- Alle godkjente medlemmer kan starte private samtaler. Ingen endring i lederrettigheter.
begin;
drop policy if exists lese on public.members;
create policy lese on public.members for select to authenticated using (sion.er_medlem());
drop policy if exists ny on public.threads;
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
    -- Privat samtale mellom to godkjente medlemmer
    or (kind = 'dm' and "roleId" = 'dm' and gid is null
      and "roleName" is not null and length("roleName") <= 60 and "toName" is not null and length("toName") <= 60
      and cardinality(parts) = 2 and parts[1] = sion.epost() and parts[2] <> sion.epost() and sion.medlem_finnes(parts[2]))
    -- Gruppesamtale fra administrator, pastor/sekretær (alle grupper og ledersamtaler) eller gruppeleder for gruppen
    or (kind = 'gruppe' and "roleId" = 'gruppe' and gid is not null and "toName" is null
      and "roleName" is not null and length("roleName") between 1 and 60
      and cardinality(parts) between 3 and 40 and parts[1] = sion.epost()
      and (sion.er_admin() or sion.er_pastor() or sion.leder_for(gid)))
  ));

notify pgrst, 'reload schema';
commit;
