-- Tolv nye motivvalg. Beholder gjeldende deltakertilgang og øvrig validering.
do $bakgrunner$
declare f text;
begin
  select pg_get_functiondef('sion.sjekk_threads()'::regprocedure) into f;
  if position('''kors-lys-lys''' in f) > 0 then return; end if;
  if position('''lys22'')' in f) = 0 then
    raise exception 'Uventet bakgrunnsliste. Kontroller sjekk_threads før migrering.';
  end if;
  f := replace(f, '''lys22'')', '''lys22'', ''jesus-skrift-mork'', ''jesus-skrift-lys'', ''jesus-bolge-mork'', ''jesus-bolge-lys'', ''jesus-enkel-mork'', ''jesus-enkel-lys'', ''kors-linje-mork'', ''kors-linje-lys'', ''kors-band-mork'', ''kors-band-lys'', ''kors-lys-mork'', ''kors-lys-lys'')');
  execute f;
end
$bakgrunner$;
