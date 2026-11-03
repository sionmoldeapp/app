-- Legg til fem bakgrunnsvalg uten å endre deltakertilgang eller andre triggerregler.
-- Beholder den gjeldende funksjonen i databasen; trygg å kjøre på nytt.
do $bakgrunner$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('''neon22''' in f) > 0 then return; end if;
  if position('''neon17'')' in f) = 0 then
    raise exception 'Uventet bakgrunnsliste. Kontroller sjekk_threads før migrering.';
  end if;
  f := replace(f, '''neon17'')', '''neon17'', ''neon18'', ''neon19'', ''neon20'', ''neon21'', ''neon22'')');
  execute f;
end
$bakgrunner$;
