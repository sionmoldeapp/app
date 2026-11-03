-- Syntetiske rader i en transaksjon. Ingen testdata beholdes.
begin;
insert into public.threads(id,kind,parts,"from") values ('codex-read-test','gruppe',array['sender@example.test','reader@example.test','reader2@example.test'],'sender@example.test');
insert into public.messages(thread_id,id,"by",name,text) values ('codex-read-test','test-message','sender@example.test','Test','Kun lesetest');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","email":"reader@example.test"}';
select public.mark_chat_seen('codex-read-test',array['test-message']);
select public.mark_chat_seen('codex-read-test',array['test-message']);
do $$ begin
  if (select seen <> array['reader@example.test'] from public.messages where thread_id='codex-read-test' and id='test-message') then raise exception 'Egen kvittering eller idempotens feilet'; end if;
  begin
    update public.messages set seen=array['reader@example.test','other@example.test'] where thread_id='codex-read-test' and id='test-message';
    raise exception 'Kunne forfalske andres lesing';
  exception when insufficient_privilege then null; end;
  begin
    update public.messages set seen='{}' where thread_id='codex-read-test' and id='test-message';
    raise exception 'Kunne fjerne lesing';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.messages(thread_id,id,"by",name,text,seen) values ('codex-read-test','forged','reader@example.test','Test','Test',array['reader2@example.test']);
    raise exception 'Kunne opprette med forfalsket kvittering';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"outsider@example.test"}';
do $$ begin
  if exists(select 1 from public.messages where thread_id='codex-read-test') then raise exception 'Fremmed fikk lese'; end if;
  begin
    perform public.mark_chat_seen('codex-read-test',array['test-message']);
    raise exception 'Fremmed fikk kvittere';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"reader2@example.test"}';
select public.mark_chat_seen('codex-read-test',array['test-message']);
do $$ begin
  if not (select seen @> array['reader@example.test','reader2@example.test'] and cardinality(seen)=2 from public.messages where thread_id='codex-read-test' and id='test-message') then raise exception 'Kvittering overskrev tidligere lesere'; end if;
end $$;
reset role;
rollback;
