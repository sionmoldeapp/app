-- Lesekvitteringer gjelder konkrete meldinger. Et medlem kan bare legge til seg selv.
begin;
alter table public.messages add column if not exists seen text[] not null default '{}';
do $lesing$
declare f text; sjekk text;
begin
  select pg_get_functiondef('sion.sjekk_messages()'::regprocedure) into f;
  if position('new.seen' in f) = 0 then
    if position('if not sion.fra_appen() then return new; end if;' in f) = 0 then raise exception 'Uventet meldingstrigger'; end if;
    f := replace(f, 'if not sion.fra_appen() then return new; end if;',
      'if not sion.fra_appen() then return new; end if;
       if e <@ array[''seen''] and cardinality(new.seen) <= 40
          and new.seen @> old.seen and sion.bare_meg(old.seen, new.seen)
       then return new; end if;');
    execute f;
  end if;
  select pg_get_expr(polwithcheck, polrelid) into sjekk from pg_policy where polrelid = 'public.messages'::regclass and polname = 'ny';
  if sjekk is null then raise exception 'Mangler opprettelsesregel'; end if;
  if position('seen' in sjekk) = 0 then execute format('alter policy ny on public.messages with check ((%s) and seen = ''{}''::text[])', sjekk); end if;
end
$lesing$;
create or replace function public.mark_chat_seen(p_thread text, p_ids text[]) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if sion.epost() is null or not sion.i_samtale(p_thread) then raise exception 'Ingen tilgang' using errcode = '42501'; end if;
  if cardinality(p_ids) > 20 then raise exception 'For mange meldinger' using errcode = '22023'; end if;
  update public.messages set seen = array_append(seen, sion.epost())
  where thread_id = p_thread and id = any(p_ids) and "by" <> sion.epost() and not slettet and not sion.epost() = any(seen);
end $$;
revoke all on function public.mark_chat_seen(text,text[]) from public, anon;
grant execute on function public.mark_chat_seen(text,text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
