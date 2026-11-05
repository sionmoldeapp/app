-- Bare nye verdier i bakgrunnslisten. Beholder øvrig validering og deltakertilgang.
do $bakgrunner$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('''lys22''' in f) > 0 then return; end if;
  if position('''neon22'')' in f) = 0 then
    raise exception 'Uventet bakgrunnsliste. Kontroller sjekk_threads før migrering.';
  end if;
  f := replace(f, '''neon22'')', '''neon22'', ''lys18'', ''lys19'', ''lys20'', ''lys21'', ''lys22'')');
  execute f;
end
$bakgrunner$;
