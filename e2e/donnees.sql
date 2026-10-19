-- =============================================================================
-- Tests de bout en bout : compléments à supabase/tests/donnees_agenda.sql
-- -----------------------------------------------------------------------------
-- Un patient au nom très long (troncature, aucun mot coupé) dans la séance de vaccination
-- du prochain mardi, et une planification familiale avec une note (jamais visible hors
-- soignants), demain.
-- =============================================================================

begin;

select set_config('e2e.poste', id::text, true) from public.organizations where name = 'Poste de santé Test';
select set_config('e2e.owner', '00000000-0000-4000-e2e0-000000000001', true);
select set_config('e2e.auj', public.org_local_date(current_setting('e2e.poste')::uuid)::text, true);
select set_config('e2e.mardi', (current_setting('e2e.auj')::date
  + ((2 - extract(isodow from current_setting('e2e.auj')::date)::integer + 7) % 7))::text, true);

create function pg_temp.type_rdv(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('e2e.poste')::uuid and template_code = p_code;
$$;
grant execute on function pg_temp.type_rdv(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('e2e.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_org uuid := current_setting('e2e.poste')::uuid;
  v_p   uuid;
  v_q   uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date)
  values (v_org, 'NDIAYE-DIALLO', 'Ndèye Fatou Bintou Khadidiatou', 'F', current_date - 400)
  returning id into v_p;
  perform public.book_appointment(v_org, v_p, pg_temp.type_rdv('vaccination'),
    (current_setting('e2e.mardi')::date + time '09:00') at time zone 'Africa/Dakar', p_confirm => true);

  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'TEST', 'Note discrète', 'F', 31) returning id into v_q;
  perform public.book_appointment(v_org, v_q, pg_temp.type_rdv('pf'),
    (current_setting('e2e.auj')::date + 1 + time '10:30') at time zone 'Africa/Dakar',
    p_note => 'Implant à retirer', p_confirm => true);
end $$;

reset role;
commit;
