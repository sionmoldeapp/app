-- Unik anropsrunde og egne bekreftelser fra hver mottaker. Ingen nye leserettigheter.
begin;
alter table public.ringer add column if not exists "callId" text;
alter table public.ringer add column if not exists "startAt" bigint;
alter table public.ringer add column if not exists levert text[] not null default '{}';
alter table public.ringer add column if not exists avvist text[] not null default '{}';
alter table public.ringer add column if not exists opptatt text[] not null default '{}';

create or replace function sion.sjekk_ringer() returns trigger language plpgsql as $$
declare e text[] := sion.endret(to_jsonb(old), to_jsonb(new));
begin
  if not sion.fra_appen() then return new; end if;
  if new.fra = sion.epost() and cardinality(new.til) between 1 and 8
     and new."fraNavn" is not null and length(new."fraNavn") <= 60
     and new.status in ('ring','avbrutt','vibr','utlopt') and new.ms is not null
     and sion.len(new."svarNavn") <= 60 and new.ekstra = '{}' and sion.i_samtale(new.id)
     and (new."callId" is null or length(new."callId") between 1 and 80)
     and new.levert <@ new.til and new.avvist <@ new.til and new.opptatt <@ new.til
     and cardinality(new.levert)<=8 and cardinality(new.avvist)<=8 and cardinality(new.opptatt)<=8
     and (new."callId" is not distinct from old."callId" or (new.levert='{}' and new.avvist='{}' and new.opptatt='{}'))
     then return new; end if;
  if old.status = 'ring' and sion.epost() = any(old.til)
     and e <@ array['status','svarNavn','levert','avvist','opptatt']
     and new.status in ('ring','svart','avvist','opptatt') and sion.len(new."svarNavn") <= 60
     and (new.status in ('ring','svart') or cardinality(old.til)=1)
     and new.levert @> old.levert and sion.bare_meg(old.levert,new.levert)
     and new.avvist @> old.avvist and sion.bare_meg(old.avvist,new.avvist)
     and new.opptatt @> old.opptatt and sion.bare_meg(old.opptatt,new.opptatt)
     and cardinality(new.levert)<=8 and cardinality(new.avvist)<=8 and cardinality(new.opptatt)<=8
     then return new; end if;
  raise exception 'Ingen tilgang til å endre ringingen' using errcode='42501';
end $$;

create or replace function public.chat_ring_event(p_thread text,p_call text,p_event text,p_name text default '') returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.ringer; e text:=sion.epost();
begin
  select * into r from public.ringer where id=p_thread for update;
  if not found or r."callId" is distinct from p_call or r.status<>'ring' then return false; end if;
  if p_event in ('cancel','timeout') and r.fra=e then
    update public.ringer set status=case when p_event='timeout' then 'utlopt' else 'avbrutt' end where id=p_thread; return true;
  end if;
  if not coalesce(e=any(r.til),false) then raise exception 'Ingen tilgang' using errcode='42501'; end if;
  if p_event='delivered' then
    update public.ringer set levert=case when e=any(levert) then levert else array_append(levert,e) end where id=p_thread;
  elsif p_event in ('decline','busy') then
    update public.ringer set
      avvist=case when e=any(avvist) then avvist else array_append(avvist,e) end,
      opptatt=case when p_event='busy' and not e=any(opptatt) then array_append(opptatt,e) else opptatt end,
      status=case when cardinality(til)=1 then case when p_event='busy' then 'opptatt' else 'avvist' end else 'ring' end
      where id=p_thread;
  elsif p_event='answer' then
    if (r."startAt" is not null and r."startAt" < (extract(epoch from clock_timestamp())*1000)::bigint-45000) then return false; end if;
    update public.ringer set status='svart',"svarNavn"=left(p_name,60),levert=case when e=any(levert) then levert else array_append(levert,e) end where id=p_thread;
  else raise exception 'Ukjent anropshandling' using errcode='22023';
  end if;
  return true;
end $$;
revoke all on function public.chat_ring_event(text,text,text,text) from public,anon;
grant execute on function public.chat_ring_event(text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
