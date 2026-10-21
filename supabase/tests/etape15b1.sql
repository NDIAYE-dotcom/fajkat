-- =============================================================================
-- Tests — étape 15, partie B1 : CPN (socle)
-- -----------------------------------------------------------------------------
-- Vérifie : types de consultation de la maternité (accouchement désactivé) ; un rendez-vous
-- CPN ou postnatal choisit le type de consultation ; rappels sans type, option « nommer le
-- type » impossible pour un type discret ; modèle de CPN par offre, gardé par la grossesse ;
-- listes recopiées, modifiées par owner, admin et sage-femme seulement ; CPN recopiée du
-- brouillon à la validation (numéro, âge gestationnel, poids et tension du passage, choix
-- des listes), refus lisibles ; CPN faite ailleurs comptée, numérotée par date, retirée
-- avec un motif ; anc_status (attendues, faites, manquées, prochaine) ; aide-soignant en
-- lecture seule, consultation sensible masquée ; accueil, caissier, owner qui n'exerce pas
-- refusés ; aucune lecture directe ; lignes figées ; journal sans valeur.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape15b1.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a15b-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e15b-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e', '09', '08']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15b-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé de Kolda', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15b-000000000008", "role": "authenticated"}', true);
select set_config('test.clinique',
  public.create_organization('Clinique Les Palmiers', 'clinique', 'SN', 'Dakar')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b sage-femme, 0c infirmier, 0d aide-soignant, 0e caissier,
-- 09 accueil ; 08 owner de la clinique.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a15b-0000000000' || c)::uuid, r, true, false
  from (values ('0b', 'sage_femme'), ('0c', 'infirmier'), ('0d', 'aide_soignant'),
               ('0e', 'caissier'), ('09', 'accueil')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a15b-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.refus(p_sql text, p_code text, p_extrait text default null)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ÉCHEC : accepté alors que refusé était attendu : %', p_sql;
exception
  when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlstate <> p_code or (p_extrait is not null and position(p_extrait in sqlerrm) = 0) then
      raise exception 'ÉCHEC : % -> % « % » (attendu % « % »)', p_sql, sqlstate, sqlerrm,
        p_code, coalesce(p_extrait, '');
    end if;
end;
$$;
create function pg_temp.type_rdv(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.type_cs(p_code text) returns uuid language sql security definer as $$
  select id from public.encounter_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.option(p_list text, p_code text) returns uuid language sql security definer as $$
  select id from public.anc_options
   where org_id = current_setting('test.org')::uuid and list_code = p_list and template_code = p_code;
$$;
create function pg_temp.enc(p_id uuid) returns public.encounters language sql security definer as $$
  select * from public.encounters where id = p_id;
$$;
create function pg_temp.enc_patient(p_id uuid) returns public.encounters language sql security definer as $$
  select * from public.encounters where patient_id = p_id order by created_at limit 1;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text),
  pg_temp.type_rdv(text), pg_temp.type_cs(text), pg_temp.option(text, text),
  pg_temp.enc(uuid), pg_temp.enc_patient(uuid) to authenticated;

select set_config('test.jour', public.org_local_date(current_setting('test.org')::uuid)::text, false);

-- -----------------------------------------------------------------------------
-- 1. Types de consultation, modèles, listes
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid;
begin
  foreach v_org in array array[current_setting('test.org')::uuid, current_setting('test.clinique')::uuid] loop
    if (select count(*) from public.encounter_types where org_id = v_org
         and template_code in ('cpn', 'postnatal') and is_active) <> 2
       or (select count(*) from public.encounter_types where org_id = v_org
            and template_code = 'accouchement' and not is_active) <> 1 then
      raise exception 'ÉCHEC : types de la maternité absents (%)', v_org;
    end if;
    -- Rejouable : rien en double.
    perform public.seed_maternity_encounter_types(v_org);
    perform public.seed_anc_options(v_org);
    if (select count(*) from public.encounter_types where org_id = v_org
         and template_code in ('cpn', 'postnatal', 'accouchement')) <> 3
       or (select count(*) from public.anc_options where org_id = v_org) <> 17 then
      raise exception 'ÉCHEC : types ou listes recopiés en double (%)', v_org;
    end if;
  end loop;
  if (select anc_model_code from public.maternity_settings
       where org_id = current_setting('test.org')::uuid) <> 'cpn4'
     or (select anc_model_code from public.maternity_settings
          where org_id = current_setting('test.clinique')::uuid) <> 'oms2016_8' then
    raise exception 'ÉCHEC : modèle de CPN par offre';
  end if;
  if (select count(*) from public.anc_schedule_contacts where model_code = 'cpn4') <> 4
     or (select count(*) from public.anc_schedule_contacts where model_code = 'oms2016_8') <> 8 then
    raise exception 'ÉCHEC : contacts des modèles';
  end if;
  raise notice 'OK : types CPN, postnatal (actifs) et accouchement (désactivé) ; 4 CPN au poste, 8 contacts en clinique ; 17 choix recopiés';
end $$;

set local role authenticated;
do $$
declare
  v_n integer;
begin
  -- Accueil et infirmier : listes lues, jamais modifiées.
  perform pg_temp.en_tant_que('09');
  if (select count(*) from public.anc_options where org_id = current_setting('test.org')::uuid) <> 17 then
    raise exception 'ÉCHEC : listes illisibles pour un membre';
  end if;
  perform pg_temp.refus(format($q$insert into public.anc_options (org_id, list_code, label)
    values (%L, 'oedema', 'Visage')$q$, current_setting('test.org')), '42501');
  perform pg_temp.en_tant_que('0c');
  update public.anc_options set label = 'Tête' where id = pg_temp.option('presentation', 'cephalique');
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ÉCHEC : infirmier renomme un choix'; end if;
  update public.maternity_settings set anc_model_code = 'oms2016_8'
   where org_id = current_setting('test.org')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ÉCHEC : infirmier change le modèle de CPN'; end if;
  -- Sage-femme : ajoute et renomme ; jamais de suppression.
  perform pg_temp.en_tant_que('0b');
  insert into public.anc_options (org_id, list_code, label, sort_order)
  values (current_setting('test.org')::uuid, 'oedema', 'Visage et mains', 40);
  update public.anc_options set label = 'Siège complet' where id = pg_temp.option('presentation', 'siege');
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ÉCHEC : sage-femme ne renomme pas un choix'; end if;
  perform pg_temp.refus(format('delete from public.anc_options where id = %L',
    pg_temp.option('presentation', 'transverse')), '42501');
  -- L'autre structure ne voit rien.
  perform pg_temp.en_tant_que('08');
  if exists (select 1 from public.anc_options where org_id = current_setting('test.org')::uuid) then
    raise exception 'ÉCHEC : listes lues par une autre structure';
  end if;
  raise notice 'OK : listes lues par les membres, modifiées par la sage-femme seule, jamais supprimées';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Rappels sans type
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_p   uuid;
  v_a   uuid;
  v_c   uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'RAPPEL', 'Awa', 'F', 25) returning id into v_p;
  insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                   local_date, status, source)
  values (v_org, v_p, pg_temp.type_rdv('vaccination'), now() + interval '1 day',
          now() + interval '1 day 10 minutes', current_setting('test.jour')::date + 1,
          'scheduled', 'agenda')
  returning id into v_a;
  if public.appointment_patient_label(v_a) <> 'un rendez-vous au poste de santé de Kolda' then
    raise exception 'ÉCHEC : rappel par défaut : %', public.appointment_patient_label(v_a);
  end if;
  update public.appointment_types set name_in_reminder = true where id = pg_temp.type_rdv('vaccination');
  if public.appointment_patient_label(v_a) <> 'un rendez-vous au poste de santé de Kolda (Vaccination)' then
    raise exception 'ÉCHEC : type nommé à la demande : %', public.appointment_patient_label(v_a);
  end if;
  perform pg_temp.refus(format('update public.appointment_types set name_in_reminder = true where id = %L',
    pg_temp.type_rdv('pf')), '23514');
  perform pg_temp.refus(format('update public.appointment_types set is_discreet = true where id = %L',
    pg_temp.type_rdv('vaccination')), '23514');
  -- Clinique : « à la clinique Les Palmiers ».
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.clinique')::uuid, 'RAPPEL', 'Fatou', 'F', 30) returning id into v_c;
  insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                   local_date, status, source)
  select current_setting('test.clinique')::uuid, v_c, t.id, now() + interval '1 day',
         now() + interval '1 day 20 minutes', current_setting('test.jour')::date + 1, 'scheduled', 'agenda'
    from public.appointment_types t
   where t.org_id = current_setting('test.clinique')::uuid and t.template_code = 'cpn'
  returning id into v_a;
  if public.appointment_patient_label(v_a) <> 'un rendez-vous à la clinique Les Palmiers' then
    raise exception 'ÉCHEC : rappel en clinique : %', public.appointment_patient_label(v_a);
  end if;
  update public.appointment_types set name_in_reminder = false where id = pg_temp.type_rdv('vaccination');
  raise notice 'OK : rappels sans type par défaut, type nommé sur option, jamais pour un type discret';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Patientes, grossesses, arrivée sur rendez-vous CPN
-- -----------------------------------------------------------------------------
-- Awa : DDR il y a 140 jours (20 SA). Bineta : DDR il y a 210 jours (30 SA), aucune CPN.
-- Coumba : pas de grossesse. Rendez-vous CPN d'Awa et postnatal de Coumba aujourd'hui.
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_id  uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'CPN', 'Awa', 'F', 24) returning id into v_id;
  perform set_config('test.awa', v_id::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'CPN', 'Bineta', 'F', 31) returning id into v_id;
  perform set_config('test.bineta', v_id::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'CPN', 'Coumba', 'F', 28) returning id into v_id;
  perform set_config('test.coumba', v_id::text, true);
  insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                   local_date, status, source)
  values (v_org, current_setting('test.awa')::uuid, pg_temp.type_rdv('cpn'), now(),
          now() + interval '30 minutes', current_setting('test.jour')::date, 'scheduled', 'agenda'),
         (v_org, current_setting('test.coumba')::uuid, pg_temp.type_rdv('postnatal'), now(),
          now() + interval '30 minutes', current_setting('test.jour')::date, 'scheduled', 'agenda');
end $$;

set local role authenticated;
select pg_temp.en_tant_que('0b');
select set_config('test.g_awa', public.open_pregnancy(current_setting('test.awa')::uuid, 'lmp',
  current_setting('test.jour')::date - 140, null, null, null, 2, 1, 1)::text, true);
select set_config('test.g_bineta', public.open_pregnancy(current_setting('test.bineta')::uuid, 'lmp',
  current_setting('test.jour')::date - 210, null, null, null, 1, 0, 0)::text, true);

select pg_temp.en_tant_que('09');
select set_config('test.v_awa', (public.arrive_appointment(
  (select id from public.appointments where patient_id = current_setting('test.awa')::uuid))).id::text, true);
select set_config('test.v_coumba', (public.arrive_appointment(
  (select id from public.appointments where patient_id = current_setting('test.coumba')::uuid))).id::text, true);

select pg_temp.en_tant_que('0b');
select public.save_vitals(current_setting('test.v_awa')::uuid, '{"systolic": 120, "diastolic": 75}');
select public.save_vitals(current_setting('test.v_awa')::uuid, '{"weight_kg": 62}');

do $$
declare
  v jsonb;
begin
  v := public.start_encounter(current_setting('test.awa')::uuid, current_setting('test.v_awa')::uuid);
  if (v ->> 'encounter_type_id')::uuid <> pg_temp.type_cs('cpn') then
    raise exception 'ÉCHEC : rendez-vous CPN -> type %', v ->> 'type_label';
  end if;
  perform set_config('test.e_awa', v ->> 'id', true);
  v := public.start_encounter(current_setting('test.coumba')::uuid, current_setting('test.v_coumba')::uuid);
  if (v ->> 'encounter_type_id')::uuid <> pg_temp.type_cs('postnatal') then
    raise exception 'ÉCHEC : rendez-vous postnatal -> type %', v ->> 'type_label';
  end if;
  -- Modèle gardé par la grossesse : un changement de réglage ne vaut que pour les suivantes.
  update public.maternity_settings set anc_model_code = 'oms2016_8'
   where org_id = current_setting('test.org')::uuid;
  if (public.anc_status(current_setting('test.g_awa')::uuid) ->> 'model_code') <> 'cpn4' then
    raise exception 'ÉCHEC : modèle de la grossesse changé par le réglage';
  end if;
  update public.maternity_settings set anc_model_code = 'cpn4'
   where org_id = current_setting('test.org')::uuid;
  raise notice 'OK : rendez-vous CPN et postnatal -> type de consultation ; modèle gardé par la grossesse';
end $$;

-- -----------------------------------------------------------------------------
-- 4. CPN faite ici : brouillon puis validation
-- -----------------------------------------------------------------------------
do $$
declare
  v_enc public.encounters := pg_temp.enc(current_setting('test.e_awa')::uuid);
  v_ver integer := v_enc.version;
  v     jsonb;
  v_m   jsonb;
begin
  v := public.get_encounter_anc(v_enc.id);
  if not (v ->> 'is_anc')::boolean or (v ->> 'anc_number')::integer <> 1
     or (v #>> '{pregnancy,ga_days}')::integer <> 140
     or (v #>> '{vitals,weight_kg}')::numeric <> 62 or (v #>> '{vitals,systolic}')::integer <> 120 then
    raise exception 'ÉCHEC : section CPN du brouillon : %', v;
  end if;

  v_m := jsonb_build_object('fundal_height_cm', '18,5', 'fetal_heart_heard', true,
    'fetal_heart_rate', 142, 'presentation_option_id', pg_temp.option('presentation', 'siege'),
    'oedema_option_id', pg_temp.option('oedema', 'absents'),
    'proteinuria_option_id', pg_temp.option('proteinuria', 'traces'),
    'glycosuria_option_id', pg_temp.option('glycosuria', 'negative'), 'note', 'RAS');

  -- Refus lisibles, brouillon gardé.
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'CPN',
    'maternite', v_m || '{"fundal_height_cm": 80}')) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'Hauteur utérine');
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'CPN',
    'maternite', v_m || '{"fetal_heart_heard": false}')) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'perçus');
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'CPN',
    'maternite', v_m || jsonb_build_object('oedema_option_id', pg_temp.option('presentation', 'siege'))))
    ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'Œdèmes');

  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'CPN',
    'maternite', v_m)) ->> 'version')::integer;
  v := public.validate_encounter(v_enc.id, v_ver);
  if v ->> 'status' <> 'validated' then
    raise exception 'ÉCHEC : CPN non validée';
  end if;
  v := public.get_encounter_anc(v_enc.id);
  if (v ->> 'anc_number')::integer <> 1 or (v #>> '{visit,ga_days}')::integer <> 140
     or (v #>> '{visit,fundal_height_cm}')::numeric <> 18.5
     or v #>> '{visit,presentation}' <> 'Siège complet' or v #>> '{visit,proteinuria}' <> 'Traces' then
    raise exception 'ÉCHEC : CPN enregistrée : %', v;
  end if;
  raise notice 'OK : CPN recopiée du brouillon (n° 1, 20 SA, HU 18,5 cm, libellés du jour), refus lisibles';
end $$;

-- Coumba : consultation de type CPN sans grossesse -> refus qui dit quoi faire.
do $$
declare
  v_enc public.encounters := pg_temp.enc_patient(current_setting('test.coumba')::uuid);
  v_ver integer;
begin
  v_ver := (public.save_encounter_draft(v_enc.id, v_enc.version, jsonb_build_object('reason', 'CPN',
    'encounter_type_id', pg_temp.type_cs('cpn'))) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'ouvrez le suivi de grossesse');
  -- Revenue au type postnatal : validée sans CPN.
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'Suites de couches',
    'encounter_type_id', pg_temp.type_cs('postnatal'))) ->> 'version')::integer;
  perform public.validate_encounter(v_enc.id, v_ver);
  if exists (select 1 from public.get_encounter_anc(v_enc.id) x where (x ->> 'is_anc')::boolean) then
    raise exception 'ÉCHEC : consultation postnatale vue comme CPN';
  end if;
  raise notice 'OK : CPN sans grossesse refusée (« ouvrez le suivi de grossesse »), postnatal validé sans CPN';
end $$;

-- -----------------------------------------------------------------------------
-- 5. CPN faite ailleurs, numéros, bilan
-- -----------------------------------------------------------------------------
do $$
declare
  v_g   uuid := current_setting('test.g_awa')::uuid;
  v_j   date := current_setting('test.jour')::date;
  v_id  uuid;
  v_s   jsonb;
  v_num integer[];
begin
  perform pg_temp.refus(format('select public.add_external_anc_visit(%L, %L, %L)', v_g, v_j + 1, 'Hôpital'),
    '22023', 'futur');
  perform pg_temp.refus(format('select public.add_external_anc_visit(%L, %L, %L)', v_g, v_j - 150, 'Hôpital'),
    '22023', 'avant le début');
  perform pg_temp.refus(format('select public.add_external_anc_visit(%L, %L, %L)', v_g, v_j - 60, ' '),
    '22023', 'où la CPN');
  perform pg_temp.refus(format('select public.add_external_anc_visit(%L, %L, %L)', v_g, v_j, 'Hôpital'),
    '22023', 'déjà notée');
  -- D'après le carnet : CPN au centre de santé il y a 60 jours (11 SA 3 j).
  v_id := public.add_external_anc_visit(v_g, v_j - 60, 'Centre de santé de Kolda', 'Carnet');
  select array_agg(anc_number order by visit_date) into v_num from public.list_anc_visits(v_g);
  if v_num <> array[1, 2]
     or (select origin from public.list_anc_visits(v_g) where anc_number = 1) <> 'elsewhere'
     or (select ga_days from public.list_anc_visits(v_g) where anc_number = 1) <> 80
     or (select weight_kg from public.list_anc_visits(v_g) where anc_number = 2) <> 62
     or (select diastolic from public.list_anc_visits(v_g) where anc_number = 2) <> 75 then
    raise exception 'ÉCHEC : tableau des CPN : %', (select jsonb_agg(to_jsonb(x)) from public.list_anc_visits(v_g) x);
  end if;
  if (public.get_encounter_anc(current_setting('test.e_awa')::uuid) ->> 'anc_number')::integer <> 2 then
    raise exception 'ÉCHEC : la CPN faite ici n''est pas devenue la n° 2';
  end if;

  -- 20 SA, 4 CPN : contact 1 passé (fenêtre jusqu'à 118 j), 2 CPN faites, prochaine = contact 3.
  v_s := public.anc_status(v_g);
  if (v_s ->> 'expected')::integer <> 1 or (v_s ->> 'done')::integer <> 2
     or (v_s ->> 'done_elsewhere')::integer <> 1 or (v_s ->> 'missed')::integer <> 0
     or (v_s #>> '{next,contact_number}')::integer <> 3 or (v_s #>> '{next,anc_number}')::integer <> 3
     or (v_s #>> '{next,target_date}')::date <> v_j - 140 + 224 then
    raise exception 'ÉCHEC : bilan d''Awa : %', v_s;
  end if;
  -- 30 SA sans CPN : contacts 1 et 2 passés, deux manquées, prochaine = contact 3 (CPN n° 1).
  v_s := public.anc_status(current_setting('test.g_bineta')::uuid);
  if (v_s ->> 'expected')::integer <> 2 or (v_s ->> 'missed')::integer <> 2
     or (v_s #>> '{next,contact_number}')::integer <> 3 or (v_s #>> '{next,anc_number}')::integer <> 1 then
    raise exception 'ÉCHEC : bilan de Bineta : %', v_s;
  end if;
  -- Une CPN notée d'après le carnet réduit les manquées (pas le statut des rendez-vous).
  perform public.add_external_anc_visit(current_setting('test.g_bineta')::uuid, v_j - 100, 'Poste de Saré');
  if (public.anc_status(current_setting('test.g_bineta')::uuid) ->> 'missed')::integer <> 1 then
    raise exception 'ÉCHEC : CPN faite ailleurs non comptée';
  end if;

  -- Retrait : motif obligatoire ; une CPN faite ici ne se retire pas.
  perform pg_temp.refus(format('select public.remove_external_anc_visit(%L, %L)', v_id, ''), '22023', 'pourquoi');
  perform pg_temp.refus(format('select public.remove_external_anc_visit(%L, %L)',
    (select id from public.list_anc_visits(v_g) where origin = 'here'), 'Erreur'), '22023', 'avenant');
  perform public.remove_external_anc_visit(v_id, 'Date mal lue dans le carnet');
  if (select count(*) from public.list_anc_visits(v_g)) <> 1
     or (public.anc_status(v_g) ->> 'done')::integer <> 1 then
    raise exception 'ÉCHEC : CPN retirée encore comptée';
  end if;
  raise notice 'OK : CPN faite ailleurs comptée et numérotée par date, refus (futur, avant la grossesse, lieu, doublon), retrait motivé ; bilan attendues / faites / manquées / prochaine';
end $$;

-- -----------------------------------------------------------------------------
-- 6. Droits
-- -----------------------------------------------------------------------------
do $$
declare
  v_g uuid := current_setting('test.g_awa')::uuid;
  v_c text;
begin
  -- Aide-soignant : lecture seule.
  perform pg_temp.en_tant_que('0d');
  if (select count(*) from public.list_anc_visits(v_g)) <> 1
     or (public.anc_status(v_g) ->> 'done')::integer <> 1 then
    raise exception 'ÉCHEC : aide-soignant ne lit pas les CPN';
  end if;
  perform pg_temp.refus(format('select public.add_external_anc_visit(%L, %L, %L)', v_g,
    current_setting('test.jour')::date - 30, 'Hôpital'), '42501');
  -- Accueil, caissier, owner qui n'exerce pas : rien.
  foreach v_c in array array['09', '0e', '0a'] loop
    perform pg_temp.en_tant_que(v_c);
    perform pg_temp.refus(format('select * from public.list_anc_visits(%L)', v_g), '42501');
    perform pg_temp.refus(format('select public.anc_status(%L)', v_g), '42501');
    perform pg_temp.refus(format('select public.get_encounter_anc(%L)', current_setting('test.e_awa')), '42501');
  end loop;
  -- Aucune lecture ni écriture directe, aucune fonction interne.
  perform pg_temp.en_tant_que('0b');
  perform pg_temp.refus('select * from public.anc_visits', '42501');
  perform pg_temp.refus(format($q$insert into public.anc_visits (org_id, pregnancy_id, origin, visit_date, place, ga_days)
    values (%L, %L, 'elsewhere', current_date, 'X', 10)$q$, current_setting('test.org'), v_g), '42501');
  perform pg_temp.refus(format('select public.anc_status_compute(%L)', v_g), '42501');
  perform pg_temp.refus(format('select public.encounter_validate_extensions(pg_temp.enc(%L), %L)',
    current_setting('test.e_awa'), '{}'), '42501');
  -- L'autre structure.
  perform pg_temp.en_tant_que('08');
  perform pg_temp.refus(format('select * from public.list_anc_visits(%L)', v_g), '42501');
  raise notice 'OK : aide-soignant en lecture seule ; accueil, caissier, owner qui n''exerce pas, autre structure refusés ; aucun accès direct';
end $$;
reset role;

-- Lignes figées, même pour l'éditeur SQL.
do $$
begin
  perform pg_temp.refus(format('update public.anc_visits set fundal_height_cm = 20 where encounter_id = %L',
    current_setting('test.e_awa')), '42501', 'ne se modifie plus');
  perform pg_temp.refus(format('delete from public.anc_visits where encounter_id = %L',
    current_setting('test.e_awa')), '42501');
  perform pg_temp.refus(format($q$update public.anc_visits set place = 'Autre' where pregnancy_id = %L and origin = 'elsewhere'$q$,
    current_setting('test.g_bineta')), '42501');
  if not exists (select 1 from public.audit_medical_tables where table_name = 'anc_visits') then
    raise exception 'ÉCHEC : anc_visits absente du registre des tables médicales';
  end if;
  if exists (select 1 from public.audit_logs where table_name = 'anc_visits'
              and (coalesce(new_data, '{}') ?| array['fundal_height_cm', 'note', 'place', 'ga_days']
                   or coalesce(old_data, '{}') ?| array['fundal_height_cm', 'note', 'place', 'ga_days'])) then
    raise exception 'ÉCHEC : valeur clinique dans le journal';
  end if;
  if (select count(*) from public.audit_logs where table_name = 'anc_visits') < 3 then
    raise exception 'ÉCHEC : CPN non journalisées';
  end if;
  raise notice 'OK : CPN figées (ni modification, ni suppression), journal sans valeur, table au registre médical';
end $$;

-- -----------------------------------------------------------------------------
-- 7. CPN d'une consultation sensible : rien ne la distingue pour l'aide-soignant
-- -----------------------------------------------------------------------------
-- Bineta : une CPN ordinaire et une CPN sensible faites ici.
set local role authenticated;
select pg_temp.en_tant_que('0b');
do $$
declare
  v     jsonb;
  v_ver integer;
begin
  v := public.start_encounter(current_setting('test.bineta')::uuid, null, pg_temp.type_cs('cpn'));
  perform set_config('test.e_bineta_ord', v ->> 'id', true);
  v_ver := (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
    jsonb_build_object('reason', 'CPN', 'maternite', jsonb_build_object(
      'fundal_height_cm', 26, 'note', 'Note ordinaire'))) ->> 'version')::integer;
  perform public.validate_encounter((v ->> 'id')::uuid, v_ver);
end $$;
do $$
declare
  v     jsonb;
  v_ver integer;
  v_ord record;
  v_sen record;
begin
  v := public.start_encounter(current_setting('test.bineta')::uuid, null, pg_temp.type_cs('cpn'));
  perform set_config('test.e_bineta_sens', v ->> 'id', true);
  v_ver := (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
    jsonb_build_object('reason', 'CPN', 'is_sensitive', true,
                       'maternite', jsonb_build_object('fundal_height_cm', 27,
                                                       'note', 'Note sensible'))) ->> 'version')::integer;
  perform public.validate_encounter((v ->> 'id')::uuid, v_ver);

  perform pg_temp.en_tant_que('0d');
  select * into v_ord from public.list_anc_visits(current_setting('test.g_bineta')::uuid)
   where fundal_height_cm = 26;
  select * into v_sen from public.list_anc_visits(current_setting('test.g_bineta')::uuid)
   where fundal_height_cm = 27;
  if v_ord.id is null or v_sen.id is null then
    raise exception 'ÉCHEC : mesures d''une CPN cachées à l''aide-soignant';
  end if;
  -- Mêmes champs remplis et vides pour les deux : remarque et consultation jamais données.
  if (select array_agg(k order by k) from jsonb_each(to_jsonb(v_ord)) x(k, val) where val = 'null')
     is distinct from
     (select array_agg(k order by k) from jsonb_each(to_jsonb(v_sen)) x(k, val) where val = 'null')
     or v_ord.note is not null or v_sen.note is not null
     or v_ord.encounter_id is not null or v_sen.encounter_id is not null then
    raise exception 'ÉCHEC : CPN sensible différente d''une CPN ordinaire : % / %',
      to_jsonb(v_ord), to_jsonb(v_sen);
  end if;
  perform pg_temp.refus(format('select public.get_encounter_anc(%L)', v ->> 'id'), '42501');

  -- Sage-femme : tout, remarques et consultations comprises.
  perform pg_temp.en_tant_que('0b');
  select * into v_sen from public.list_anc_visits(current_setting('test.g_bineta')::uuid)
   where fundal_height_cm = 27;
  if v_sen.note <> 'Note sensible' or v_sen.encounter_id <> (v ->> 'id')::uuid then
    raise exception 'ÉCHEC : sage-femme sans la remarque ni la consultation';
  end if;
  raise notice 'OK : aide-soignant : mêmes champs pour une CPN sensible et une CPN ordinaire (mesures, jamais la remarque ni la consultation) ; sage-femme : tout';
end $$;

-- -----------------------------------------------------------------------------
-- 8. Consultations de maternité masquées au lecteur non habilité
-- -----------------------------------------------------------------------------
do $$
declare
  v_ord uuid := current_setting('test.e_bineta_ord')::uuid;
  v_n   integer;
begin
  -- Aide-soignant : ni la CPN ordinaire, ni la sensible, ni le postnatal de Coumba, dans la
  -- chronologie ; même refus qu'une consultation inexistante.
  perform pg_temp.en_tant_que('0d');
  select count(*) into v_n
    from public.patient_timeline(current_setting('test.bineta')::uuid, p_limit => 50)
   where encounter_id is not null;
  if v_n <> 0 then
    raise exception 'ÉCHEC : % lignes de consultation de maternité dans la chronologie (aide-soignant)', v_n;
  end if;
  if exists (select 1 from public.patient_timeline(current_setting('test.coumba')::uuid, p_limit => 50)
              where kind = 'encounter') then
    raise exception 'ÉCHEC : consultation postnatale dans la chronologie (aide-soignant)';
  end if;
  perform pg_temp.refus(format('select public.get_encounter(%L)', v_ord), '42501', 'introuvable');
  perform pg_temp.refus(format('select * from public.get_encounter_followups(%L)', v_ord), '42501', 'introuvable');
  -- Sage-femme : les deux CPN et le postnatal.
  perform pg_temp.en_tant_que('0b');
  select count(*) into v_n
    from public.patient_timeline(current_setting('test.bineta')::uuid, p_limit => 50)
   where kind = 'encounter';
  if v_n <> 2 or not exists (select 1 from public.patient_timeline(current_setting('test.coumba')::uuid, p_limit => 50)
                              where kind = 'encounter') then
    raise exception 'ÉCHEC : chronologie de la sage-femme incomplète (% CPN)', v_n;
  end if;
  if (public.get_encounter(v_ord) ->> 'status') <> 'validated' then
    raise exception 'ÉCHEC : sage-femme ne lit pas la CPN';
  end if;
  raise notice 'OK : consultations de maternité (CPN, postnatal) absentes de la chronologie et refusées à l''aide-soignant, sensibles ou non ; sage-femme : tout';
end $$;
reset role;

rollback;
