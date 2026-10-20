-- =============================================================================
-- Tests de bout en bout : compléments à supabase/tests/donnees_agenda.sql
-- -----------------------------------------------------------------------------
-- Un patient au nom très long (troncature, aucun mot coupé) dans la séance de vaccination
-- du prochain mardi, une planification familiale avec une note (jamais visible hors
-- soignants), demain, et un jour férié à J + 6.
-- =============================================================================

-- Un type discret (PF) n'est pris que par un rôle médical (étape 14, partie C) : l'owner du
-- poste « exerce » le temps du chargement, puis redevient l'owner qui n'exerce pas des
-- parcours (dernière instruction du fichier).
update public.memberships set is_clinician = true
 where user_id = '00000000-0000-4000-e2e0-000000000001';

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
--   J + 12 ou après : Férié 1 (consultation) et Férié 2 (PF), pour le jour férié daté après
--              coup, au premier jour ouvert (ni férié, ni fermé) à partir de J + 12 :
--              e2e.ferie, relu par e2e/ferie-report.spec.js ;
--   passés   : un rendez-vous honoré et un manqué pour Mariama (taux d'absence 50 %),
--              et une série de PF à J + 30 (masquée à l'accueil).
-- Jour férié à J + 20 + 3 mois : 2e date de la série prise dans serie-rdv.spec.js.
-- =============================================================================

begin;

select set_config('e2e.poste', id::text, true) from public.organizations where name = 'Poste de santé Test';
select set_config('e2e.owner', '00000000-0000-4000-e2e0-000000000001', true);
select set_config('e2e.auj', public.org_local_date(current_setting('e2e.poste')::uuid)::text, true);
-- Premier jour ouvert à partir de J + 12 (le 1er novembre, Tabaski… sont déjà fériés).
select set_config('e2e.ferie', min(d)::date::text, true)
  from generate_series(current_setting('e2e.auj')::date + 12, current_setting('e2e.auj')::date + 60,
                       interval '1 day') d
  join public.organizations o on o.id = current_setting('e2e.poste')::uuid
 where not exists (select 1 from public.holidays h
                    where h.org_id = o.id and h.holiday_date = d::date and h.deleted_at is null)
   and coalesce(o.settings -> 'opening_hours'
                  -> public.weekday_key(extract(isodow from d)::integer) ->> 'statut', '') <> 'ferme';

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
      ('Férié 1', 'M', null,            null,       'consultation', -1, '09:00'),
      ('Férié 2', 'F', '+221770001005', 'patient',  'pf',           -1, '10:00'),
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
        -- jours = -1 : jour du férié de test (e2e.ferie).
        case when r.jours = -1
             then (current_setting('e2e.ferie')::date + r.heure::time) at time zone 'Africa/Dakar'
             else pg_temp.a(r.jours, r.heure::time) end,
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

-- =============================================================================
-- Étape 14, partie B : écran de consultation
-- -----------------------------------------------------------------------------
-- Patients « CONSULT … », arrivés aujourd'hui avec un motif, en consultation, constantes
-- prises par l'infirmier :
--   Fatou    : parcours complet (saisie, coupure, validation, avenant) ;
--   Ibrahima : reprise par la sage-femme ;
--   Aliou    : même consultation ouverte sur deux appareils (version dépassée) ;
--   Lecture, Relecture : consultation déjà validée, patiente rappelée en consultation (une
--              par largeur du parcours « écran de consultation ») ;
--   Alerte, Repli : choléra validé, notification attendue chez l'owner sans rechargement
--              (temps réel, puis repli toutes les 60 s quand le temps réel est coupé).
-- =============================================================================

begin;

select set_config('e2e.poste', id::text, true) from public.organizations where name = 'Poste de santé Test';
select set_config('e2e.owner', '00000000-0000-4000-e2e0-000000000001', true);
select set_config('e2e.infirmier', '00000000-0000-4000-e2e0-000000000002', true);

create function pg_temp.file_consult() returns uuid language sql security definer as $$
  select id from public.queue_services
   where org_id = current_setting('e2e.poste')::uuid and template_code = 'consultation';
$$;
grant execute on function pg_temp.file_consult() to authenticated;

set local role authenticated;

do $$
declare
  v_org uuid := current_setting('e2e.poste')::uuid;
  v_p   uuid;
  v_v   uuid;
  v_e   jsonb;
  v_s   jsonb;
  r     record;
begin
  for r in select * from (values
      ('Fatou',    'F', 30, 'Toux et fièvre depuis 3 jours'),
      ('Ibrahima', 'M', 45, 'Douleurs abdominales'),
      ('Aliou',    'M', 52, 'Contrôle de tension'),
      ('Lecture',  'F', 38, 'Maux de tête'),
      ('Relecture', 'F', 36, 'Maux de tête'),
      ('Alerte',   'M', 23, 'Diarrhée aqueuse abondante'),
      ('Repli',    'F', 41, 'Diarrhée aqueuse abondante'))
    v(prenom, sexe, age, motif)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', current_setting('e2e.owner'), 'role', 'authenticated')::text, true);
    insert into public.patients (org_id, last_name, first_name, sex, declared_age)
    values (v_org, 'CONSULT', r.prenom, r.sexe, r.age) returning id into v_p;
    v_v := (public.register_arrival(v_org, v_p, pg_temp.file_consult(), 'normal', r.motif)).id;
    perform public.move_visit(v_v, 'consultation');

    perform set_config('request.jwt.claims',
      json_build_object('sub', current_setting('e2e.infirmier'), 'role', 'authenticated')::text, true);
    perform public.save_vitals(v_v, '{"temperature_c": 38.6, "systolic": 125, "diastolic": 80, "pulse": 96}');

    if r.prenom in ('Lecture', 'Relecture') then
      v_e := public.start_encounter(v_p, v_v);
      v_s := public.save_encounter_draft((v_e ->> 'id')::uuid, (v_e ->> 'version')::integer,
        jsonb_build_object('reason', r.motif, 'examination', 'Examen neurologique normal.',
                           'plan', 'Paracétamol, revoir si persistance.'));
      perform public.validate_encounter((v_e ->> 'id')::uuid, (v_s ->> 'version')::integer);
      -- La validation clôt le passage (étape 14, correctif) ; la patiente est rappelée en
      -- consultation le même jour (deuxième consultation sur le même passage).
      perform public.move_visit(v_v, 'waiting');
      perform public.move_visit(v_v, 'consultation');
    end if;
  end loop;
end $$;

reset role;
commit;

-- =============================================================================
-- Étape 14, partie C : antécédents, chronologie, consultation sensible
-- -----------------------------------------------------------------------------
-- « DOSSIER Khadija » : passage du jour (motif réservé aux soignants), rendez-vous de PF
-- dans 10 jours (type discret), consultation ordinaire validée (paludisme), consultation
-- sensible validée (TDR VIH), antécédents ordinaire (drépanocytose) et sensible (VIH),
-- et 24 passages anciens (chronologie sur plusieurs pages).
-- « DOSSIER Seynabou » : passage du jour, en consultation, pour la consultation rendue
-- sensible par un diagnostic (B20) dans le parcours.
-- =============================================================================

begin;

select set_config('e2e.poste', id::text, true) from public.organizations where name = 'Poste de santé Test';
select set_config('e2e.owner', '00000000-0000-4000-e2e0-000000000001', true);
select set_config('e2e.infirmier', '00000000-0000-4000-e2e0-000000000002', true);
select set_config('e2e.jour', public.org_local_date(current_setting('e2e.poste')::uuid)::text, true);

create function pg_temp.file_dossier() returns uuid language sql security definer as $$
  select id from public.queue_services
   where org_id = current_setting('e2e.poste')::uuid and template_code = 'consultation';
$$;
create function pg_temp.type_dossier(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('e2e.poste')::uuid and template_code = p_code;
$$;
create function pg_temp.diag_dossier(p_code text) returns uuid language sql security definer as $$
  select id from public.diagnoses_catalog where org_id is null and code = p_code;
$$;
create function pg_temp.tdr_dossier(p_code text) returns uuid language sql security definer as $$
  select id from public.rapid_test_types
   where org_id = current_setting('e2e.poste')::uuid and template_code = p_code;
$$;
grant execute on function pg_temp.file_dossier(), pg_temp.type_dossier(text),
  pg_temp.diag_dossier(text), pg_temp.tdr_dossier(text) to authenticated;

set local role authenticated;

do $$
declare
  v_org uuid := current_setting('e2e.poste')::uuid;
  v_p   uuid;
  v_s   uuid;
  v_v   uuid;
  v_e   jsonb;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('e2e.owner'), 'role', 'authenticated')::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'DOSSIER', 'Khadija', 'F', 34) returning id into v_p;
  v_v := (public.register_arrival(v_org, v_p, pg_temp.file_dossier(), 'normal',
          'Brûlures mictionnelles')).id;
  perform public.book_appointment(v_org, v_p, pg_temp.type_dossier('pf'),
    ((current_setting('e2e.jour')::date + 10) + time '11:30') at time zone 'Africa/Dakar',
    p_note => 'Renouvellement implant', p_confirm => true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'DOSSIER', 'Seynabou', 'F', 41) returning id into v_s;
  perform public.move_visit((public.register_arrival(v_org, v_s, pg_temp.file_dossier(),
    'normal', 'Fatigue')).id, 'consultation');

  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('e2e.infirmier'), 'role', 'authenticated')::text, true);
  -- Consultation ordinaire (passage du jour).
  v_e := public.start_encounter(v_p, v_v);
  v_r := public.save_encounter_draft((v_e ->> 'id')::uuid, (v_e ->> 'version')::integer,
    jsonb_build_object('reason', 'Toux persistante', 'examination', 'Râles bronchiques.',
      'diagnoses', jsonb_build_array(jsonb_build_object(
        'catalog_id', pg_temp.diag_dossier('B50.9'), 'rank', 'primary'))));
  perform public.validate_encounter((v_e ->> 'id')::uuid, (v_r ->> 'version')::integer);
  -- Consultation sensible par le TDR VIH (hors passage).
  v_e := public.start_encounter(v_p, null);
  v_r := public.save_encounter_draft((v_e ->> 'id')::uuid, (v_e ->> 'version')::integer,
    jsonb_build_object('reason', 'Dépistage volontaire', 'tests', jsonb_build_array(
      jsonb_build_object('rapid_test_type_id', pg_temp.tdr_dossier('tdr_vih'), 'result', 'negative'))));
  perform public.validate_encounter((v_e ->> 'id')::uuid, (v_r ->> 'version')::integer);
  -- Antécédents.
  perform public.save_medical_history_item(v_p, null, 'medical', 'Drépanocytose SS', null, 1995);
  perform public.save_medical_history_item(v_p, null, 'medical', 'Infection VIH sous traitement',
    null, 2018, true);
end $$;

reset role;

-- 24 passages anciens de Khadija (écrits directement : la base date un passage du jour).
insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                           ticket_number, status, arrived_at, finished_at)
select current_setting('e2e.poste')::uuid, p.id, pg_temp.file_dossier(), d::date, 900,
       'A-900', 'done', (d::date + time '09:00') at time zone 'Africa/Dakar',
       (d::date + time '09:30') at time zone 'Africa/Dakar'
  from public.patients p,
       generate_series(public.org_local_date(current_setting('e2e.poste')::uuid) - 120,
                       public.org_local_date(current_setting('e2e.poste')::uuid) - 5,
                       interval '5 days') d
 where p.last_name = 'DOSSIER' and p.first_name = 'Khadija';

commit;

update public.memberships set is_clinician = false
 where user_id = '00000000-0000-4000-e2e0-000000000001';
