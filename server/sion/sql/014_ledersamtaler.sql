-- Ledersamtaler per område: bare hovedledere og teamledere i området er med (ikke alle pastorene).
-- Administrator eller hovedleder for området som er med i samtalen kan rette deltakerne. omr = områdets id.
-- Samme regel som i firestore.rules.
alter table threads add column if not exists omr text;

do $ledersamtaler$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('Ledersamtale for et område' in f) > 0 then return; end if;
  if position('  if new.parts is distinct from old.parts then raise exception' in f) = 0 then
    raise exception 'Uventet sjekk_threads. Kontroller funksjonen før migrering.';
  end if;
  f := replace(f, '  if new.parts is distinct from old.parts then raise exception',
'  -- Ledersamtale for et område
  if e <@ array[''parts'', ''unread'', ''omr''] and old.kind = ''gruppe'' and new.omr is not null
     and exists (select 1 from omrader o where o.id = new.omr and old."roleName" = o.name || '' – ledere''
                 and (sion.er_admin() or sion.epost() = any(o.ledere)))
     and cardinality(new.parts) between 3 and 40 and new.unread <@ new.parts then return new; end if;
  if new.parts is distinct from old.parts then raise exception');
  execute f;
end
$ledersamtaler$;
