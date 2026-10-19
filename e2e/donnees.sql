-- =============================================================================
-- Tests de bout en bout : compléments à supabase/tests/donnees_agenda.sql
-- -----------------------------------------------------------------------------
-- Un patient au nom très long (troncature, aucun mot coupé) dans la séance de vaccination
-- du prochain mardi, une planification familiale avec une note (jamais visible hors
-- soignants), demain, et un jour férié à J + 6.
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

-- Jour férié de test à J + 6 (prise d'un rendez-vous à confirmer), s'il n'y en a pas déjà un.
insert into public.holidays (org_id, holiday_date, label)
select current_setting('e2e.poste')::uuid, current_setting('e2e.auj')::date + 6, 'Fête e2e'
 where not exists (select 1 from public.holidays
                    where org_id = current_setting('e2e.poste')::uuid and deleted_at is null
                      and holiday_date = current_setting('e2e.auj')::date + 6);

commit;

-- =============================================================================
-- Étape 13, partie E : statuts, rappels, fiche, séries, report d'un jour férié
-- -----------------------------------------------------------------------------
-- Patients « SUIVI … » (hors des séances de vaccination et de soins des autres parcours) :
--   demain   : Mariama (PF, son téléphone), Coumba (PF, téléphone du conjoint), Modou et
--              Aïda (consultations, téléphone de la mère) ; Ndiaga et Sokhna (consultations,
--              sans téléphone : section « Sans téléphone » unique, après les numéros) ;
--   aujourd'hui : Rokhaya (PF, pour « Arrivé »), Absente (consultation, pour « Absent ») ;
--   J + 5    : Annulée (consultation, pour « Annuler ») ;
--   J + 12   : Férié 1 (consultation) et Férié 2 (PF), pour le jour férié daté après coup ;
--   passés   : un rendez-vous honoré et un manqué pour Mariama (taux d'absence 50 %),
--              et une série de PF à J + 30 (masquée à l'accueil).
-- Jour férié à J + 20 + 3 mois : 2e date de la série prise dans serie-rdv.spec.js.
-- =============================================================================

begin;

select set_config('e2e.poste', id::text, true) from public.organizations where name = 'Poste de santé Test';
select set_config('e2e.owner', '00000000-0000-4000-e2e0-000000000001', true);
select set_config('e2e.auj', public.org_local_date(current_setting('e2e.poste')::uuid)::text, true);

create function pg_temp.type_suivi(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('e2e.poste')::uuid and template_code = p_code;
$$;
create function pg_temp.a(p_jours integer, p_heure time) returns timestamptz language sql as $$
  select ((current_setting('e2e.auj')::date + p_jours) + p_heure) at time zone 'Africa/Dakar';
$$;
grant execute on function pg_temp.type_suivi(text), pg_temp.a(integer, time) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('e2e.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_org uuid := current_setting('e2e.poste')::uuid;
  v_id  uuid;
  r     record;
begin
  for r in select * from (values
      ('Mariama', 'F', '+221770001001', 'patient',  'pf',           1, '14:00'),
      ('Coumba',  'F', '+221770001002', 'conjoint', 'pf',           1, '14:20'),
      ('Modou',   'M', '+221770001003', 'mere',     'consultation', 1, '15:00'),
      ('Aïda',    'F', '+221770001003', 'mere',     'consultation', 1, '15:15'),
      ('Ibou',    'M', '+221770001007', 'patient',  'consultation', 1, '15:30'),
      ('Fallou',  'M', '+221770001008', 'conjoint', 'consultation', 1, '15:45'),
      ('Ndiaga',  'M', null,            null,       'consultation', 1, '07:30'),
      ('Sokhna',  'F', null,            null,       'consultation', 1, '16:30'),
      ('Rokhaya', 'F', '+221770001004', 'patient',  'pf',           0, '07:00'),
      ('Absente', 'F', null,            null,       'consultation', 0, '07:15'),
      ('Annulée', 'F', null,            null,       'consultation', 5, '09:00'),
      ('Férié 1', 'M', null,            null,       'consultation', 12, '09:00'),
      ('Férié 2', 'F', '+221770001005', 'patient',  'pf',           12, '10:00'),
      ('Série',   'F', '+221770001006', 'patient',  null,           null, null))
    v(prenom, sexe, tel, titulaire, type_code, jours, heure)
  loop
    insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone,
                                 phone_owner, whatsapp_consent, preferred_language)
    values (v_org, 'SUIVI', r.prenom, r.sexe, 26, r.tel, r.titulaire, r.tel is not null,
            case when r.prenom = 'Aïda' then 'wo' else 'fr' end)
    returning id into v_id;
    if r.type_code is not null then
      perform public.book_appointment(v_org, v_id, pg_temp.type_suivi(r.type_code),
        pg_temp.a(r.jours, r.heure::time),
        p_note => case when r.prenom = 'Mariama' then 'Pilule mal tolérée' end, p_confirm => true);
    end if;
    if r.prenom = 'Mariama' then
      perform public.book_appointment(v_org, v_id, pg_temp.type_suivi('pf'), pg_temp.a(30, '11:00'),
        p_count => 3, p_interval_months => 3, p_confirm => true);
    end if;
  end loop;
end $$;

reset role;

-- Rendez-vous passés de Mariama (écrits directement : la base refuse une date passée).
insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, arrived_at, source)
select current_setting('e2e.poste')::uuid, p.id, pg_temp.type_suivi('consultation'),
       pg_temp.a(-30 - n, '09:00'), pg_temp.a(-30 - n, '09:15'),
       current_setting('e2e.auj')::date - 30 - n,
       case when n = 0 then 'arrived' else 'no_show' end,
       case when n = 0 then pg_temp.a(-30, '09:05') end, 'agenda'
  from public.patients p, generate_series(0, 1) n
 where p.org_id = current_setting('e2e.poste')::uuid and p.last_name = 'SUIVI'
   and p.first_name = 'Mariama';

insert into public.holidays (org_id, holiday_date, label)
select current_setting('e2e.poste')::uuid,
       (current_setting('e2e.auj')::date + 20 + interval '3 months')::date, 'Fête de la série'
 where not exists (select 1 from public.holidays
                    where org_id = current_setting('e2e.poste')::uuid and deleted_at is null
                      and holiday_date = (current_setting('e2e.auj')::date + 20 + interval '3 months')::date);

commit;
