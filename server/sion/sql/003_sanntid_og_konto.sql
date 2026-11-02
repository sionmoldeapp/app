-- Sion Molde-appen: sanntid (chat, ringing, avstemninger) og brukerens egen konto.
-- Kjøres etter 002_tilgang.sql, og kan kjøres på nytt.
set client_min_messages = warning;

-- Sanntid: endringer i disse tabellene sendes til appen (som onSnapshot i Firestore).
-- Hver bruker får bare endringer i rader reglene lar vedkommende lese.
do $$
declare t text;
begin
  foreach t in array array['threads', 'messages', 'bonner', 'avst', 'ringer', 'tilstede'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- «Slett meg»: brukeren sletter sin egen innloggingskonto (appen har først fjernet medlemskap, notater osv.).
-- Administratorer kan ikke slette seg selv her (samme som i appen).
create or replace function public.slett_min_konto() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Ikke innlogget' using errcode = '42501'; end if;
  if sion.er_admin() then raise exception 'Administratorer kan ikke slette seg selv' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.slett_min_konto() from public, anon;
grant execute on function public.slett_min_konto() to authenticated;
