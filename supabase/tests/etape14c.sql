-- =============================================================================
-- Tests — étape 14, partie C (antécédents, chronologie, consultation sensible)
-- -----------------------------------------------------------------------------
-- Vérifie : sensible d'office par un diagnostic sensible (B20) et par un TDR sensible
-- (TDR VIH), et toujours sensible après validation ; une ligne READ par ouverture (même
-- identifiant d'ouverture : une seule ligne, nouvelle ouverture : une ligne de plus) pour
-- une consultation et pour les antécédents sensibles ; chronologie par rôle (accueil,
-- caissier, owner qui n'exerce pas : passages et rendez-vous seulement, PF affichée
-- « Consultation », aucun motif ni diagnostic ; pharmacien : rien ; comptable : refus ;
-- aide-soignant : aucune ligne sensible ; infirmier : tout, sans diagnostic d'une
-- consultation sensible), filtre et pages ; antécédents refusés aux rôles non médicaux,
-- antécédent sensible absent chez l'aide-soignant ; identifiant d'ouverture propre à un
-- utilisateur et à un dossier, valable 12 heures ; type de rendez-vous discret masqué
-- (« Consultation ») à l'owner qui n'exerce pas dans l'agenda, l'onglet Rendez-vous et
-- les rappels, vrai type pour l'owner qui exerce.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14c.sql
-- Prérequis : migrations jusqu'à l'étape 14 (partie C) appliquées.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a14c-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14c-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0c', '0d', '09', '06', '05', '07']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14c-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 14C', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
-- 0a owner (n'exerce pas), 0c infirmier, 0d aide-soignant, 09 accueil, 06 caissier,
-- 05 comptable, 07 pharmacien.
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a14c-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('0d', 'aide_soignant'), ('09', 'accueil'),
               ('06', 'caissier'), ('05', 'comptable'), ('07', 'pharmacien')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a14c-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.file(p_code text) returns uuid language sql security definer as $$
  select id from public.queue_services
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.type_rdv(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.diag(p_code text) returns uuid language sql security definer as $$
  select id from public.diagnoses_catalog where org_id is null and code = p_code;
$$;
create function pg_temp.test_rapide(p_code text) returns uuid language sql security definer as $$
  select id from public.rapid_test_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.sensible(p_id uuid) returns boolean language sql security definer as $$
  select is_sensitive from public.encounters where id = p_id;
$$;
create function pg_temp.lectures(p_table text, p_id uuid) returns bigint language sql security definer as $$
  select count(*) from public.audit_logs
   where action = 'READ' and table_name = p_table and record_id = p_id::text;
$$;
-- Refus attendu : le code d'erreur et un extrait du message.
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
-- Consultation commencée, enregistrée avec p_data, puis validée par l'infirmier.
create function pg_temp.consulter(p_patient uuid, p_visite uuid, p_data jsonb, p_valider boolean default true)
returns uuid language plpgsql as $$
declare
  v jsonb;
  s jsonb;
begin
  v := public.start_encounter(p_patient, p_visite);
  s := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer, p_data);
  if p_valider then
    perform public.validate_encounter((v ->> 'id')::uuid, (s ->> 'version')::integer);
  end if;
  return (v ->> 'id')::uuid;
end;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.file(text), pg_temp.type_rdv(text),
  pg_temp.diag(text), pg_temp.test_rapide(text), pg_temp.sensible(uuid),
  pg_temp.lectures(text, uuid), pg_temp.refus(text, text, text),
  pg_temp.consulter(uuid, uuid, jsonb, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Patient, passages, rendez-vous de PF (type discret), consultations
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_id  uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone, phone_owner)
  values (v_org, 'Ndiaye', 'Aminata', 'F', 29, '+221770009999', 'patient') returning id into v_id;
  perform set_config('test.p', v_id::text, true);
  perform set_config('test.v1', (select (public.register_arrival(v_org, v_id,
    pg_temp.file('consultation'), 'normal', 'Fièvre et frissons')).id::text), true);
end $$;

reset role;
insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, source)
values (current_setting('test.org')::uuid, current_setting('test.p')::uuid, pg_temp.type_rdv('pf'),
        now() + interval '30 days', now() + interval '30 days 20 minutes',
        public.org_local_date(current_setting('test.org')::uuid) + 30, 'scheduled', 'agenda')
returning set_config('test.rdv_pf', id::text, true);
select set_config('request.jwt.claims', '', true);
insert into public.appointment_notes (org_id, appointment_id, note)
values (current_setting('test.org')::uuid, current_setting('test.rdv_pf')::uuid, 'Implant à retirer');
set local role authenticated;

select pg_temp.en_tant_que('0c');
do $$
declare
  v_ord uuid;
  v_vih uuid;
  v_tdr uuid;
  v_brouillon uuid;
begin
  -- Ordinaire : paludisme.
  v_ord := pg_temp.consulter(current_setting('test.p')::uuid, current_setting('test.v1')::uuid,
    jsonb_build_object('reason', 'Fièvre et frissons', 'diagnoses', jsonb_build_array(
      jsonb_build_object('catalog_id', pg_temp.diag('B50.9'), 'rank', 'primary'))));
  assert not pg_temp.sensible(v_ord), 'ordinaire';
  perform set_config('test.e_ord', v_ord::text, true);

  -- Diagnostic sensible : sensible dès l'enregistrement du brouillon, et après validation.
  v_brouillon := pg_temp.consulter(current_setting('test.p')::uuid, null,
    jsonb_build_object('reason', 'Contrôle', 'diagnoses', jsonb_build_array(
      jsonb_build_object('catalog_id', pg_temp.diag('B20'), 'rank', 'primary'))), false);
  assert pg_temp.sensible(v_brouillon), 'sensible dès le brouillon (diagnostic)';
  -- Diagnostic retiré du brouillon : la consultation reste sensible.
  perform public.save_encounter_draft(v_brouillon,
    (public.get_encounter(v_brouillon) ->> 'version')::integer, '{"reason": "Contrôle"}');
  assert pg_temp.sensible(v_brouillon), 'reste sensible sans le diagnostic';
  perform public.validate_encounter(v_brouillon, (public.get_encounter(v_brouillon) ->> 'version')::integer);
  assert pg_temp.sensible(v_brouillon), 'sensible après validation (diagnostic)';
  v_vih := v_brouillon;
  perform set_config('test.e_vih', v_vih::text, true);

  -- TDR VIH : sensible, et après validation.
  v_tdr := pg_temp.consulter(current_setting('test.p')::uuid, null,
    jsonb_build_object('reason', 'Dépistage', 'tests', jsonb_build_array(
      jsonb_build_object('rapid_test_type_id', pg_temp.test_rapide('tdr_vih'), 'result', 'negative'))));
  assert pg_temp.sensible(v_tdr), 'sensible après validation (TDR)';
  perform set_config('test.e_tdr', v_tdr::text, true);

  -- Antécédents : un ordinaire, un sensible.
  perform public.save_medical_history_item(current_setting('test.p')::uuid, null, 'surgical',
    'Césarienne', null, 2021, false, v_ord);
  perform public.save_medical_history_item(current_setting('test.p')::uuid, null, 'medical',
    'Infection VIH sous traitement', null, 2019, true, v_vih);
  raise notice 'OK : sensible d''office par un diagnostic ou un TDR sensible, et le reste après validation';
end $$;

-- Directement en base : une consultation sensible ne redevient jamais ordinaire.
reset role;
select pg_temp.refus(format('update public.encounters set is_sensitive = false where id = %L',
  current_setting('test.e_tdr')), '42501', 'le reste');
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Une ligne READ par ouverture
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_e  uuid := current_setting('test.e_vih')::uuid;
  v_o1 uuid := gen_random_uuid();
  v_o2 uuid := gen_random_uuid();
  v_avant bigint := pg_temp.lectures('encounters', current_setting('test.e_vih')::uuid);
begin
  perform public.get_encounter(v_e, v_o1);
  perform public.get_encounter(v_e, v_o1);
  perform public.get_encounter(v_e, v_o1);
  assert pg_temp.lectures('encounters', v_e) = v_avant + 1, 'une ligne pour trois lectures';
  perform public.get_encounter(v_e, v_o2);
  assert pg_temp.lectures('encounters', v_e) = v_avant + 2, 'nouvelle ouverture';
  -- Sans identifiant d'ouverture : chaque lecture (comme avant).
  perform public.get_encounter(v_e);
  assert pg_temp.lectures('encounters', v_e) = v_avant + 3, 'sans identifiant';
  -- Consultation ordinaire : aucune ligne.
  perform public.get_encounter(current_setting('test.e_ord')::uuid, v_o1);
  assert pg_temp.lectures('encounters', current_setting('test.e_ord')::uuid) = 0, 'ordinaire non journalisée';

  -- Antécédents sensibles : une ligne par ouverture.
  v_avant := pg_temp.lectures('medical_history', current_setting('test.p')::uuid);
  perform public.get_medical_history(current_setting('test.p')::uuid, v_o1);
  perform public.get_medical_history(current_setting('test.p')::uuid, v_o1);
  assert pg_temp.lectures('medical_history', current_setting('test.p')::uuid) = v_avant + 1,
    'antécédents : une ligne par ouverture';
  perform public.get_medical_history(current_setting('test.p')::uuid, v_o2);
  assert pg_temp.lectures('medical_history', current_setting('test.p')::uuid) = v_avant + 2,
    'antécédents : nouvelle ouverture';
  raise notice 'OK : une ligne READ par ouverture (consultation et antécédents sensibles), pas à chaque relecture';
end $$;

-- L'identifiant d'ouverture ne vaut que pour une personne, un dossier, 12 heures.
select pg_temp.en_tant_que('0c');
do $$
declare
  v_o   uuid := gen_random_uuid();
  v_vih uuid := current_setting('test.e_vih')::uuid;
  v_tdr uuid := current_setting('test.e_tdr')::uuid;
  v_n   bigint;
begin
  perform public.get_encounter(v_vih, v_o);
  v_n := pg_temp.lectures('encounters', v_tdr);
  -- a) Même identifiant présenté pour une autre consultation : une ligne pour celle-ci.
  perform public.get_encounter(v_tdr, v_o);
  assert pg_temp.lectures('encounters', v_tdr) = v_n + 1, 'autre consultation journalisée';
  perform pg_temp.en_tant_que('0a');
  reset role;
  update public.memberships set is_clinician = true
   where org_id = current_setting('test.org')::uuid and user_id = '00000000-0000-4000-a14c-00000000000a';
  set local role authenticated;
  -- a) Même identifiant, même consultation, autre personne : une ligne à son nom.
  v_n := pg_temp.lectures('encounters', v_vih);
  perform public.get_encounter(v_vih, v_o);
  assert pg_temp.lectures('encounters', v_vih) = v_n + 1, 'autre personne journalisée';
  reset role;
  update public.memberships set is_clinician = false
   where org_id = current_setting('test.org')::uuid and user_id = '00000000-0000-4000-a14c-00000000000a';
  -- c) Identifiant de plus de 12 heures (journal en ajout seul : ligne écrite datée de
  -- 13 heures) : nouvelle ligne.
  v_o := gen_random_uuid();
  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, new_data, created_at)
  values (current_setting('test.org')::uuid, '00000000-0000-4000-a14c-00000000000c', 'READ',
          'encounters', v_vih::text, jsonb_build_object('opening_id', v_o), now() - interval '13 hours');
  set local role authenticated;
  perform pg_temp.en_tant_que('0c');
  v_n := pg_temp.lectures('encounters', v_vih);
  perform public.get_encounter(v_vih, v_o);
  assert pg_temp.lectures('encounters', v_vih) = v_n + 1, 'identifiant de plus de 12 h';
  perform public.get_encounter(v_vih, v_o);
  assert pg_temp.lectures('encounters', v_vih) = v_n + 1, 'puis de nouveau une seule ligne';
  -- b) Sans identifiant : chaque lecture.
  perform public.get_encounter(v_vih);
  perform public.get_encounter(v_vih);
  assert pg_temp.lectures('encounters', v_vih) = v_n + 3, 'sans identifiant : chaque lecture';
  raise notice 'OK : identifiant d''ouverture propre à une personne et à une consultation, valable 12 h ; sans identifiant, chaque lecture journalisée';
end $$;

-- Owner qui n'exerce pas : PF « Consultation » partout ; owner qui exerce : vrai type.
reset role;
select set_config('test.j30', (public.org_local_date(current_setting('test.org')::uuid) + 30)::text, true);
set local role authenticated;
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_jour date := current_setting('test.j30')::date;
begin
  assert (select type_label from public.list_appointments(v_org, v_jour, v_jour)) = 'Consultation', 'agenda';
  assert not (select is_discreet from public.list_appointments(v_org, v_jour, v_jour)), 'agenda : discrétion';
  assert (select type_label from public.list_patient_appointments(current_setting('test.p')::uuid)) = 'Consultation',
    'onglet Rendez-vous';
  assert not exists (select 1 from public.appointments_to_remind(v_org, v_jour)
                      where type_label <> 'Consultation' or is_discreet
                         or patient_label ~* 'planification|pf'), 'rappels';
  assert exists (select 1 from public.appointments_to_remind(v_org, v_jour)), 'rappel présent';
  assert not exists (select 1 from public.appointments where id = current_setting('test.rdv_pf')::uuid),
    'table appointments';
  assert (select note from public.list_patient_appointments(current_setting('test.p')::uuid)) is null,
    'note discrète cachée à l''owner';
  -- Journal : aucune ligne READ (ni consultation, ni antécédents sensibles) pour l'owner
  -- qui n'exerce pas.
  assert not exists (select 1 from public.audit_logs where action = 'READ'), 'lectures cachées à l''owner';
  -- Paramètres : types et séances discrets toujours visibles pour les configurer.
  assert exists (select 1 from public.appointment_types where org_id = v_org and is_discreet), 'types à paramétrer';
  -- Owner qui exerce : vrai type.
  reset role;
  update public.memberships set is_clinician = true where org_id = v_org and user_id = '00000000-0000-4000-a14c-00000000000a';
  set local role authenticated;
  assert (select type_label from public.list_appointments(v_org, v_jour, v_jour)) = 'Planification familiale',
    'owner qui exerce';
  assert (select type_label from public.list_patient_appointments(current_setting('test.p')::uuid)) = 'Planification familiale',
    'owner qui exerce : onglet';
  assert (select note from public.list_patient_appointments(current_setting('test.p')::uuid)) = 'Implant à retirer',
    'owner qui exerce : note';
  assert exists (select 1 from public.audit_logs where action = 'READ' and table_name = 'medical_history'),
    'owner qui exerce : lectures des antécédents sensibles visibles';
  reset role;
  update public.memberships set is_clinician = false where org_id = v_org and user_id = '00000000-0000-4000-a14c-00000000000a';
  set local role authenticated;
  raise notice 'OK : owner qui n''exerce pas : PF « Consultation » dans l''agenda, l''onglet Rendez-vous et les rappels ; types à paramétrer visibles ; owner qui exerce : vrai type';
end $$;

-- -----------------------------------------------------------------------------
-- Chronologie par rôle
-- -----------------------------------------------------------------------------
-- Accueil, caissier, owner qui n'exerce pas : passages et rendez-vous seulement.
do $$
declare
  v_code text;
  v_l    record;
  v_n    integer;
begin
  foreach v_code in array array['09', '06', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    v_n := 0;
    for v_l in select * from public.patient_timeline(current_setting('test.p')::uuid) loop
      v_n := v_n + 1;
      assert v_l.kind in ('visit', 'appointment'), v_code || ' : ' || v_l.kind;
      assert not v_l.is_sensitive, v_code || ' : sensible';
      assert coalesce(v_l.title, '') || coalesce(v_l.detail, '') !~* 'paludisme|vih|fièvre|frissons|planification|dépistage|contrôle',
        v_code || ' : contenu médical « ' || coalesce(v_l.title, '') || ' / ' || coalesce(v_l.detail, '') || ' »';
      if v_l.kind = 'appointment' then
        assert v_l.title = 'Consultation', v_code || ' : PF affichée « Consultation »';
      end if;
    end loop;
    -- Passages : celui de la file, et ceux des consultations hors file n'en créent pas.
    assert v_n = 2, v_code || ' : 1 passage et 1 rendez-vous, et non ' || v_n;
    assert not exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid,
                                                             array['encounter', 'certificate'])),
      v_code || ' : filtre médical vide';
    perform pg_temp.refus(format('select * from public.get_medical_history(%L)',
      current_setting('test.p')), '42501');
    perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e_ord')), '42501');
  end loop;
  -- Pharmacien : lit l'identité, mais ni la file ni l'agenda : chronologie vide.
  perform pg_temp.en_tant_que('07');
  assert not exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid)), 'pharmacien : rien';
  perform pg_temp.refus(format('select * from public.get_medical_history(%L)', current_setting('test.p')), '42501');
  -- Comptable : aucun accès au dossier.
  perform pg_temp.en_tant_que('05');
  perform pg_temp.refus(format('select * from public.patient_timeline(%L)', current_setting('test.p')), '42501');
  raise notice 'OK : accueil, caissier, owner sans exercice : passages et rendez-vous (« Consultation »), aucun antécédent ; pharmacien : rien ; comptable : refus';
end $$;

-- Aide-soignant : ordinaire seulement, aucune trace des consultations sensibles.
select pg_temp.en_tant_que('0d');
do $$
declare
  v_avant bigint := pg_temp.lectures('encounters', current_setting('test.e_vih')::uuid);
begin
  assert exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid)
                  where kind = 'encounter' and item_id = current_setting('test.e_ord')::uuid
                    and detail = 'Paludisme simple à Plasmodium falciparum'),
    'ordinaire visible avec son diagnostic';
  assert not exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid)
                      where is_sensitive or item_id in (current_setting('test.e_vih')::uuid,
                                                         current_setting('test.e_tdr')::uuid)),
    'aucune ligne sensible';
  assert (select count(*) from public.patient_timeline(current_setting('test.p')::uuid, array['encounter'])) = 1,
    'une seule consultation comptée';
  -- Rendez-vous discret : « Consultation », comme dans l'agenda et l'onglet Rendez-vous ;
  -- ni note, ni changement de type.
  assert not exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid)
                      where title ~* 'planification|dépistage'), 'PF masquée (chronologie)';
  assert (select type_label from public.list_appointments(current_setting('test.org')::uuid,
            current_setting('test.j30')::date, current_setting('test.j30')::date)) = 'Consultation',
    'PF masquée (agenda)';
  assert (select type_label || coalesce(note, '') from public.list_patient_appointments(current_setting('test.p')::uuid))
         = 'Consultation', 'PF masquée, sans note (onglet Rendez-vous)';
  assert not exists (select 1 from public.appointment_notes), 'note discrète absente de la table';
  perform pg_temp.refus(format('select public.set_appointment_type(%L, %L, true)',
    current_setting('test.rdv_pf'), pg_temp.type_rdv('consultation')), '42501');
  assert not exists (select 1 from public.get_medical_history(current_setting('test.p')::uuid)
                      where is_sensitive or label ~* 'vih'), 'antécédent sensible absent';
  assert (select count(*) from public.get_medical_history(current_setting('test.p')::uuid)) = 1, 'césarienne';
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e_vih')), '42501', 'Consultation introuvable.');
  assert pg_temp.lectures('encounters', current_setting('test.e_vih')::uuid) = v_avant, 'refus non journalisé';
  raise notice 'OK : aide-soignant : aucune consultation ni aucun antécédent sensible, ni ligne, ni compteur';
end $$;

-- Infirmier : tout, sans diagnostic d'une consultation sensible ; pages sans doublon.
select pg_temp.en_tant_que('0c');
do $$
declare
  v_tout   uuid[];
  v_pages  uuid[] := '{}';
  v_l      record;
  v_at     timestamptz;
  v_id     uuid;
  v_page   integer;
begin
  select array_agg(item_id order by occurred_at desc, item_id desc) into v_tout
    from public.patient_timeline(current_setting('test.p')::uuid, p_limit => 50);
  assert array_length(v_tout, 1) = 5, '1 passage, 1 rendez-vous, 3 consultations : ' || array_length(v_tout, 1);
  assert exists (select 1 from public.patient_timeline(current_setting('test.p')::uuid, array['encounter'])
                  where item_id = current_setting('test.e_vih')::uuid and is_sensitive and detail is null),
    'sensible visible, sans diagnostic';
  -- Plus récente en haut : le rendez-vous dans 30 jours d'abord.
  assert v_tout[1] = current_setting('test.rdv_pf')::uuid, 'plus récente en haut';
  -- Pages de 2.
  loop
    v_page := 0;
    for v_l in select * from public.patient_timeline(current_setting('test.p')::uuid, null, v_at, v_id, 2) loop
      v_page := v_page + 1;
      v_pages := v_pages || v_l.item_id;
      v_at := v_l.occurred_at;
      v_id := v_l.item_id;
    end loop;
    exit when v_page < 2;
  end loop;
  assert v_pages = v_tout, 'pages dans l''ordre, sans doublon ni trou';
  raise notice 'OK : infirmier : chronologie complète, la plus récente en haut, par pages, filtrable';
end $$;

-- -----------------------------------------------------------------------------
-- Audit : aucune fonction exécutable par le client ne révèle, à partir d'un identifiant,
-- la discrétion ou la sensibilité d'un enregistrement sans vérifier les droits.
-- -----------------------------------------------------------------------------
reset role;
do $$
declare
  v_trouvees text[];
  -- Vérifiées une à une : droits de l'appelant (prennent l'id de la structure), ou texte
  -- fourni par l'appelant (rien de lu en base), ou constante.
  v_admises text[] := array[
    'appointment_label_is_discreet(p_label text)',          -- texte fourni, rien de lu en base
    'appointments_can_see_discreet(p_org_id uuid)',          -- droit de l'appelant
    'audit_table_is_medical(p_table text)',                  -- liste fixe de tables
    'patients_can_read_sensitive(p_org_id uuid)',            -- droit de l'appelant
    'save_medical_history_item(p_patient_id uuid, p_id uuid, p_category text, p_label text, p_details text, p_since_year integer, p_is_sensitive boolean, p_encounter_id uuid)', -- soignants seulement
    'save_org_diagnosis(p_org_id uuid, p_id uuid, p_label text, p_code text, p_synonyms text, p_is_sensitive boolean, p_is_active boolean)', -- owner et admin
    'save_patient_medical(p_patient_id uuid, p_blood_group text, p_allergies text, p_medical_history text, p_is_sensitive boolean)', -- soignants seulement
    'sensitive_reads_summary(p_org_id uuid, p_from date, p_to date)']; -- owner et admin, sans patient
begin
  select array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by 1)
    into v_trouvees
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and (p.proname ~ '(discre|sensitiv|sensible|reminder_allowed|merge_relink)'
          or pg_get_function_identity_arguments(p.oid) ~ '(is_discreet|is_sensitive)');
  if exists (select 1 from unnest(v_trouvees) f where f <> all (v_admises)) then
    raise exception 'ÉCHEC : fonctions à vérifier : %',
      (select array_agg(f) from unnest(v_trouvees) f where f <> all (v_admises));
  end if;
  -- Aides internes : plus exécutables par le client.
  if has_function_privilege('authenticated', 'public.appointment_type_is_discreet(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.appointment_reminder_allowed(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.encounter_draft_sensitive(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.appointment_notes_guard()', 'execute')
     or exists (select 1 from pg_proc where proname = 'appointment_is_discreet') then
    raise exception 'ÉCHEC : une aide interne reste exécutable par le client';
  end if;
  -- b) Aucune policy, ni fonction ou trigger en security invoker, n'appelle une fonction
  -- retirée au client (sinon « permission denied » sur un chemin non testé).
  if exists (select 1 from pg_policies
              where coalesce(qual, '') || coalesce(with_check, '')
                    ~ '(appointment_type_is_discreet|appointment_reminder_allowed|encounter_draft_sensitive|appointment_issues_hors_seance|appointment_type_seen_for_checks)') then
    raise exception 'ÉCHEC : une policy appelle une fonction retirée au client';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and not p.prosecdef
                and p.prosrc ~ '(appointment_type_is_discreet|appointment_reminder_allowed|encounter_draft_sensitive|appointment_issues_hors_seance|appointment_type_seen_for_checks)') then
    raise exception 'ÉCHEC : une fonction security invoker appelle une fonction retirée au client : %',
      (select array_agg(proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and not p.prosecdef
          and p.prosrc ~ '(appointment_type_is_discreet|appointment_reminder_allowed|encounter_draft_sensitive|appointment_issues_hors_seance|appointment_type_seen_for_checks)');
  end if;
  raise notice 'OK : audit : aucune fonction exécutable ne révèle la discrétion ou la sensibilité d''un enregistrement (%) ; aucune policy ni fonction invoker n''appelle une fonction retirée',
    array_length(v_trouvees, 1);
end $$;

-- Accueil et aide-soignant : même réponse pour une PF masquée et une consultation ordinaire.
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, source)
values (current_setting('test.org')::uuid, current_setting('test.p')::uuid, pg_temp.type_rdv('consultation'),
        now() + interval '31 days', now() + interval '31 days 15 minutes',
        public.org_local_date(current_setting('test.org')::uuid) + 31, 'scheduled', 'followup')
returning set_config('test.rdv_ord', id::text, true);
update public.appointments set source = 'followup' where id = current_setting('test.rdv_pf')::uuid;
set local role authenticated;
do $$
declare
  v_code text;
  v_msg  text[];
  v_id   uuid;
  v_m    text;
begin
  foreach v_code in array array['09', '0d'] loop
    perform pg_temp.en_tant_que(v_code);
    v_msg := '{}';
    foreach v_id in array array[current_setting('test.rdv_pf')::uuid, current_setting('test.rdv_ord')::uuid] loop
      -- « Changer le type » : même refus.
      begin
        perform public.set_appointment_type(v_id, pg_temp.type_rdv('vaccination'), true);
        v_m := 'accepté';
      exception when others then v_m := sqlstate || ' ' || sqlerrm;
      end;
      v_msg := v_msg || v_m;
      -- « Rappel fait » : même acceptation.
      begin
        perform public.set_appointment_reminder(array[v_id], true);
        v_m := 'accepté';
      exception when others then v_m := sqlstate || ' ' || sqlerrm;
      end;
      v_msg := v_msg || v_m;
    end loop;
    if v_msg[1] <> v_msg[3] or v_msg[2] <> v_msg[4] or v_msg[1] = 'accepté' then
      raise exception 'ÉCHEC : % : réponses différentes : %', v_code, v_msg;
    end if;
    -- Source « followup » masquée, motif et note absents ; même forme que l'ordinaire.
    if exists (select 1 from public.list_patient_appointments(current_setting('test.p')::uuid)
                where id = current_setting('test.rdv_pf')::uuid
                  and (source <> 'agenda' or note is not null or is_discreet or type_label <> 'Consultation')) then
      raise exception 'ÉCHEC : % : PF reconnaissable dans l''onglet Rendez-vous', v_code;
    end if;
    -- Report : prochaines séances et contrôle identiques à ceux d'une consultation ; report
    -- accepté, vrai type gardé, hors séance.
    if (select array_agg(row(local_date, start_time, end_time, places_left, session_id)::text order by starts_at)
          from public.next_available_sessions(current_setting('test.org')::uuid,
                 p_appointment_id => current_setting('test.rdv_pf')::uuid, p_limit => 5))
       is distinct from
       (select array_agg(row(local_date, start_time, end_time, places_left, session_id)::text order by starts_at)
          from public.next_available_sessions(current_setting('test.org')::uuid,
                 pg_temp.type_rdv('consultation'), p_limit => 5)) then
      raise exception 'ÉCHEC : % : prochaines séances d''une PF masquée', v_code;
    end if;
    if (public.check_appointment(current_setting('test.org')::uuid, current_setting('test.p')::uuid,
          pg_temp.type_rdv('consultation'), now() + interval '33 days',
          p_exclude_id => current_setting('test.rdv_pf')::uuid))::text ~* 'pleine|planification|full'
    then
      raise exception 'ÉCHEC : % : contrôle du report d''une PF masquée', v_code;
    end if;
    -- Note : ni modifiée ni retirée directement (aucun droit d'écriture sur la table).
    perform pg_temp.refus('update public.appointment_notes set note = ''x''', '42501');
    perform pg_temp.refus('delete from public.appointment_notes', '42501');
    -- Note : refusée de la même façon pour une consultation.
    begin
      perform public.book_appointment(current_setting('test.org')::uuid, current_setting('test.p')::uuid,
        pg_temp.type_rdv('consultation'), now() + interval '40 days', p_note => 'x', p_confirm => true);
      raise exception 'ÉCHEC : % écrit une note', v_code;
    exception when insufficient_privilege then null;
    end;
  end loop;
  -- Report par l'accueil : accepté, vrai type et durée gardés, hors séance.
  perform pg_temp.en_tant_que('09');
  perform public.reschedule_appointment(current_setting('test.rdv_pf')::uuid,
    now() + interval '33 days', p_confirm => true);
  raise notice 'OK : accueil et aide-soignant : « Changer le type », « Rappel fait », source, note, prochaines séances et contrôle du report identiques pour une PF masquée et une consultation ; note refusée';
end $$;

reset role;
do $$
declare
  v_neuf public.appointments;
begin
  select * into v_neuf from public.appointments
   where rescheduled_from_id = current_setting('test.rdv_pf')::uuid;
  if v_neuf.appointment_type_id <> pg_temp.type_rdv('pf') or v_neuf.session_id is not null
     or v_neuf.ends_at - v_neuf.starts_at <> make_interval(mins => (select duration_minutes
          from public.appointment_types where id = pg_temp.type_rdv('pf')))
     or not exists (select 1 from public.appointment_notes where appointment_id = v_neuf.id
                     and note = 'Implant à retirer') then
    raise exception 'ÉCHEC : PF reportée par l''accueil : %', v_neuf;
  end if;
  -- a) Trigger des notes : modification ou retrait par un non habilité refusés, même par une
  -- fonction à venir (ici, en base avec l'identité de l'aide-soignant).
  perform set_config('request.jwt.claims',
    '{"sub": "00000000-0000-4000-a14c-00000000000d", "role": "authenticated"}', true);
  begin
    update public.appointment_notes set note = 'x' where appointment_id = v_neuf.id;
    raise exception 'ÉCHEC : note modifiée par l''aide-soignant';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.appointment_notes set deleted_at = now() where appointment_id = v_neuf.id;
    raise exception 'ÉCHEC : note retirée par l''aide-soignant';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'OK : PF reportée par l''accueil : vrai type, durée et note gardés, hors séance ; note ni modifiée ni retirée par un non habilité';
end $$;

-- -----------------------------------------------------------------------------
-- PF masquée sans type « Consultation » utilisable (désactivé, puis supprimé) : jamais la
-- séance PF, jamais « séance pleine », aucune séance rattachée.
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('test.j40', (public.org_local_date(current_setting('test.org')::uuid) + 40)::text, true);
-- Séance PF de 1 place ce jour-là, déjà prise ; une autre PF à déplacer.
insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time, capacity)
values (current_setting('test.org')::uuid, pg_temp.type_rdv('pf'),
        extract(isodow from current_setting('test.j40')::date)::integer, '08:00', '12:00', 1)
returning set_config('test.seance_pf', id::text, true);
insert into public.appointments (org_id, patient_id, appointment_type_id, session_id, starts_at,
                                 ends_at, local_date, status, source)
select current_setting('test.org')::uuid, current_setting('test.p')::uuid, pg_temp.type_rdv('pf'),
       current_setting('test.seance_pf')::uuid,
       (current_setting('test.j40')::date + time '08:00') at time zone 'Africa/Dakar',
       (current_setting('test.j40')::date + time '08:20') at time zone 'Africa/Dakar',
       current_setting('test.j40')::date, 'scheduled', 'agenda';
do $$
declare
  v_cas  text;
  v_pf   uuid;
  v_ctrl jsonb;
  v_neuf public.appointments;
  v_heure time := '09:00';
begin
  foreach v_cas in array array['désactivé', 'supprimé'] loop
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if v_cas = 'désactivé' then
      update public.appointment_types set is_active = false where id = pg_temp.type_rdv('consultation');
    else
      update public.appointment_types set deleted_at = now()
       where org_id = current_setting('test.org')::uuid and not is_discreet;
    end if;
    insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                     local_date, status, source)
    values (current_setting('test.org')::uuid, current_setting('test.p')::uuid, pg_temp.type_rdv('pf'),
            now() + interval '50 days', now() + interval '50 days 20 minutes',
            public.org_local_date(current_setting('test.org')::uuid) + 50, 'scheduled', 'agenda')
    returning id into v_pf;
    set local role authenticated;
    perform pg_temp.en_tant_que('09');
    -- Prochaines séances : jamais la séance PF.
    if exists (select 1 from public.next_available_sessions(current_setting('test.org')::uuid,
                 p_appointment_id => v_pf, p_from => current_setting('test.j40')::date - 7, p_limit => 10)
                where session_id = current_setting('test.seance_pf')::uuid
                   or (local_date = current_setting('test.j40')::date and start_time = '08:00')) then
      raise exception 'ÉCHEC : % : séance PF proposée', v_cas;
    end if;
    -- Contrôle du report dans l'heure de la séance PF pleine : ni « pleine », ni séance.
    v_ctrl := public.check_appointment(current_setting('test.org')::uuid, current_setting('test.p')::uuid,
      pg_temp.type_rdv('pf'), (current_setting('test.j40')::date + v_heure) at time zone 'Africa/Dakar',
      p_exclude_id => v_pf);
    if v_ctrl::text ~* 'full|pleine|planification' or v_ctrl -> 0 -> 'session_id' <> 'null'::jsonb
       or jsonb_array_length(v_ctrl -> 0 -> 'blocking') <> 0 then
      raise exception 'ÉCHEC : % : contrôle du report : %', v_cas, v_ctrl;
    end if;
    -- Report : accepté, hors séance, vrai type et durée gardés.
    v_neuf := public.reschedule_appointment(v_pf,
      (current_setting('test.j40')::date + v_heure) at time zone 'Africa/Dakar', p_confirm => true);
    reset role;
    select * into v_neuf from public.appointments where id = v_neuf.id;
    if v_neuf.session_id is not null or v_neuf.appointment_type_id <> pg_temp.type_rdv('pf')
       or v_neuf.ends_at - v_neuf.starts_at <> interval '20 minutes' then
      raise exception 'ÉCHEC : % : PF reportée : %', v_cas, v_neuf;
    end if;
    if coalesce(current_setting('fajkat.rdv_masque', true), '') <> ''
       or coalesce(current_setting('fajkat.rdv_type_vu', true), '') <> ''
       or coalesce(current_setting('fajkat.sans_seance', true), '') <> '' then
      raise exception 'ÉCHEC : % : variables du mode masqué restées posées', v_cas;
    end if;
    v_heure := '10:00';
  end loop;
  raise notice 'OK : PF masquée, type « Consultation » désactivé puis supprimé : ni séance PF proposée, ni « séance pleine », report hors séance (vrai type et durée gardés)';
end $$;

rollback;
