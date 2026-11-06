-- Bare syntetiske rader; alt rulles tilbake. Ingen varsling eller e-post.
begin;
insert into public.members(email,name) values ('chat-a@example.test','Test A'),('chat-b@example.test','Test B'),('chat-c@example.test','Test C');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","email":"chat-a@example.test"}';
insert into public.threads(id,kind,"roleId","roleName","toName","from","fromName",parts,last,"lastBy",ms,unread)
values ('codex-member-dm','dm','dm','Beskjed','Test B','chat-a@example.test','Test A',array['chat-a@example.test','chat-b@example.test'],'Test','chat-a@example.test',1,array['chat-b@example.test']);
insert into public.messages(thread_id,id,"by",name,text) values ('codex-member-dm','first','chat-a@example.test','Test A','Test');
do $$ begin
 if not exists(select 1 from public.members where email='chat-b@example.test') then raise exception 'Medlem finner ikke mottaker'; end if;
 begin
  insert into public.threads(id,kind,"roleId","roleName","toName","from","fromName",parts,last,"lastBy",ms)
  values ('codex-invalid-dm','dm','dm','Beskjed','Fremmed','chat-a@example.test','Test A',array['chat-a@example.test','not-member@example.test'],'Test','chat-a@example.test',1);
  raise exception 'Kunne skrive til ikke-medlem';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.threads(id,kind,"roleId","roleName",gid,"from","fromName",parts,last,"lastBy",ms)
  values ('codex-invalid-group','gruppe','gruppe','Test','test','chat-a@example.test','Test A',array['chat-a@example.test','chat-b@example.test','chat-c@example.test'],'Test','chat-a@example.test',1);
  raise exception 'Medlem fikk lederrettigheter';
 exception when insufficient_privilege then null; end;
 begin
  update public.members set leads=array['test'] where email='chat-a@example.test';
  raise exception 'Medlem ga seg selv lederrolle';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"chat-b@example.test"}';
insert into public.messages(thread_id,id,"by",name,text) values ('codex-member-dm','reply','chat-b@example.test','Test B','Svar');
do $$ begin
 if (select count(*) from public.messages where thread_id='codex-member-dm')<>2 then raise exception 'Mottaker kan ikke lese og svare'; end if;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"chat-c@example.test"}';
do $$ begin
 if exists(select 1 from public.threads where id='codex-member-dm') or exists(select 1 from public.messages where thread_id='codex-member-dm') then raise exception 'Tredjepart fikk lese samtalen'; end if;
end $$;
set local request.jwt.claims = '{"role":"authenticated","email":"outsider@example.test"}';
do $$ begin
 if exists(select 1 from public.members) then raise exception 'Ikke-medlem fikk medlemslisten'; end if;
end $$;
rollback;
