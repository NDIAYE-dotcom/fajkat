-- =============================================================================
-- Tests — étape 14, partie A (consultation et dossier médical, base)
-- -----------------------------------------------------------------------------
-- Vérifie : référentiels recopiés dans la structure ; qui commence, lit et écrit une
-- consultation (accueil, caissier, comptable, owner qui n'exerce pas : rien, même par
-- les tables) ; un seul brouillon par passage, réservé à son auteur ; version dépassée
-- refusée ; reprise (auteur changé, journal, notification) ; validation (motif, un seul
-- diagnostic principal, examens, ordonnance, alerte de déclaration obligatoire) ; verrous
-- dans la base après validation, même pour postgres ; avenants ; sensible d'office (RDV
-- discret, diagnostic sensible), jamais rendu non sensible, réservé à ceux qui écrivent,
-- lectures journalisées (READ) lisibles seulement par un owner qui exerce, résumé sans
-- patient ; chronologie ; brouillons de l'utilisateur ; recherche des diagnostics et
-- favoris ; antécédents ; référence et contre-référence ; certificat ; fusion de dossiers.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14.sql
-- Prérequis : migrations des étapes 3 à 14 appliquées.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a140-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0c', '0e', '0d', '09', '06', '05']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a140-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé C', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
-- 0a owner (n'exerce pas), 0c infirmier, 0e sage-femme, 0d aide-soignant, 09 accueil,
-- 06 caissier, 05 comptable.
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a140-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('0e', 'sage_femme'), ('0d', 'aide_soignant'),
               ('09', 'accueil'), ('06', 'caissier'), ('05', 'comptable')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a140-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.enc(p_id uuid) returns public.encounters language sql security definer as $$
  select * from public.encounters where id = p_id;
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
grant execute on function pg_temp.en_tant_que(text), pg_temp.enc(uuid), pg_temp.file(text),
  pg_temp.type_rdv(text), pg_temp.diag(text), pg_temp.test_rapide(text),
  pg_temp.refus(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Référentiels
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  -- Les 6 types de l'étape 14 (la maternité en ajoute à l'étape 15).
  assert (select count(*) from public.encounter_types where org_id = v_org
           and template_code in ('consultation', 'controle', 'suivi_chronique', 'soins', 'pf',
                                 'depistage')) = 6, 'types';
  assert (select is_sensitive_default from public.encounter_types
           where org_id = v_org and template_code = 'pf'), 'PF sensible';
  assert (select count(*) from public.rapid_test_types where org_id = v_org) = 8, 'examens';
  assert (select is_sensitive from public.rapid_test_types
           where org_id = v_org and template_code = 'tdr_vih'), 'TDR VIH sensible';
  assert (select count(*) from public.certificate_templates where org_id = v_org) = 3, 'certificats';
  assert (select count(*) from public.diagnoses_catalog where org_id is null) >= 150, 'catalogue';
  assert (select notification_delay from public.diagnoses_catalog
           where org_id is null and code = 'A00.9') = 'immediate', 'choléra immédiat';
  raise notice 'OK : référentiels recopiés (6 types, 8 examens, 3 certificats, catalogue)';
end $$;

-- Patients et passages (accueil) -----------------------------------------------------------
set local role authenticated;
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_id  uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diallo', 'Moussa', 'M', 40) returning id into v_id;
  perform set_config('test.moussa', v_id::text, true);
  perform set_config('test.visite', (select (public.register_arrival(v_org, v_id,
    pg_temp.file('consultation'), 'normal', 'Fièvre depuis 3 jours')).id::text), true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Sow', 'Awa', 'F', 27) returning id into v_id;
  perform set_config('test.awa', v_id::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diallo', 'Mousa', 'M', 40) returning id into v_id;
  perform set_config('test.doublon', v_id::text, true);
end $$;

-- Rendez-vous de PF d'Awa aujourd'hui (écrit directement), puis « Arrivé ».
reset role;
insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, source)
values (current_setting('test.org')::uuid, current_setting('test.awa')::uuid, pg_temp.type_rdv('pf'),
        now(), now() + interval '20 minutes',
        (now() at time zone 'Africa/Dakar')::date, 'scheduled', 'agenda')
returning set_config('test.rdv_pf', id::text, true);
set local role authenticated;
select pg_temp.en_tant_que('09');
select set_config('test.visite_pf',
  (public.arrive_appointment(current_setting('test.rdv_pf')::uuid)).id::text, true);

-- -----------------------------------------------------------------------------
-- anon : aucune fonction de l'étape 14 (droit par défaut de public retiré)
-- -----------------------------------------------------------------------------
reset role;
do $$
declare
  v_f text;
begin
  select string_agg(p.proname, ', ') into v_f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('start_encounter', 'save_encounter_draft', 'take_over_encounter',
                       'discard_encounter_draft', 'validate_encounter', 'add_encounter_addendum',
                       'add_prescription', 'get_encounter', 'my_draft_encounters',
                       'patient_timeline', 'search_diagnoses', 'set_diagnosis_favorite',
                       'save_org_diagnosis', 'get_medical_history', 'save_medical_history_item',
                       'remove_medical_history_item', 'create_referral', 'record_counter_referral',
                       'issue_certificate', 'sensitive_reads_summary', 'encounter_permissions',
                       'surveillance_notify_immediate', 'log_sensitive_read')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  assert v_f is null, 'anon peut appeler : ' || coalesce(v_f, '');
end $$;
grant execute on function pg_temp.refus(text, text, text) to anon;
set local role anon;
select pg_temp.refus(format('select public.start_encounter(%L, %L)',
  current_setting('test.moussa'), current_setting('test.visite')), '42501', 'permission');
select pg_temp.refus(format('select * from public.search_diagnoses(%L, %L)',
  current_setting('test.org'), 'palu'), '42501', 'permission');
reset role;
do $$ begin raise notice 'OK : anon n''appelle aucune fonction de la consultation'; end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Qui commence une consultation
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
begin
  foreach v_code in array array['09', '06', '05', '0a', '0d'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select public.start_encounter(%L, %L)',
      current_setting('test.moussa'), current_setting('test.visite')), '42501');
  end loop;
  raise notice 'OK : accueil, caissier, comptable, owner sans exercice, aide-soignant ne commencent pas';
end $$;

select pg_temp.en_tant_que('0c');
do $$
declare
  v jsonb;
begin
  v := public.start_encounter(current_setting('test.moussa')::uuid, current_setting('test.visite')::uuid);
  assert (v ->> 'created')::boolean and (v ->> 'mine')::boolean, 'créée';
  assert not (v ->> 'is_sensitive')::boolean, 'non sensible';
  assert (v ->> 'type_label') = 'Consultation', 'type par défaut';
  perform set_config('test.e1', v ->> 'id', true);
  -- Le motif de la file est repris dans le brouillon.
  v := public.get_encounter((v ->> 'id')::uuid);
  assert v #>> '{draft_data,reason}' = 'Fièvre depuis 3 jours', 'motif repris';
  -- Même passage, même soignant : le même brouillon.
  v := public.start_encounter(current_setting('test.moussa')::uuid, current_setting('test.visite')::uuid);
  assert v ->> 'id' = current_setting('test.e1') and not (v ->> 'created')::boolean, 'même brouillon';
  raise notice 'OK : infirmier commence ; motif de la file repris ; un seul brouillon par passage';
end $$;

-- Un autre soignant voit qui tient le brouillon, sans son contenu.
select pg_temp.en_tant_que('0e');
do $$
declare
  v jsonb;
begin
  v := public.start_encounter(current_setting('test.moussa')::uuid, current_setting('test.visite')::uuid);
  assert v ->> 'id' = current_setting('test.e1') and not (v ->> 'mine')::boolean, 'pas à moi';
  assert v ->> 'author_name' = 'Test 0c', 'auteur nommé';
  v := public.get_encounter(current_setting('test.e1')::uuid);
  assert not (v ? 'draft_data') and not (v ? 'prescriptions'), 'contenu caché';
  perform pg_temp.refus(format('select public.save_encounter_draft(%L, 1, %L)',
    current_setting('test.e1'), '{"reason": "x"}'), '42501', 'tenue par Test 0c');
  raise notice 'OK : brouillon d''un autre soignant : en-tête seulement, écriture refusée';
end $$;

-- -----------------------------------------------------------------------------
-- Aucun accès direct aux tables médicales
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
  v_table text;
begin
  foreach v_code in array array['0c', '0a', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    foreach v_table in array array['encounters', 'diagnoses', 'encounter_tests', 'prescriptions',
                                   'prescription_items', 'referrals', 'certificates',
                                   'encounter_addenda', 'medical_history', 'surveillance_alerts'] loop
      perform pg_temp.refus(format('select count(*) from public.%I', v_table), '42501');
    end loop;
    perform pg_temp.refus(format('update public.encounters set reason = %L', 'x'), '42501');
  end loop;
  -- L'accueil ne lit ni le contenu, ni les antécédents ; sa chronologie (partie C) ne
  -- montre que les passages et les rendez-vous.
  perform pg_temp.en_tant_que('09');
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e1')), '42501');
  assert not exists (select 1 from public.patient_timeline(current_setting('test.moussa')::uuid)
                      where kind not in ('visit', 'appointment')), 'chronologie de l''accueil';
  perform pg_temp.refus(format('select * from public.get_medical_history(%L)', current_setting('test.moussa')), '42501');
  perform pg_temp.refus(format('select * from public.search_diagnoses(%L, %L)', current_setting('test.org'), 'palu'), '42501');
  perform pg_temp.en_tant_que('06');
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e1')), '42501');
  perform pg_temp.en_tant_que('0a');
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e1')), '42501');
  raise notice 'OK : aucune table médicale lisible ni modifiable directement ; accueil, caissier, owner : refus';
end $$;

-- -----------------------------------------------------------------------------
-- Brouillon : versions, reprise
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_enc public.encounters := pg_temp.enc(current_setting('test.e1')::uuid);
  v     jsonb;
begin
  v := public.save_encounter_draft(v_enc.id, v_enc.version, jsonb_build_object(
    'reason', 'Fièvre depuis 3 jours', 'history', 'Frissons, céphalées.',
    'diagnoses', jsonb_build_array(jsonb_build_object('catalog_id', pg_temp.diag('B50.9'), 'rank', 'primary'))));
  assert (v ->> 'version')::integer = v_enc.version + 1, 'version suivante';
  -- Autre appareil : version lue dépassée.
  perform pg_temp.refus(format('select public.save_encounter_draft(%L, %s, %L)',
    v_enc.id, v_enc.version, '{"reason": "ancien"}'), '22023', 'autre appareil');
  raise notice 'OK : enregistrement versionné ; version dépassée refusée (autre appareil)';
end $$;

-- Relève : la sage-femme reprend le brouillon de l'infirmier.
select pg_temp.en_tant_que('0e');
do $$
declare
  v jsonb;
begin
  v := public.take_over_encounter(current_setting('test.e1')::uuid);
  assert (v ->> 'mine')::boolean and v ->> 'author_name' = 'Test 0e', 'reprise';
  v := public.get_encounter(current_setting('test.e1')::uuid);
  assert v #>> '{draft_data,history}' = 'Frissons, céphalées.', 'contenu gardé';
  assert jsonb_array_length(v -> 'handovers') = 1
     and v #>> '{handovers,0,from_name}' = 'Test 0c', 'reprise journalisée';
  raise notice 'OK : reprise : contenu gardé, auteur changé, reprise journalisée';
end $$;

reset role;
do $$
begin
  assert exists (select 1 from public.notifications
                  where recipient_user_id = '00000000-0000-4000-a140-00000000000c'
                    and type = 'encounter.taken_over'), 'infirmier prévenu';
  assert exists (select 1 from public.audit_logs where table_name = 'encounters'
                    and record_id = current_setting('test.e1')
                    and new_data -> 'changed_fields' ? 'author_id'), 'reprise dans audit_logs';
  raise notice 'OK : auteur précédent prévenu ; reprise dans audit_logs';
end $$;
set local role authenticated;

select pg_temp.en_tant_que('0c');
select pg_temp.refus(format('select public.save_encounter_draft(%L, %s, %L)',
  current_setting('test.e1'), (pg_temp.enc(current_setting('test.e1')::uuid)).version, '{"reason": "x"}'),
  '42501', 'tenue par Test 0e');

-- -----------------------------------------------------------------------------
-- Validation
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0e');
do $$
declare
  v_enc   public.encounters := pg_temp.enc(current_setting('test.e1')::uuid);
  v_ver   integer;
  v       jsonb;
  v_brouillon jsonb;
begin
  -- Sans motif : refus.
  v_ver := (public.save_encounter_draft(v_enc.id, v_enc.version, '{"history": "x"}') ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'motif');
  -- Deux diagnostics principaux : refus.
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'Fièvre',
    'diagnoses', jsonb_build_array(
      jsonb_build_object('catalog_id', pg_temp.diag('B50.9'), 'rank', 'primary'),
      jsonb_build_object('label', 'Autre', 'rank', 'primary')))) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'un seul diagnostic principal');
  -- Examen sans résultat : refus.
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'Fièvre',
    'tests', jsonb_build_array(jsonb_build_object('rapid_test_type_id', pg_temp.test_rapide('tdr_palu'))))) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'TDR paludisme : choisissez le résultat');
  -- Catalogue de la pharmacie pas encore disponible : refus clair.
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, jsonb_build_object('reason', 'Fièvre',
    'prescription', jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('product_id', gen_random_uuid(), 'product_name', 'Paracétamol'))))) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v_enc.id, v_ver),
    '22023', 'pas encore disponible');

  v_brouillon := jsonb_build_object(
    'reason', 'Fièvre depuis 3 jours', 'history', 'Frissons.', 'examination', 'T 39,2.',
    'plan', 'Traitement ambulatoire.',
    'diagnoses', jsonb_build_array(
      jsonb_build_object('catalog_id', pg_temp.diag('B50.9'), 'rank', 'primary'),
      jsonb_build_object('catalog_id', pg_temp.diag('A00.9'), 'rank', 'secondary'),
      jsonb_build_object('label', 'Fatigue intense', 'rank', 'secondary')),
    'tests', jsonb_build_array(
      jsonb_build_object('rapid_test_type_id', pg_temp.test_rapide('tdr_palu'), 'result', 'positive'),
      jsonb_build_object('rapid_test_type_id', pg_temp.test_rapide('glycemie'), 'value', '1,05')),
    'prescription', jsonb_build_object('note', 'Revenir si la fièvre persiste.', 'items', jsonb_build_array(
      jsonb_build_object('product_name', 'Artéméther-luméfantrine 20/120 mg', 'route_code', 'orale',
                         'dose_morning', 4, 'dose_evening', 4, 'dose_unit', 'comprimés',
                         'duration_days', 3, 'quantity', 24),
      jsonb_build_object('product_name', 'Paracétamol 500 mg', 'dose_morning', '1', 'dose_noon', '1',
                         'dose_evening', '1', 'duration_days', 3, 'quantity', 9, 'as_needed', true))));
  v_ver := (public.save_encounter_draft(v_enc.id, v_ver, v_brouillon) ->> 'version')::integer;
  v := public.validate_encounter(v_enc.id, v_ver);
  assert v ->> 'status' = 'validated' and v ->> 'validated_by_name' = 'Test 0e', 'validée';

  v := public.get_encounter(v_enc.id);
  assert v ->> 'reason' = 'Fièvre depuis 3 jours' and v ->> 'plan' = 'Traitement ambulatoire.', 'colonnes';
  assert not (v ? 'draft_data'), 'brouillon vidé';
  assert jsonb_array_length(v -> 'diagnoses') = 3 and v #>> '{diagnoses,0,code}' = 'B50.9', 'diagnostics';
  assert jsonb_array_length(v -> 'tests') = 2, 'examens';
  assert (select (t ->> 'value_number')::numeric from jsonb_array_elements(v -> 'tests') t
           where t ->> 'label' = 'Glycémie capillaire') = 1.05, 'virgule acceptée';
  assert jsonb_array_length(v #> '{prescriptions,0,items}') = 2, 'ordonnance';
  raise notice 'OK : validation : motif exigé, un seul principal, résultat exigé, catalogue pharmacie refusé ; contenu recopié';
end $$;

reset role;
do $$
begin
  assert (select count(*) from public.surveillance_alerts
           where encounter_id = current_setting('test.e1')::uuid) = 2, 'choléra et paludisme signalés';
  assert (select notification_delay from public.surveillance_alerts
           where encounter_id = current_setting('test.e1')::uuid and code = 'A00.9') = 'immediate', 'immédiat';
  raise notice 'OK : alertes de déclaration obligatoire créées à la validation';

  -- Choléra (immédiate) : soignants habilités et owner prévenus, sans nom de patient ;
  -- paludisme (hebdomadaire) : pas de notification.
  assert (select array_agg(right(recipient_user_id::text, 2) order by recipient_user_id::text)
            from public.notifications where type = 'surveillance.immediate'
             and org_id = current_setting('test.org')::uuid) = array['0a', '0c', '0e'], 'destinataires';
  assert not exists (select 1 from public.notifications where type = 'surveillance.immediate'
                       and (title <> 'Maladie à déclaration immédiate : Choléra'
                            or body <> 'À déclarer au district sans délai.'
                            or concat(title, body) ~* 'diallo|moussa|paludisme')), 'message';
  assert (select severity from public.notifications where type = 'surveillance.immediate' limit 1) = 'urgent', 'urgent';
  raise notice 'OK : déclaration immédiate : owner, infirmier et sage-femme prévenus (urgent), sans nom de patient ; accueil et aide-soignant non';
end $$;

-- -----------------------------------------------------------------------------
-- Verrous après validation, même pour postgres
-- -----------------------------------------------------------------------------
do $$
declare
  v_e text := current_setting('test.e1');
begin
  perform pg_temp.refus(format('update public.encounters set plan = %L where id = %L', 'autre', v_e), '42501', 'avenant');
  perform pg_temp.refus(format('update public.encounters set status = %L, validated_at = null, validated_by = null where id = %L', 'draft', v_e), '42501');
  perform pg_temp.refus(format('delete from public.encounters where id = %L', v_e), '42501');
  perform pg_temp.refus(format('update public.diagnoses set label = %L where encounter_id = %L', 'x', v_e), '42501');
  perform pg_temp.refus(format('delete from public.diagnoses where encounter_id = %L', v_e), '42501');
  perform pg_temp.refus(format('insert into public.diagnoses (org_id, encounter_id, label, rank) values (%L, %L, %L, %L)',
    current_setting('test.org'), v_e, 'Ajout', 'secondary'), '42501', 'avenant');
  perform pg_temp.refus(format('update public.encounter_tests set result = %L where encounter_id = %L', 'negative', v_e), '42501');
  perform pg_temp.refus(format('update public.prescription_items set quantity = 1 where prescription_id in (select id from public.prescriptions where encounter_id = %L)', v_e), '42501');
  perform pg_temp.refus(format('insert into public.prescription_items (org_id, prescription_id, product_name) select org_id, id, %L from public.prescriptions where encounter_id = %L', 'Ajout', v_e), '42501', 'déjà délivrée');
  perform pg_temp.refus(format('delete from public.surveillance_alerts where encounter_id = %L', v_e), '42501');
  raise notice 'OK : consultation validée, diagnostics, examens, ordonnance figés dans la base (postgres compris)';
end $$;

-- Avenant ; ordonnance ajoutée après coup.
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v jsonb;
begin
  perform pg_temp.refus(format('select public.validate_encounter(%L, 99)', current_setting('test.e1')), '42501', 'avenant');
  perform pg_temp.refus(format('select public.add_encounter_addendum(%L, %L)', current_setting('test.e1'), '  '), '22023');
  perform public.add_encounter_addendum(current_setting('test.e1')::uuid, 'TDR contrôlé : positif confirmé.');
  perform public.add_prescription(current_setting('test.e1')::uuid, null,
    jsonb_build_array(jsonb_build_object('product_name', 'SRO', 'quantity', 2)));
  v := public.get_encounter(current_setting('test.e1')::uuid);
  assert jsonb_array_length(v -> 'addenda') = 1 and v #>> '{addenda,0,author_name}' = 'Test 0c', 'avenant daté et signé';
  assert jsonb_array_length(v -> 'prescriptions') = 2, 'deuxième ordonnance';
  raise notice 'OK : avenant daté avec son auteur ; ordonnance ajoutée après validation';
end $$;
reset role;
select pg_temp.refus(format('update public.encounter_addenda set body = %L', 'x'), '42501');
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Consultation sensible
-- -----------------------------------------------------------------------------
-- RDV de PF (type discret) : sensible d'office ; jamais rendue non sensible.
select pg_temp.en_tant_que('0e');
do $$
declare
  v     jsonb;
  v_ver integer;
begin
  v := public.start_encounter(current_setting('test.awa')::uuid, current_setting('test.visite_pf')::uuid);
  assert (v ->> 'is_sensitive')::boolean, 'PF sensible';
  assert v ->> 'type_label' = 'Planification familiale', 'type repris du RDV';
  perform set_config('test.e_pf', v ->> 'id', true);
  v_ver := (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
    '{"reason": "Renouvellement", "is_sensitive": false}') ->> 'version')::integer;
  assert (pg_temp.enc((v ->> 'id')::uuid)).is_sensitive, 'toujours sensible';
  perform public.validate_encounter((v ->> 'id')::uuid, v_ver);
  raise notice 'OK : consultation issue d''un RDV discret sensible d''office, jamais rendue non sensible';
end $$;
reset role;
select pg_temp.refus(format('update public.encounters set is_sensitive = false where id = %L',
  current_setting('test.e_pf')), '42501', 'sensible le reste');
set local role authenticated;

-- Diagnostic sensible : la consultation devient sensible dès l'enregistrement.
select pg_temp.en_tant_que('0c');
do $$
declare
  v jsonb;
  w jsonb;
begin
  v := public.start_encounter(current_setting('test.moussa')::uuid);
  assert not (v ->> 'is_sensitive')::boolean, 'pas encore';
  w := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer, jsonb_build_object(
    'reason', 'Bilan', 'diagnoses', jsonb_build_array(jsonb_build_object('catalog_id', pg_temp.diag('B20'), 'rank', 'primary'))));
  assert (w ->> 'is_sensitive')::boolean, 'devenue sensible';
  -- Le diagnostic retiré, elle reste sensible.
  w := public.save_encounter_draft((v ->> 'id')::uuid, (w ->> 'version')::integer, '{"reason": "Bilan"}');
  assert (w ->> 'is_sensitive')::boolean, 'reste sensible';
  perform public.validate_encounter((v ->> 'id')::uuid, (w ->> 'version')::integer);
  perform set_config('test.e_vih', v ->> 'id', true);
  raise notice 'OK : diagnostic sensible : consultation sensible, même après retrait du diagnostic';
end $$;

-- Aide-soignant : lit les consultations ordinaires, jamais les sensibles.
select pg_temp.en_tant_que('0d');
do $$
declare
  v jsonb;
begin
  v := public.get_encounter(current_setting('test.e1')::uuid);
  assert v ->> 'reason' = 'Fièvre depuis 3 jours', 'lecture ordinaire';
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e_vih')), '42501', 'Consultation introuvable.');
  perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.e_pf')), '42501');
  assert not exists (select 1 from public.patient_timeline(current_setting('test.moussa')::uuid)
                      where encounter_id = current_setting('test.e_vih')::uuid), 'absente de la chronologie';
  assert not exists (select 1 from public.patient_timeline(current_setting('test.awa')::uuid)
                      where kind not in ('visit', 'appointment')), 'PF absente';
  perform pg_temp.refus(format('select public.add_encounter_addendum(%L, %L)', current_setting('test.e1'), 'x'), '42501');
  raise notice 'OK : aide-soignant : lecture ordinaire seulement, rien de sensible, aucune écriture';
end $$;

-- Lectures journalisées ; chronologie sans contenu sensible.
select pg_temp.en_tant_que('0e');
do $$
declare
  v_l record;
begin
  perform public.get_encounter(current_setting('test.e_vih')::uuid);
  perform public.get_encounter(current_setting('test.e_pf')::uuid);
  perform public.get_encounter(current_setting('test.e_pf')::uuid);
  select * into v_l from public.patient_timeline(current_setting('test.moussa')::uuid, array['encounter'])
   where encounter_id = current_setting('test.e_vih')::uuid;
  assert v_l.is_sensitive and v_l.detail is null and v_l.title = 'Consultation', 'chronologie sans diagnostic';
  select * into v_l from public.patient_timeline(current_setting('test.moussa')::uuid, array['encounter'])
   where encounter_id = current_setting('test.e1')::uuid;
  assert v_l.detail = 'Paludisme simple à Plasmodium falciparum', 'diagnostic principal';
  assert (select count(*) from public.patient_timeline(current_setting('test.moussa')::uuid, array['prescription'])) = 2, 'filtre';
  raise notice 'OK : chronologie filtrable, sans diagnostic d''une consultation sensible';
end $$;

-- Owner sans exercice : aucune ligne de lecture, seulement le résumé sans patient.
select pg_temp.en_tant_que('0a');
do $$
declare
  v_r record;
begin
  assert not exists (select 1 from public.audit_logs
                      where org_id = current_setting('test.org')::uuid and action = 'READ'), 'lignes cachées';
  assert exists (select 1 from public.audit_logs
                  where org_id = current_setting('test.org')::uuid and action <> 'READ'), 'reste du journal visible';
  assert not exists (select 1 from public.audit_logs
                      where org_id = current_setting('test.org')::uuid
                        and table_name in ('encounters', 'encounter_addenda', 'prescriptions',
                                           'referrals', 'certificates', 'medical_history',
                                           'surveillance_alerts')), 'journal médical caché';
  select * into v_r from public.sensitive_reads_summary(current_setting('test.org')::uuid,
    current_date - 7, current_date + 1);
  assert v_r.user_name = 'Test 0e' and v_r.patients = 2 and v_r.reads = 3, 'résumé : 2 dossiers, 3 lectures';
  raise notice 'OK : owner sans exercice : résumé « Test 0e : 2 dossiers sensibles », ni lecture ni ligne des tables médicales';
end $$;
select pg_temp.en_tant_que('0e');
select pg_temp.refus(format('select * from public.sensitive_reads_summary(%L, current_date - 7, current_date)',
  current_setting('test.org')), '42501');

-- Owner qui exerce : lignes complètes.
reset role;
update public.memberships set is_clinician = true
 where org_id = current_setting('test.org')::uuid and user_id = '00000000-0000-4000-a140-00000000000a';
set local role authenticated;
select pg_temp.en_tant_que('0a');
do $$
begin
  assert (select count(*) from public.audit_logs
           where org_id = current_setting('test.org')::uuid and action = 'READ'
             and table_name = 'encounters') = 3, 'lignes lisibles';
  assert exists (select 1 from public.audit_logs
                  where org_id = current_setting('test.org')::uuid and action = 'INSERT'
                    and table_name = 'prescriptions'), 'journal médical lisible';
  assert not exists (select 1 from public.audit_logs
                      where org_id = current_setting('test.org')::uuid and action = 'READ'
                        and new_data::text ~ 'Bilan|Renouvellement'), 'aucun contenu';
  raise notice 'OK : owner qui exerce : lignes de lecture complètes, sans contenu médical';
end $$;
reset role;
update public.memberships set is_clinician = false
 where org_id = current_setting('test.org')::uuid and user_id = '00000000-0000-4000-a140-00000000000a';
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Brouillons oubliés, abandon
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v jsonb;
begin
  v := public.start_encounter(current_setting('test.awa')::uuid);
  assert exists (select 1 from public.my_draft_encounters(current_setting('test.org')::uuid)
                  where encounter_id = (v ->> 'id')::uuid and patient_first_name = 'Awa'), 'brouillon listé';
  perform pg_temp.en_tant_que('0e');
  assert not exists (select 1 from public.my_draft_encounters(current_setting('test.org')::uuid)
                      where encounter_id = (v ->> 'id')::uuid), 'pas chez les autres';
  perform pg_temp.en_tant_que('0c');
  perform public.discard_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer);
  assert not exists (select 1 from public.my_draft_encounters(current_setting('test.org')::uuid)
                      where encounter_id = (v ->> 'id')::uuid), 'abandonné';
  raise notice 'OK : brouillons non validés listés pour leur seul auteur ; abandon sans effacement';
end $$;

-- -----------------------------------------------------------------------------
-- Diagnostics : recherche, favoris, ajout local
-- -----------------------------------------------------------------------------
do $$
declare
  v_ids text[];
begin
  select array_agg(code) into v_ids from public.search_diagnoses(current_setting('test.org')::uuid, 'palu');
  assert 'B50.9' = any (v_ids) and 'B54' = any (v_ids), 'palu';
  assert exists (select 1 from public.search_diagnoses(current_setting('test.org')::uuid, 'cholera')
                  where code = 'A00.9' and is_notifiable and notification_delay = 'immediate'), 'sans accent';
  assert exists (select 1 from public.search_diagnoses(current_setting('test.org')::uuid, 'HTA') where code = 'I10'), 'synonyme';
  assert exists (select 1 from public.search_diagnoses(current_setting('test.org')::uuid, 'pneumonei') where code = 'J18.9'), 'faute tolérée';
  assert (select code from public.search_diagnoses(current_setting('test.org')::uuid, 'j18.9') limit 1) = 'J18.9', 'code';
  assert not exists (select 1 from public.search_diagnoses(current_setting('test.org')::uuid, null)), 'aucun favori';
  perform public.set_diagnosis_favorite(current_setting('test.org')::uuid, pg_temp.diag('I10'), true);
  assert (select array_agg(code) from public.search_diagnoses(current_setting('test.org')::uuid, '')) = array['I10'], 'favori';
  assert (select is_favorite from public.search_diagnoses(current_setting('test.org')::uuid, 'tension') where code = 'I10'), 'marqué';
  perform public.set_diagnosis_favorite(current_setting('test.org')::uuid, pg_temp.diag('I10'), false);
  assert not exists (select 1 from public.search_diagnoses(current_setting('test.org')::uuid, null)), 'retiré';
  perform pg_temp.refus(format('select public.save_org_diagnosis(%L, null, %L)', current_setting('test.org'), 'Local'), '42501');
  raise notice 'OK : recherche (sans accent, synonyme, faute, code) ; favoris par soignant ; ajout local réservé';
end $$;

select pg_temp.en_tant_que('0a');
do $$
declare
  v_id uuid;
begin
  perform pg_temp.refus(format('select public.save_org_diagnosis(%L, null, %L, %L)',
    current_setting('test.org'), 'Local', 'b5'), '22023', 'Code CIM-10');
  v_id := public.save_org_diagnosis(current_setting('test.org')::uuid, null, 'Pian', 'A66', null, true);
  perform pg_temp.refus(format('select public.save_org_diagnosis(%L, %L, %L, null, null, false)',
    current_setting('test.org'), v_id, 'Pian'), '42501', 'sensible le reste');
  perform pg_temp.refus(format('select public.save_org_diagnosis(%L, %L, %L)',
    current_setting('test.org'), pg_temp.diag('I10'), 'HTA'), '42501');
  raise notice 'OK : diagnostic local (owner) ; code contrôlé ; référentiel commun intouchable';
end $$;

-- -----------------------------------------------------------------------------
-- Antécédents
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0e');
do $$
declare
  v_id uuid;
begin
  perform public.save_medical_history_item(current_setting('test.awa')::uuid, null, 'obstetric',
    'Gestité 3, parité 2', 'Dernier accouchement en 2024', 2024);
  v_id := public.save_medical_history_item(current_setting('test.awa')::uuid, null, 'medical',
    'Suivi en psychiatrie', null, 2022, true);
  perform pg_temp.refus(format('select public.save_medical_history_item(%L, %L, %L, %L, null, null, false)',
    current_setting('test.awa'), v_id, 'medical', 'Suivi'), '42501', 'sensible le reste');
  perform pg_temp.refus(format('select public.save_medical_history_item(%L, null, %L, %L)',
    current_setting('test.awa'), 'autre', 'x'), '22023');
  assert (select count(*) from public.get_medical_history(current_setting('test.awa')::uuid)) = 2, 'deux';
  perform pg_temp.en_tant_que('0d');
  assert (select count(*) from public.get_medical_history(current_setting('test.awa')::uuid)) = 1, 'sensible caché';
  perform pg_temp.refus(format('select public.save_medical_history_item(%L, null, %L, %L)',
    current_setting('test.awa'), 'medical', 'HTA'), '42501');
  perform pg_temp.en_tant_que('0e');
  perform public.remove_medical_history_item(v_id);
  assert (select count(*) from public.get_medical_history(current_setting('test.awa')::uuid)) = 1, 'retiré';
  raise notice 'OK : antécédents par catégorie ; sensible caché à l''aide-soignant et jamais rendu ordinaire ; retrait sans effacement';
end $$;
reset role;
select pg_temp.refus('delete from public.medical_history', '42501');
do $$
begin
  assert exists (select 1 from public.audit_logs where action = 'READ' and table_name = 'medical_history'
                    and new_data ->> 'patient_id' = current_setting('test.awa')), 'lecture sensible journalisée';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Référence, contre-référence, certificat
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_ref  uuid;
  v_cert uuid;
  v_tpl  uuid;
begin
  perform pg_temp.refus(format('select public.create_referral(%L, null, null, %L, %L)',
    current_setting('test.e1'), 'urgent', 'Paludisme grave'), '22023', 'établissement');
  v_ref := public.create_referral(current_setting('test.e1')::uuid, null, 'Centre de santé de Kolda',
    'urgent', 'Vomissements incoercibles', 'Paludisme confirmé', 'Artéméther-luméfantrine, 1 prise');
  perform public.record_counter_referral(v_ref, (now() at time zone 'Africa/Dakar')::date,
    'Centre de santé de Kolda', null, 'Hospitalisé 2 jours, sorti guéri.');
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L::date, null, %L)', v_ref,
    (now() at time zone 'Africa/Dakar')::date, 'encore'), '22023', 'déjà');

  select id into v_tpl from public.certificate_templates
   where org_id = current_setting('test.org')::uuid and template_code = 'repos';
  perform pg_temp.refus(format('select public.issue_certificate(%L, %L, %L, %L, 3)',
    current_setting('test.e1'), v_tpl, 'Certificat de repos', 'Repos de trois jours.'), '22023', 'date de début');
  v_cert := public.issue_certificate(current_setting('test.e1')::uuid, v_tpl, 'Certificat de repos',
    'Je soussigné certifie… repos de 3 jours.', 3, '2026-10-20');
  assert (select count(*) from public.patient_timeline(current_setting('test.moussa')::uuid, array['referral', 'certificate'])) = 2, 'dans la chronologie';
  assert (select detail from public.patient_timeline(current_setting('test.moussa')::uuid, array['referral'])) = 'Contre-référence reçue', 'retour';
  perform set_config('test.ref', v_ref::text, true);
  perform set_config('test.cert', v_cert::text, true);

  perform pg_temp.en_tant_que('09');
  perform pg_temp.refus(format('select public.create_referral(%L, null, %L, %L, %L)',
    current_setting('test.e1'), 'Hôpital', 'routine', 'x'), '42501');
  raise notice 'OK : référence, contre-référence une seule fois, certificat de repos ; accueil refusé';
end $$;
reset role;
do $$
begin
  assert (select ends_on from public.certificates where id = current_setting('test.cert')::uuid) = '2026-10-22', 'fin du repos';
  perform pg_temp.refus(format('update public.referrals set reason = %L where id = %L', 'x', current_setting('test.ref')), '42501');
  perform pg_temp.refus(format('update public.referrals set counter_referral = %L where id = %L', 'x', current_setting('test.ref')), '42501');
  perform pg_temp.refus(format('update public.certificates set body = %L where id = %L', 'x', current_setting('test.cert')), '42501');
  raise notice 'OK : référence et certificat figés dans la base';
end $$;

-- Sans la feature « references » (retirée du plan le temps du test) : refus.
delete from public.plan_features where plan_code = 'poste_sante' and feature_code = 'references';
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
begin
  perform pg_temp.refus(format('select public.create_referral(%L, null, %L, %L, %L)',
    current_setting('test.e1'), 'Hôpital', 'routine', 'x'), '42501', 'offre');
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L::date, null, %L)',
    current_setting('test.ref'), (now() at time zone 'Africa/Dakar')::date, 'x'), '42501');
  assert not (public.encounter_permissions(current_setting('test.org')::uuid) ->> 'references')::boolean, 'droits';
  raise notice 'OK : sans la feature « references » : référence refusée';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- Fusion de dossiers : consultations et documents suivent le dossier gardé
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.en_tant_que('0a');
select public.merge_patients(current_setting('test.doublon')::uuid, current_setting('test.moussa')::uuid, 'Doublon');
reset role;
do $$
begin
  assert (pg_temp.enc(current_setting('test.e1')::uuid)).patient_id = current_setting('test.doublon')::uuid, 'consultation suivie';
  assert (select count(*) from public.prescriptions where patient_id = current_setting('test.doublon')::uuid) = 2, 'ordonnances';
  assert (select patient_id from public.referrals where id = current_setting('test.ref')::uuid) = current_setting('test.doublon')::uuid, 'référence';
  assert (select patient_id from public.certificates where id = current_setting('test.cert')::uuid) = current_setting('test.doublon')::uuid, 'certificat';
  assert (pg_temp.enc(current_setting('test.e1')::uuid)).plan = 'Traitement ambulatoire.', 'contenu intact';
  raise notice 'OK : fusion : consultation validée, ordonnances, référence, certificat rattachés au dossier gardé';
end $$;

rollback;
