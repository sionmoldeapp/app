-- Bare syntetiske rader i en transaksjon. Alt rulles tilbake.
begin;
insert into public.members(email) values ('background-reader@example.test');
insert into public.threads(id,kind,parts,"from") values
  ('codex-faith-bg-test','dm',array['background-sender@example.test','background-reader@example.test'],'background-sender@example.test');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","email":"background-reader@example.test"}';
do $$
declare bg text; changed integer;
begin
  foreach bg in array array['jesus-skrift-mork','jesus-skrift-lys','jesus-bolge-mork','jesus-bolge-lys','jesus-enkel-mork','jesus-enkel-lys','kors-linje-mork','kors-linje-lys','kors-band-mork','kors-band-lys','kors-lys-mork','kors-lys-lys','lys22','neon22'] loop
    update public.threads set bakgrunn=bg where id='codex-faith-bg-test';
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'Kunne ikke lagre bakgrunn %',bg; end if;
    if not exists(select 1 from public.threads where id='codex-faith-bg-test' and bakgrunn=bg) then
      raise exception 'Feil lagret bakgrunn %',bg;
    end if;
  end loop;
  begin
    update public.threads set bakgrunn='ukjent-bakgrunn' where id='codex-faith-bg-test';
    raise exception 'Ukjent bakgrunn ble tillatt';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"background-outsider@example.test"}';
do $$
begin
  update public.threads set bakgrunn='jesus-skrift-lys' where id='codex-faith-bg-test';
  if found then raise exception 'Fremmed kunne endre samtalen'; end if;
end $$;
reset role;
rollback;
