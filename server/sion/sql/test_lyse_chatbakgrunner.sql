-- Bare syntetiske rader i en transaksjon. Alt rulles tilbake.
begin;
insert into public.members(email) values ('background-reader@example.test');
insert into public.threads(id,kind,parts,"from") values
  ('codex-light-bg-test','dm',array['background-sender@example.test','background-reader@example.test'],'background-sender@example.test');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","email":"background-reader@example.test"}';
do $$
declare bg text; changed integer;
begin
  foreach bg in array array['lys18','lys19','lys20','lys21','lys22','neon22'] loop
    update public.threads set bakgrunn=bg where id='codex-light-bg-test';
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'Kunne ikke lagre bakgrunn %',bg; end if;
    if not exists(select 1 from public.threads where id='codex-light-bg-test' and bakgrunn=bg) then
      raise exception 'Feil lagret bakgrunn %',bg;
    end if;
  end loop;
  begin
    update public.threads set bakgrunn='ukjent-bakgrunn' where id='codex-light-bg-test';
    raise exception 'Ukjent bakgrunn ble tillatt';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"background-outsider@example.test"}';
do $$
begin
  update public.threads set bakgrunn='lys18' where id='codex-light-bg-test';
  if found then raise exception 'Fremmed kunne endre samtalen'; end if;
end $$;
reset role;
rollback;
