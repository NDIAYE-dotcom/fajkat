-- =============================================================================
-- Tests — étape 14, partie E : références, certificats, prochain rendez-vous
-- -----------------------------------------------------------------------------
-- Vérifie : lignes du journal des tables cliniques (constantes, motif de venue, note de
-- rendez-vous, fiche médicale, lien consultation -> rendez-vous) lues par l'owner ou
-- l'admin qui exerce, jamais par l'owner qui n'exerce pas ; liste de l'étape 14 A entière ;
-- referral_return_days fermée au client ; modèles de certificat sans aucune variable de
-- diagnostic (refusée par la base) ; références (liste en attente et revenues, retard après
-- le délai, consultation sensible sans motif ni urgence, lecture journalisée, contre-
-- référence une seule fois, dates contrôlées) ; certificats (numéro par structure et par
-- année, figés, lecture journalisée) ; prochain rendez-vous (origine « followup »,
-- report suivi, type discret masqué à l'accueil) ; accueil, caissier, comptable,
-- aide-soignant et owner qui n'exerce pas refusés partout ; correctif 14f (un passage relié
-- à un seul rendez-vous).
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14g.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a14a-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14g-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e', '0f', '09', '08']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14a-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 14G', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14a-000000000008", "role": "authenticated"}', true);
select set_config('test.autre',
  public.create_organization('Poste de santé 14G bis', 'poste_sante', 'SN', 'Kolda')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b admin qui exerce, 0c infirmier, 0d aide-soignant,
-- 0e caissier, 0f comptable, 09 accueil ; 08 owner de l'autre structure.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a14a-0000000000' || c)::uuid, r, true, e
  from (values ('0b', 'admin', true), ('0c', 'infirmier', false), ('0d', 'aide_soignant', false),
               ('0e', 'caissier', false), ('0f', 'comptable', false), ('09', 'accueil', false)) v(c, r, e);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a14a-0000000000' || p_code,
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
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Journal des tables cliniques
-- -----------------------------------------------------------------------------
do $$
declare
  v_attendu text[] := array['encounters', 'encounter_addenda', 'encounter_handovers', 'diagnoses',
    'encounter_tests', 'prescriptions', 'prescription_items', 'referrals', 'certificates',
    'medical_history', 'surveillance_alerts', 'encounter_followups', 'vital_signs',
    'visit_reasons', 'appointment_notes', 'patient_medical'];
  v_t text;
begin
  foreach v_t in array v_attendu loop
    if not public.audit_table_is_medical(v_t) then
      raise exception 'ÉCHEC : % absente de audit_table_is_medical', v_t;
    end if;
  end loop;
  if public.audit_table_is_medical('patients') or public.audit_table_is_medical('appointments') then
    raise exception 'ÉCHEC : table d''identité ou d''agenda rangée parmi les tables médicales';
  end if;
  raise notice 'OK : liste de l''étape 14 A entière, plus constantes, motif, note, fiche médicale, suivi';
end $$;

set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_p uuid;
  v_v public.visits;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'Diallo', 'Journal', 'F', 40) returning id into v_p;
  v_v := public.register_arrival(current_setting('test.org')::uuid, v_p,
    (select id from public.queue_services where org_id = current_setting('test.org')::uuid
        and template_code = 'consultation'), 'normal', 'Maux de tête');
  perform public.save_vitals(v_v.id, '{"systolic": 160, "diastolic": 100}');
  perform public.save_patient_medical(v_p, 'O+', 'Pénicilline', null, false);
  perform public.book_appointment(current_setting('test.org')::uuid, v_p,
    (select id from public.appointment_types where org_id = current_setting('test.org')::uuid
        and template_code = 'consultation'),
    ((((now() at time zone 'Africa/Dakar')::date + 3) + time '10:00')::timestamp
       at time zone 'Africa/Dakar'),
    p_note => 'Contrôle de la tension', p_confirm => true);
end $$;

-- Owner qui n'exerce pas : aucune ligne de ces tables, ni par la table, ni par un filtre.
select pg_temp.en_tant_que('0a');
do $$
begin
  if exists (select 1 from public.audit_logs
              where org_id = current_setting('test.org')::uuid
                and table_name in ('vital_signs', 'visit_reasons', 'appointment_notes',
                                   'patient_medical')) then
    raise exception 'ÉCHEC : l''owner qui n''exerce pas lit le journal des tables cliniques';
  end if;
  if not exists (select 1 from public.audit_logs
                  where org_id = current_setting('test.org')::uuid and table_name = 'patients') then
    raise exception 'ÉCHEC : l''owner ne lit plus le journal de l''identité';
  end if;
  raise notice 'OK : owner qui n''exerce pas : ni constantes, ni motif, ni note, ni fiche médicale dans le journal';
end $$;

-- Admin qui exerce : les lignes, sans aucune valeur.
select pg_temp.en_tant_que('0b');
do $$
begin
  if (select count(distinct table_name) from public.audit_logs
       where org_id = current_setting('test.org')::uuid
         and table_name in ('vital_signs', 'visit_reasons', 'appointment_notes',
                            'patient_medical')) <> 4 then
    raise exception 'ÉCHEC : l''admin qui exerce ne lit pas le journal des tables cliniques';
  end if;
  if exists (select 1 from public.audit_logs
              where org_id = current_setting('test.org')::uuid
                and table_name in ('vital_signs', 'visit_reasons', 'appointment_notes',
                                   'patient_medical')
                and coalesce(new_data::text, '') || coalesce(old_data::text, '')
                    ~* '160|maux de tête|pénicilline|contrôle de la tension') then
    raise exception 'ÉCHEC : valeur clinique recopiée dans le journal';
  end if;
  raise notice 'OK : admin qui exerce : lignes des tables cliniques, sans valeur';
end $$;

-- -----------------------------------------------------------------------------
-- 2. Délai de retour : fonction interne
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
select pg_temp.refus(format('select public.referral_return_days(%L)', current_setting('test.org')),
                     '42501');
reset role;
do $$
begin
  if public.referral_return_days(current_setting('test.org')::uuid) <> 14 then
    raise exception 'ÉCHEC : délai par défaut';
  end if;
  update public.organizations set settings = settings || '{"referral_return_days": 21}'
   where id = current_setting('test.org')::uuid;
  if public.referral_return_days(current_setting('test.org')::uuid) <> 21 then
    raise exception 'ÉCHEC : délai réglé';
  end if;
  update public.organizations set settings = settings || '{"referral_return_days": "abc"}'
   where id = current_setting('test.org')::uuid;
  if public.referral_return_days(current_setting('test.org')::uuid) <> 14 then
    raise exception 'ÉCHEC : délai illisible';
  end if;
  raise notice 'OK : délai de retour fermé au client ; 14 jours par défaut, réglage lu, valeur illisible ignorée';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Modèles de certificat : aucune variable de diagnostic
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.certificate_template_defaults
              where not public.certificate_body_variables_ok(body) or body ~* 'diagnos|motif|\{cim')
     or exists (select 1 from public.certificate_templates
                 where not public.certificate_body_variables_ok(body) or body ~* 'diagnos|motif|\{cim') then
    raise exception 'ÉCHEC : modèle de certificat avec une variable de diagnostic';
  end if;
  if exists (select 1 from public.certificate_templates where body like '%{date_naissance}%'
                and org_id = current_setting('test.org')::uuid) then
    raise exception 'ÉCHEC : modèle par défaut sans {naissance}';
  end if;
  raise notice 'OK : modèles par défaut et des structures sans variable de diagnostic ; {naissance}';
end $$;

set local role authenticated;
select pg_temp.en_tant_que('0a');
select pg_temp.refus(format(
  'insert into public.certificate_templates (org_id, label, body) values (%L, %L, %L)',
  current_setting('test.org'), 'Certificat de maladie', 'Le patient {patient} souffre de {diagnostic}.'),
  '23514');
select pg_temp.refus(format(
  'update public.certificate_templates set body = %L where org_id = %L and template_code = %L',
  'Repos pour {motif}, {jours} jour(s).', current_setting('test.org'), 'repos'), '23514');
-- L'owner qui n'exerce pas lit et modifie les modèles (aucune donnée de patient).
do $$
begin
  if (select count(*) from public.certificate_templates
       where org_id = current_setting('test.org')::uuid) <> 3 then
    raise exception 'ÉCHEC : l''owner qui n''exerce pas ne lit pas les modèles';
  end if;
  update public.certificate_templates set label = 'Certificat de repos médical'
   where org_id = current_setting('test.org')::uuid and template_code = 'repos';
  if not found then
    raise exception 'ÉCHEC : l''owner qui n''exerce pas ne modifie pas les modèles';
  end if;
  raise notice 'OK : variable de diagnostic ou de motif refusée par la base ; modèles réglés par l''owner';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 4. Références
-- -----------------------------------------------------------------------------
create function pg_temp.consultation(p_nom text, p_type text) returns uuid
language plpgsql as $$
declare
  v_p uuid;
  v   jsonb;
  s   jsonb;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'Doc', p_nom, 'F', 30) returning id into v_p;
  v := public.start_encounter(v_p, null, (select id from public.encounter_types
         where org_id = current_setting('test.org')::uuid and template_code = p_type));
  s := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
         '{"reason": "Fièvre", "prescription": {"items": [{"product_name": "Paracétamol"}]}}');
  perform public.validate_encounter((v ->> 'id')::uuid, (s ->> 'version')::integer);
  return (v ->> 'id')::uuid;
end;
$$;
grant execute on function pg_temp.consultation(text, text) to authenticated;

set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_ordinaire uuid := pg_temp.consultation('Ordinaire', 'consultation');
  v_sensible  uuid := pg_temp.consultation('Sensible', 'pf');
begin
  perform set_config('test.e_ord', v_ordinaire::text, true);
  perform set_config('test.e_sens', v_sensible::text, true);
  perform set_config('test.r_ord', public.create_referral(v_ordinaire, null,
    'Hôpital régional de Kolda', 'urgent', 'Paludisme grave', 'Fièvre depuis 3 jours',
    'Paracétamol')::text, true);
  perform set_config('test.r_sens', public.create_referral(v_sensible, null,
    'Centre de santé de Kolda', 'routine', 'Pose d''implant', 'Contraception', null)::text, true);
end $$;

do $$
declare
  o record;
  x record;
begin
  select * into o from public.list_referrals(current_setting('test.org')::uuid, 'pending')
   where id = current_setting('test.r_ord')::uuid;
  select * into x from public.list_referrals(current_setting('test.org')::uuid, 'pending')
   where id = current_setting('test.r_sens')::uuid;
  if o.reason <> 'Paludisme grave' or o.urgency <> 'urgent' or o.is_sensitive or o.is_late
     or o.return_days <> 14 or o.days_waiting <> 0 then
    raise exception 'ÉCHEC : référence ordinaire dans la liste : %', o;
  end if;
  if x.reason is not null or x.urgency is not null or not x.is_sensitive
     or x.destination_name <> 'Centre de santé de Kolda' or x.patient_first_name <> 'Sensible' then
    raise exception 'ÉCHEC : référence sensible dans la liste : %', x;
  end if;
  raise notice 'OK : liste des références ; consultation sensible : ni motif ni urgence';
end $$;

-- Lecture d'une référence sensible : journalisée une fois par ouverture.
do $$
declare
  v_ouverture uuid := gen_random_uuid();
  r jsonb;
begin
  r := public.get_referral(current_setting('test.r_sens')::uuid, v_ouverture);
  r := public.get_referral(current_setting('test.r_sens')::uuid, v_ouverture);
  if r ->> 'reason' <> 'Pose d''implant' or not (r ->> 'is_sensitive')::boolean then
    raise exception 'ÉCHEC : get_referral sensible : %', r;
  end if;
  r := public.get_referral(current_setting('test.r_ord')::uuid);
  if r ->> 'referrer_name' <> 'Test 0c' or r ->> 'return_days' <> '14' then
    raise exception 'ÉCHEC : get_referral ordinaire : %', r;
  end if;
  perform set_config('test.ouverture', v_ouverture::text, true);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.audit_logs where action = 'READ' and table_name = 'referrals'
         and record_id = current_setting('test.r_sens')) <> 1
     or exists (select 1 from public.audit_logs where action = 'READ' and table_name = 'referrals'
                   and record_id = current_setting('test.r_ord')) then
    raise exception 'ÉCHEC : lecture de référence journalisée';
  end if;
  raise notice 'OK : lecture d''une référence sensible journalisée une fois par ouverture, pas l''ordinaire';
end $$;

-- En retard : référence d'il y a 20 jours (écrite directement, la base n'antidate rien).
set local session_replication_role = replica;
update public.referrals set referred_at = referred_at - interval '20 days'
 where id = current_setting('test.r_ord')::uuid;
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.en_tant_que('0b');
do $$
declare
  o record;
  v_auj date := (now() at time zone 'Africa/Dakar')::date;
begin
  select * into o from public.list_referrals(current_setting('test.org')::uuid, 'pending')
   where id = current_setting('test.r_ord')::uuid;
  if not o.is_late or o.days_waiting <> 20 then
    raise exception 'ÉCHEC : retard après 14 jours : %', o;
  end if;
  -- Contre-référence : dates et contenu contrôlés, puis une seule fois.
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L)',
    current_setting('test.r_ord'), v_auj + 1), '22023', 'Date impossible');
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L)',
    current_setting('test.r_ord'), v_auj - 30), '22023', 'Date impossible');
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L, %L)',
    current_setting('test.r_ord'), v_auj, 'Hôpital'), '22023', 'au moins');
  perform public.record_counter_referral(current_setting('test.r_ord')::uuid, v_auj - 2,
    'Hôpital régional de Kolda', 'Paludisme grave confirmé', 'Artésunate injectable',
    null, 'Contrôle au poste dans 7 jours');
  perform pg_temp.refus(format('select public.record_counter_referral(%L, %L, null, %L)',
    current_setting('test.r_ord'), v_auj, 'x'), '22023', 'déjà');
  select * into o from public.list_referrals(current_setting('test.org')::uuid, 'returned')
   where id = current_setting('test.r_ord')::uuid;
  if o.counter_received_on <> v_auj - 2 or o.is_late then
    raise exception 'ÉCHEC : référence revenue : %', o;
  end if;
  if exists (select 1 from public.list_referrals(current_setting('test.org')::uuid, 'pending')
              where id = current_setting('test.r_ord')::uuid) then
    raise exception 'ÉCHEC : référence revenue encore en attente';
  end if;
  if (public.get_referral(current_setting('test.r_ord')::uuid) ->> 'counter_referral')
     <> E'Diagnostic retenu : Paludisme grave confirmé\nTraitement : Artésunate injectable\nSuivi : Contrôle au poste dans 7 jours' then
    raise exception 'ÉCHEC : texte de la contre-référence';
  end if;
  raise notice 'OK : retard après le délai ; contre-référence (dates contrôlées, une seule fois) ; liste des revenues';
end $$;
reset role;
do $$
begin
  perform pg_temp.refus(format('update public.referrals set counter_plan = %L where id = %L',
    'x', current_setting('test.r_ord')), '42501');
  raise notice 'OK : contre-référence figée une fois saisie';
end $$;

-- Délai réglé par la structure : 30 jours -> plus en retard.
update public.organizations set settings = settings || '{"referral_return_days": 30}'
 where id = current_setting('test.org')::uuid;
set local session_replication_role = replica;
update public.referrals set referred_at = referred_at - interval '20 days'
 where id = current_setting('test.r_sens')::uuid;
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
begin
  if (select is_late or return_days <> 30 from public.list_referrals(current_setting('test.org')::uuid, 'pending')
       where id = current_setting('test.r_sens')::uuid) then
    raise exception 'ÉCHEC : délai réglé à 30 jours';
  end if;
  raise notice 'OK : délai réglé par la structure';
end $$;

-- -----------------------------------------------------------------------------
-- 5. Certificats
-- -----------------------------------------------------------------------------
do $$
declare
  v_tpl uuid := (select id from public.certificate_templates
                  where org_id = current_setting('test.org')::uuid and template_code = 'repos');
  v_annee text := extract(year from now() at time zone 'Africa/Dakar')::text;
  c1 uuid;
  c2 uuid;
  r  jsonb;
begin
  c1 := public.issue_certificate(current_setting('test.e_ord')::uuid, v_tpl, 'Certificat de repos',
          'Repos de 3 jours, du 20/10/2026 au 22/10/2026 inclus.', 3, '2026-10-20');
  c2 := public.issue_certificate(current_setting('test.e_sens')::uuid, v_tpl, 'Certificat médical',
          'Je certifie avoir examiné ce jour la patiente.');
  perform set_config('test.c1', c1::text, true);
  perform set_config('test.c2', c2::text, true);
  r := public.get_certificate(c1);
  if r ->> 'number' <> 'CERT-' || v_annee || '-0001'
     or public.get_certificate(c2, current_setting('test.ouverture')::uuid) ->> 'number'
        <> 'CERT-' || v_annee || '-0002'
     or r ->> 'issuer_name' <> 'Test 0c' or (r ->> 'includes_diagnosis')::boolean then
    raise exception 'ÉCHEC : numéros des certificats : %', r;
  end if;
  perform public.get_certificate(c2, current_setting('test.ouverture')::uuid);
  raise notice 'OK : certificats numérotés CERT-%-0001, 0002 ; sans diagnostic', v_annee;
end $$;
reset role;
do $$
begin
  perform pg_temp.refus(format('update public.certificates set number = %L where id = %L',
    'CERT-1', current_setting('test.c1')), '42501');
  if (select count(*) from public.audit_logs where action = 'READ' and table_name = 'certificates'
         and record_id = current_setting('test.c2')) <> 1
     or exists (select 1 from public.audit_logs where action = 'READ' and table_name = 'certificates'
                   and record_id = current_setting('test.c1')) then
    raise exception 'ÉCHEC : lecture des certificats journalisée';
  end if;
  raise notice 'OK : certificat figé ; lecture d''un certificat sensible journalisée';
end $$;
-- Autre structure : sa propre numérotation.
update public.memberships set is_clinician = true
 where org_id = current_setting('test.autre')::uuid
   and user_id = '00000000-0000-4000-a14a-000000000008';
set local role authenticated;
select pg_temp.en_tant_que('08');
do $$
declare
  v_p uuid;
  v   jsonb;
  c   uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.autre')::uuid, 'Autre', 'Patiente', 'F', 30) returning id into v_p;
  v := public.start_encounter(v_p, null);
  c := public.issue_certificate((v ->> 'id')::uuid, null, 'Certificat médical',
         'Je certifie avoir examiné ce jour la patiente.');
  if public.get_certificate(c) ->> 'number' not like 'CERT-%-0001' then
    raise exception 'ÉCHEC : numérotation propre à chaque structure';
  end if;
  raise notice 'OK : numérotation propre à chaque structure';
end $$;

-- -----------------------------------------------------------------------------
-- 6. Prochain rendez-vous
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_jour date := (now() at time zone 'Africa/Dakar')::date + 5;
  a public.appointments;
  b public.appointments;
  f record;
begin
  a := public.schedule_encounter_followup(current_setting('test.e_ord')::uuid,
         (select id from public.appointment_types where org_id = current_setting('test.org')::uuid
             and template_code = 'consultation'),
         (v_jour + time '10:00')::timestamp at time zone 'Africa/Dakar', p_confirm => true);
  if a.source <> 'followup' or a.source_ref <> 'consultation' then
    raise exception 'ÉCHEC : origine du rendez-vous de suivi : %', a;
  end if;
  select * into f from public.get_encounter_followups(current_setting('test.e_ord')::uuid);
  if f.appointment_id <> a.id or f.status <> 'scheduled' or f.rescheduled then
    raise exception 'ÉCHEC : suivi de la consultation : %', f;
  end if;
  -- Report : le suivi donne le nouveau rendez-vous.
  b := public.reschedule_appointment(a.id, (v_jour + 1 + time '11:00')::timestamp at time zone 'Africa/Dakar',
         p_confirm => true);
  select * into f from public.get_encounter_followups(current_setting('test.e_ord')::uuid);
  if f.appointment_id <> b.id or not f.rescheduled
     or f.starts_at <> (v_jour + 1 + time '11:00')::timestamp at time zone 'Africa/Dakar' then
    raise exception 'ÉCHEC : report suivi : %', f;
  end if;
  -- Consultation sensible : rendez-vous de PF (discret).
  a := public.schedule_encounter_followup(current_setting('test.e_sens')::uuid,
         (select id from public.appointment_types where org_id = current_setting('test.org')::uuid
             and template_code = 'pf'),
         (v_jour + time '15:00')::timestamp at time zone 'Africa/Dakar', p_confirm => true);
  perform set_config('test.rdv_pf', a.id::text, true);
  if (select type_label from public.get_encounter_followups(current_setting('test.e_sens')::uuid))
     = 'Consultation' then
    raise exception 'ÉCHEC : le soignant voit le vrai type';
  end if;
  raise notice 'OK : prochain rendez-vous (origine followup, report suivi, vrai type pour le soignant)';
end $$;

-- Accueil : rendez-vous discret sous le libellé neutre, rien qui dise d'où il vient.
select pg_temp.en_tant_que('09');
do $$
declare
  d record;
  v_jour date := (now() at time zone 'Africa/Dakar')::date + 5;
begin
  select * into d from public.list_appointments(current_setting('test.org')::uuid, v_jour, v_jour)
   where id = current_setting('test.rdv_pf')::uuid;
  if d.type_label <> 'Consultation' or d.is_discreet or d.source <> 'agenda' or d.source_ref is not null then
    raise exception 'ÉCHEC : rendez-vous de suivi discret chez l''accueil : %', d;
  end if;
  raise notice 'OK : rendez-vous de suivi discret : « Consultation » à l''accueil, ni origine ni module';
end $$;

-- -----------------------------------------------------------------------------
-- 7. Confidentialité : accueil, caissier, comptable, aide-soignant, owner qui n'exerce pas
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
  v_jour date := (now() at time zone 'Africa/Dakar')::date + 6;
begin
  foreach v_code in array array['09', '0e', '0f', '0d', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select * from public.list_referrals(%L, %L)',
      current_setting('test.org'), 'pending'), '42501');
    perform pg_temp.refus(format('select public.get_referral(%L)', current_setting('test.r_ord')), '42501');
    perform pg_temp.refus(format('select public.record_counter_referral(%L, current_date, null, %L)',
      current_setting('test.r_sens'), 'x'), '42501');
    perform pg_temp.refus(format('select public.get_certificate(%L)', current_setting('test.c1')), '42501');
    perform pg_temp.refus(format('select public.create_referral(%L, null, %L, %L, %L)',
      current_setting('test.e_ord'), 'Hôpital', 'routine', 'x'), '42501');
    perform pg_temp.refus(format('select public.issue_certificate(%L, null, %L, %L)',
      current_setting('test.e_ord'), 'Certificat', 'Texte du certificat.'), '42501');
    perform pg_temp.refus(format('select public.schedule_encounter_followup(%L, %L, %L)',
      current_setting('test.e_ord'), (select id from public.appointment_types
        where org_id = current_setting('test.org')::uuid and template_code = 'consultation'),
      (v_jour + time '09:00')::timestamp at time zone 'Africa/Dakar'), '42501');
    if v_code <> '0d' then
      perform pg_temp.refus(format('select * from public.get_encounter_followups(%L)',
        current_setting('test.e_ord')), '42501');
    end if;
    perform pg_temp.refus('select count(*) from public.referrals', '42501');
    perform pg_temp.refus('select count(*) from public.certificates', '42501');
    perform pg_temp.refus('select count(*) from public.encounter_followups', '42501');
  end loop;
  -- Aide-soignant : lit le suivi d'une consultation ordinaire, jamais d'une sensible.
  perform pg_temp.en_tant_que('0d');
  perform pg_temp.refus(format('select * from public.get_encounter_followups(%L)',
    current_setting('test.e_sens')), '42501');
  raise notice 'OK : accueil, caissier, comptable, aide-soignant, owner qui n''exerce pas : ni référence, ni certificat, ni suivi';
end $$;
-- Owner de l'autre structure : rien de celle-ci.
select pg_temp.en_tant_que('08');
select pg_temp.refus(format('select public.get_referral(%L)', current_setting('test.r_ord')), '42501');
select pg_temp.refus(format('select public.get_certificate(%L)', current_setting('test.c1')), '42501');
reset role;

-- -----------------------------------------------------------------------------
-- 8. Correctif 14f : un passage relié à un seul rendez-vous
-- -----------------------------------------------------------------------------
select set_config('test.hier', ((now() at time zone 'Africa/Dakar')::date - 1)::text, true);
insert into public.patients (org_id, last_name, first_name, sex, declared_age)
select current_setting('test.org')::uuid, 'Lien', n, 'F', 30
  from unnest(array['Relie', 'Deux']) n;
set local session_replication_role = replica;
insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                           ticket_number, status, arrived_at, finished_at)
select current_setting('test.org')::uuid, p.id,
       (select id from public.queue_services where org_id = current_setting('test.org')::uuid
           and template_code = 'consultation'),
       current_setting('test.hier')::date, v.seq, 'A-0' || v.seq, 'done',
       (current_setting('test.hier')::date + time '09:00')::timestamp at time zone 'Africa/Dakar',
       now() - interval '20 hours'
  from (values ('Relie', 70), ('Deux', 71)) v(nom, seq)
  join public.patients p on p.first_name = v.nom and p.last_name = 'Lien';
-- « Relie » : un rendez-vous déjà « Arrivé » relié au passage, un autre encore prévu.
-- « Deux » : deux rendez-vous prévus, un seul passage.
insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, arrived_at, visit_id, source)
select current_setting('test.org')::uuid, p.id,
       (select id from public.appointment_types where org_id = current_setting('test.org')::uuid
           and template_code = 'consultation'),
       (current_setting('test.hier')::date + v.h)::timestamp at time zone 'Africa/Dakar',
       (current_setting('test.hier')::date + v.h + interval '20 minutes')::timestamp at time zone 'Africa/Dakar',
       current_setting('test.hier')::date, v.st,
       case when v.st = 'arrived' then now() - interval '20 hours' end,
       case when v.st = 'arrived' then (select id from public.visits where patient_id = p.id) end,
       'agenda'
  from (values ('Relie', time '20:30', 'arrived'), ('Relie', time '14:20', 'scheduled'),
               ('Deux', time '10:00', 'scheduled'), ('Deux', time '16:00', 'scheduled')) v(nom, h, st)
  join public.patients p on p.first_name = v.nom and p.last_name = 'Lien';
set local session_replication_role = origin;

select public.appointments_close_past(current_setting('test.org')::uuid);
do $$
begin
  if exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
              where p.last_name = 'Lien' and a.status <> 'arrived') then
    raise exception 'ÉCHEC : rendez-vous non « Venu »';
  end if;
  if (select count(*) from public.appointments a join public.patients p on p.id = a.patient_id
       where p.first_name = 'Relie' and a.visit_id is not null) <> 1
     or exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
                 where p.first_name = 'Relie' and a.closed_automatically and a.visit_id is not null) then
    raise exception 'ÉCHEC : passage déjà relié relié une seconde fois';
  end if;
  if exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
              where p.first_name = 'Deux' and a.visit_id is not null) then
    raise exception 'ÉCHEC : deux rendez-vous à clore, un passage : aucun lien attendu';
  end if;
  raise notice 'OK : correctif 14f : « Venu » sans second lien ; deux rendez-vous pour un passage : aucun lien';
end $$;

rollback;
