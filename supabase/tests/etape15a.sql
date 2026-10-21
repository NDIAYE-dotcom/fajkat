-- =============================================================================
-- Tests — étape 15, partie A : suivi de grossesse
-- -----------------------------------------------------------------------------
-- Vérifie : DPA de contrôle (DDR 01/03/2026 -> 08/12/2026 Naegele, 06/12/2026 DDR + 280 j)
-- et ordre de Naegele autour du 29 février ; réglages recopiés à la création, modifiés
-- par owner, admin et sage-femme seulement, appliqués aux seules datations suivantes ;
-- ouverture (patiente seulement, une grossesse en cours, gestité / parité contrôlées,
-- DDR future ou trop ancienne refusée) ; datations par échographie (âge gestationnel ou
-- DPA lue) et estimation clinique, historique gardé, retour à une ancienne datation ;
-- datations et grossesses jamais modifiées ni supprimées en direct ; retrait motivé ;
-- groupe sanguin seul ; lecture par l'aide-soignant sans écriture ; accueil, caissier,
-- owner qui n'exerce pas et autre structure refusés ; aucune lecture directe ; journal
-- sans valeur ; fusion de dossiers.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape15a.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a15a-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e15a-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e', '0f', '09', '08']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15a-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 15A', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15a-000000000008", "role": "authenticated"}', true);
select set_config('test.autre',
  public.create_organization('Clinique 15A bis', 'clinique', 'SN', 'Dakar')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b sage-femme, 0c infirmier, 0d aide-soignant, 0e caissier,
-- 0f admin (n'exerce pas), 09 accueil ; 08 owner de l'autre structure.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a15a-0000000000' || c)::uuid, r, true, false
  from (values ('0b', 'sage_femme'), ('0c', 'infirmier'), ('0d', 'aide_soignant'),
               ('0e', 'caissier'), ('0f', 'admin'), ('09', 'accueil')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a15a-0000000000' || p_code,
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
-- 1. Calcul de la DPA
-- -----------------------------------------------------------------------------
do $$
begin
  if public.pregnancy_edd('2026-03-01', 'naegele', 280) <> '2026-12-08' then
    raise exception 'ÉCHEC : Naegele 01/03/2026 -> %', public.pregnancy_edd('2026-03-01', 'naegele', 280);
  end if;
  if public.pregnancy_edd('2026-03-01', 'plus_days', 280) <> '2026-12-06' then
    raise exception 'ÉCHEC : DDR + 280 j 01/03/2026 -> %', public.pregnancy_edd('2026-03-01', 'plus_days', 280);
  end if;
  -- + 7 j = 31/12/2026, - 3 mois = 30/09/2026 (pas de 31 septembre), + 1 an.
  if public.pregnancy_edd('2026-12-24', 'naegele', 280) <> '2027-09-30' then
    raise exception 'ÉCHEC : Naegele 24/12/2026 -> %', public.pregnancy_edd('2026-12-24', 'naegele', 280);
  end if;
  -- + 7 j = 29/05/2027, - 3 mois = 28/02/2027, + 1 an = 28/02/2028 (et non 29/02 : « + 9 mois »).
  if public.pregnancy_edd('2027-05-22', 'naegele', 280) <> '2028-02-28' then
    raise exception 'ÉCHEC : Naegele 22/05/2027 -> %', public.pregnancy_edd('2027-05-22', 'naegele', 280);
  end if;
  raise notice 'OK : DPA de contrôle (08/12/2026 et 06/12/2026), Naegele pas à pas';
end $$;

-- -----------------------------------------------------------------------------
-- 2. Réglages
-- -----------------------------------------------------------------------------
do $$
declare
  v_s public.maternity_settings;
begin
  select * into v_s from public.maternity_settings where org_id = current_setting('test.org')::uuid;
  if v_s.edd_method <> 'naegele' or v_s.pregnancy_length_days <> 280
     or v_s.max_gestational_days <> 308 then
    raise exception 'ÉCHEC : réglages proposés non recopiés : %', to_jsonb(v_s);
  end if;
  if not exists (select 1 from public.maternity_settings
                  where org_id = current_setting('test.autre')::uuid) then
    raise exception 'ÉCHEC : réglages absents pour une clinique';
  end if;
  raise notice 'OK : réglages recopiés à la création (poste et clinique)';
end $$;

set local role authenticated;
do $$
declare
  v_n integer;
begin
  -- Infirmier, accueil : rien ne change (policy).
  perform pg_temp.en_tant_que('0c');
  update public.maternity_settings set edd_method = 'plus_days'
   where org_id = current_setting('test.org')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ÉCHEC : infirmier modifie les réglages'; end if;
  perform pg_temp.en_tant_que('09');
  if not exists (select 1 from public.maternity_settings
                  where org_id = current_setting('test.org')::uuid) then
    raise exception 'ÉCHEC : réglages illisibles pour un membre';
  end if;
  update public.maternity_settings set edd_method = 'plus_days'
   where org_id = current_setting('test.org')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ÉCHEC : accueil modifie les réglages'; end if;
  perform pg_temp.en_tant_que('08');
  if exists (select 1 from public.maternity_settings
              where org_id = current_setting('test.org')::uuid) then
    raise exception 'ÉCHEC : réglages lus par une autre structure';
  end if;
  perform pg_temp.refus($q$update public.maternity_settings set created_by = null$q$, '42501');
  raise notice 'OK : réglages lus par les membres, refusés à l''infirmier, à l''accueil, à une autre structure';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 3. Ouverture
-- -----------------------------------------------------------------------------
select set_config('test.jour', public.org_local_date(current_setting('test.org')::uuid)::text, false);
set local role authenticated;
select pg_temp.en_tant_que('0b');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_f   uuid;
  v_h   uuid;
  v_g   uuid;
  v_j   jsonb;
  v_ddr date := current_setting('test.jour')::date - 70;
  v_cmd text;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diop', 'Awa', 'F', 24) returning id into v_f;
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diop', 'Moussa', 'M', 30) returning id into v_h;
  perform set_config('test.awa', v_f::text, true);

  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 1, 0, 0)$q$,
    v_h, v_ddr), '22023', 'concerne une patiente');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 2, 2, 1)$q$,
    v_f, v_ddr), '22023', 'au plus 1');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 0, 0, 0)$q$,
    v_f, v_ddr), '22023', 'Gestité');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 1, 0, 0)$q$,
    v_f, v_ddr + 71), '22023', 'futur');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 1, 0, 0)$q$,
    v_f, v_ddr - 300), '22023', 'SA aujourd''hui');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', null, null, null, null, 1, 0, 0)$q$,
    v_f), '22023', 'dernières règles');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'ultrasound', null, %L, 70, %L, 1, 0, 0)$q$,
    v_f, v_ddr + 70, v_ddr + 280), '22023', 'pas les deux');
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'clinical', null, %L, null, null, 1, 0, 0)$q$,
    v_f, v_ddr + 70), '22023', 'âge gestationnel');

  v_g := public.open_pregnancy(v_f, 'lmp', v_ddr, null, null, null, 3, 2, 2, 'Première CPN');
  perform set_config('test.grossesse', v_g::text, true);
  v_j := public.get_pregnancy(v_g);
  if (v_j ->> 'ga_days')::integer <> 70 or (v_j ->> 'edd')::date <> public.pregnancy_edd(v_ddr, 'naegele', 280)
     or (v_j ->> 'gravidity')::integer <> 3 or jsonb_array_length(v_j -> 'datings') <> 1 then
    raise exception 'ÉCHEC : grossesse ouverte : %', v_j;
  end if;
  perform pg_temp.refus(format($q$select public.open_pregnancy(%L, 'lmp', %L, null, null, null, 1, 0, 0)$q$,
    v_f, v_ddr), '22023', 'déjà suivie');
  raise notice 'OK : ouverture (patiente seulement, une seule en cours, contrôles), 10 SA, DPA de Naegele';
end $$;

-- -----------------------------------------------------------------------------
-- 4. Datations
-- -----------------------------------------------------------------------------
do $$
declare
  v_g   uuid := current_setting('test.grossesse')::uuid;
  v_t   date := current_setting('test.jour')::date;
  v_d1  uuid;
  v_d2  uuid;
  v_j   jsonb;
begin
  v_d1 := (public.get_pregnancy(v_g) ->> 'current_dating_id')::uuid;
  -- Échographie d'hier : 11 SA + 0 j -> DDR équivalente = hier - 77, DPA = + 280.
  v_d2 := public.add_pregnancy_dating(v_g, 'ultrasound', null, v_t - 1, 77, null, 'Échographie T1');
  v_j := public.get_pregnancy(v_g);
  if (v_j ->> 'current_dating_id')::uuid <> v_d2 or (v_j ->> 'ga_days')::integer <> 78
     or (v_j ->> 'edd')::date <> v_t - 1 - 77 + 280 or jsonb_array_length(v_j -> 'datings') <> 2 then
    raise exception 'ÉCHEC : datation par échographie : %', v_j;
  end if;
  -- DPA lue sur le compte rendu.
  perform public.add_pregnancy_dating(v_g, 'ultrasound', null, v_t, null, v_t + 200, null);
  v_j := public.get_pregnancy(v_g);
  if (v_j ->> 'ga_days')::integer <> 80 or (v_j ->> 'edd')::date <> v_t + 200
     or not (select (d ->> 'edd_reported')::boolean from jsonb_array_elements(v_j -> 'datings') d
                where (d ->> 'is_current')::boolean) then
    raise exception 'ÉCHEC : DPA lue : %', v_j;
  end if;
  perform pg_temp.refus(format($q$select public.add_pregnancy_dating(%L, 'ultrasound', null, %L, null, %L)$q$,
    v_g, v_t, v_t + 400), '22023', 'ne correspond pas');
  perform pg_temp.refus(format($q$select public.add_pregnancy_dating(%L, 'clinical', null, %L, null, %L)$q$,
    v_g, v_t, v_t + 200), '22023', 'âge gestationnel');
  -- Retour à la DDR.
  perform public.retain_pregnancy_dating(v_g, v_d1);
  v_j := public.get_pregnancy(v_g);
  if (v_j ->> 'ga_days')::integer <> 70 or jsonb_array_length(v_j -> 'datings') <> 3 then
    raise exception 'ÉCHEC : retour à la DDR : %', v_j;
  end if;
  perform pg_temp.refus(format($q$select public.retain_pregnancy_dating(%L, gen_random_uuid())$q$, v_g),
    '22023', 'introuvable');
  raise notice 'OK : échographie (âge lu, DPA lue), estimation, historique de 3 datations, retour à la DDR';
end $$;

-- Gestité, parité, groupe sanguin.
do $$
declare
  v_g uuid := current_setting('test.grossesse')::uuid;
begin
  perform public.update_pregnancy_obstetric(v_g, 4, 3, 3);
  if (public.get_pregnancy(v_g) ->> 'parity')::integer <> 3 then
    raise exception 'ÉCHEC : parité non corrigée';
  end if;
  perform pg_temp.refus(format($q$select public.update_pregnancy_obstetric(%L, 2, 2, 0)$q$, v_g),
    '22023', 'au plus 1');
  perform public.set_patient_blood_group(current_setting('test.awa')::uuid, 'O-');
  if public.get_pregnancy(v_g) ->> 'blood_group' <> 'O-' then
    raise exception 'ÉCHEC : groupe sanguin non enregistré';
  end if;
  perform pg_temp.refus(format($q$select public.set_patient_blood_group(%L, 'Z+')$q$,
    current_setting('test.awa')), '22023', 'Groupe sanguin');
  raise notice 'OK : gestité / parité corrigées et contrôlées ; groupe sanguin dans patient_medical';
end $$;

-- -----------------------------------------------------------------------------
-- 5. Rôles
-- -----------------------------------------------------------------------------
do $$
declare
  v_g   uuid := current_setting('test.grossesse')::uuid;
  v_f   uuid := current_setting('test.awa')::uuid;
  v_org uuid := current_setting('test.org')::uuid;
  v_c   text;
begin
  -- Aide-soignant : lit, n'écrit pas.
  perform pg_temp.en_tant_que('0d');
  if public.get_pregnancy(v_g) ->> 'id' <> v_g::text
     or (select count(*) from public.list_patient_pregnancies(v_f)) <> 1
     or (select count(*) from public.list_ongoing_pregnancies(v_org, 'awa diop')) <> 1 then
    raise exception 'ÉCHEC : aide-soignant ne lit pas la grossesse';
  end if;
  perform pg_temp.refus(format($q$select public.update_pregnancy_obstetric(%L, 4, 3, 3)$q$, v_g), '42501');
  perform pg_temp.refus(format($q$select public.set_patient_blood_group(%L, 'A+')$q$, v_f), '42501');
  if (public.maternity_permissions(v_org) ->> 'write')::boolean then
    raise exception 'ÉCHEC : aide-soignant annoncé en écriture';
  end if;

  -- Accueil, caissier, owner et admin qui n'exercent pas, autre structure : rien.
  foreach v_c in array array['09', '0e', '0a', '0f', '08'] loop
    perform pg_temp.en_tant_que(v_c);
    perform pg_temp.refus(format($q$select public.get_pregnancy(%L)$q$, v_g), '42501');
    perform pg_temp.refus(format($q$select * from public.list_patient_pregnancies(%L)$q$, v_f), '42501');
    perform pg_temp.refus(format($q$select * from public.list_ongoing_pregnancies(%L)$q$, v_org), '42501');
    perform pg_temp.refus(format($q$select public.add_pregnancy_dating(%L, 'clinical', null, current_date, 70, null)$q$, v_g), '42501');
    perform pg_temp.refus(format($q$select public.remove_pregnancy(%L, 'Essai')$q$, v_g), '42501');
  end loop;

  -- Aucune lecture directe, même pour la sage-femme.
  perform pg_temp.en_tant_que('0b');
  perform pg_temp.refus($q$select * from public.pregnancies$q$, '42501');
  perform pg_temp.refus($q$select * from public.pregnancy_datings$q$, '42501');
  perform pg_temp.refus($q$select public.pregnancy_dating_compute(gen_random_uuid(), 'lmp', current_date, null, null, null)$q$, '42501');
  raise notice 'OK : aide-soignant en lecture seule ; accueil, caissier, owner et admin qui n''exercent pas, autre structure refusés ; aucune lecture directe';
end $$;

-- Owner qui exerce : écrit ; admin : règle la méthode, sage-femme aussi.
reset role;
update public.memberships set is_clinician = true
 where user_id = '00000000-0000-4000-a15a-00000000000a';
set local role authenticated;
do $$
declare
  v_g uuid := current_setting('test.grossesse')::uuid;
  v_n integer;
  v_j jsonb;
begin
  perform pg_temp.en_tant_que('0a');
  if public.get_pregnancy(v_g) ->> 'id' <> v_g::text then
    raise exception 'ÉCHEC : owner qui exerce ne lit pas';
  end if;
  perform pg_temp.en_tant_que('0b');
  update public.maternity_settings set edd_method = 'plus_days'
   where org_id = current_setting('test.org')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ÉCHEC : sage-femme ne règle pas la méthode'; end if;
  -- Nouvelle DDR après le changement : DDR + 280 ; l'ancienne datation garde Naegele.
  perform public.add_pregnancy_dating(v_g, 'lmp',
            current_setting('test.jour')::date - 72, null, null, null);
  v_j := public.get_pregnancy(v_g);
  if (select d ->> 'edd_method' from jsonb_array_elements(v_j -> 'datings') d
       where (d ->> 'is_current')::boolean) <> 'plus_days'
     or (select count(*) from jsonb_array_elements(v_j -> 'datings') d
          where d ->> 'edd_method' = 'naegele') <> 1 then
    raise exception 'ÉCHEC : méthode du jour non gardée : %', v_j -> 'datings';
  end if;
  perform pg_temp.en_tant_que('0f');
  update public.maternity_settings set edd_method = 'naegele'
   where org_id = current_setting('test.org')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ÉCHEC : admin ne règle pas la méthode'; end if;
  raise notice 'OK : owner qui exerce lit ; sage-femme et admin règlent ; chaque datation garde sa méthode';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 6. Verrous, journal, retrait
-- -----------------------------------------------------------------------------
do $$
declare
  v_g uuid := current_setting('test.grossesse')::uuid;
begin
  -- Même en direct (éditeur SQL) : ni modification d'une datation, ni suppression.
  perform pg_temp.refus(format($q$update public.pregnancy_datings set note = 'x' where pregnancy_id = %L$q$, v_g),
    '42501', 'ajoutez-en une nouvelle');
  perform pg_temp.refus(format($q$delete from public.pregnancy_datings where pregnancy_id = %L$q$, v_g), '42501');
  perform pg_temp.refus(format($q$delete from public.pregnancies where id = %L$q$, v_g), '42501', 'retirez-la');
  perform pg_temp.refus(format($q$update public.pregnancies set patient_id = (select id from public.patients where first_name = 'Moussa' and last_name = 'Diop' limit 1) where id = %L$q$, v_g),
    '42501', 'ne change pas de patiente');
  if exists (select 1 from public.audit_logs
              where table_name in ('pregnancies', 'pregnancy_datings')
                and (new_data ? 'gravidity' or new_data ? 'lmp_date' or new_data ? 'edd'
                     or old_data is not null)) then
    raise exception 'ÉCHEC : valeur clinique dans le journal';
  end if;
  if (select count(*) from public.audit_logs where table_name = 'pregnancy_datings'
        and new_data ->> 'pregnancy_id' = v_g::text) <> 4 then
    raise exception 'ÉCHEC : datations absentes du journal';
  end if;
  raise notice 'OK : datations et grossesses verrouillées, journal sans valeur';
end $$;

-- Registre des tables médicales du journal.
do $$
declare
  v_attendu text[] := array['patient_medical', 'vital_signs', 'visit_reasons',
    'appointment_notes', 'encounters', 'encounter_addenda', 'encounter_handovers', 'diagnoses',
    'encounter_tests', 'prescriptions', 'prescription_items', 'referrals', 'certificates',
    'medical_history', 'surveillance_alerts', 'encounter_followups', 'pregnancies',
    'pregnancy_datings'];
  v_t text;
begin
  foreach v_t in array v_attendu loop
    if not public.audit_table_is_medical(v_t) then
      raise exception 'ÉCHEC : % absente du registre audit_medical_tables', v_t;
    end if;
    if to_regclass('public.' || v_t) is null then
      raise exception 'ÉCHEC : % inscrite au registre mais introuvable', v_t;
    end if;
  end loop;
  if (select count(*) from public.audit_medical_tables) <> 18 then
    raise exception 'ÉCHEC : registre de % tables au lieu de 18',
      (select count(*) from public.audit_medical_tables);
  end if;
  -- Toute table inscrite existe (aucune faute de frappe).
  if exists (select 1 from public.audit_medical_tables
              where to_regclass('public.' || table_name) is null) then
    raise exception 'ÉCHEC : table inscrite introuvable';
  end if;
  if public.audit_table_is_medical('patients') or public.audit_table_is_medical('appointments') then
    raise exception 'ÉCHEC : table d''identité ou d''agenda rangée parmi les tables médicales';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.audit_medical_tables'::regclass) then
    raise exception 'ÉCHEC : RLS non activée sur audit_medical_tables';
  end if;
  if has_table_privilege('authenticated', 'public.audit_medical_tables', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.audit_medical_tables', 'select, insert, update, delete') then
    raise exception 'ÉCHEC : accès direct au registre';
  end if;
  raise notice 'OK : registre audit_medical_tables : les 18 tables, RLS, aucun accès direct';
end $$;

-- Owner qui exerce : lit les lignes des grossesses dans le journal ; owner qui n'exerce
-- pas, non.
set local role authenticated;
select pg_temp.en_tant_que('0a');
do $$
begin
  if not exists (select 1 from public.audit_logs where table_name = 'pregnancies') then
    raise exception 'ÉCHEC : owner qui exerce ne lit pas le journal des grossesses';
  end if;
end $$;
reset role;
update public.memberships set is_clinician = false
 where user_id = '00000000-0000-4000-a15a-00000000000a';
set local role authenticated;
select pg_temp.en_tant_que('0a');
do $$
begin
  if exists (select 1 from public.audit_logs where table_name in ('pregnancies', 'pregnancy_datings')) then
    raise exception 'ÉCHEC : owner qui n''exerce pas lit le journal des grossesses';
  end if;
  raise notice 'OK : journal des grossesses lu par l''owner qui exerce seulement';
end $$;
reset role;
update public.memberships set is_clinician = true
 where user_id = '00000000-0000-4000-a15a-00000000000a';

set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_g   uuid := current_setting('test.grossesse')::uuid;
  v_f   uuid := current_setting('test.awa')::uuid;
  v_org uuid := current_setting('test.org')::uuid;
  v_g2  uuid;
begin
  perform pg_temp.refus(format($q$select public.remove_pregnancy(%L, '  ')$q$, v_g), '22023', 'pourquoi');
  perform public.remove_pregnancy(v_g, 'Ouverte sur le mauvais dossier');
  perform pg_temp.refus(format($q$select public.get_pregnancy(%L)$q$, v_g), '42501');
  if (select count(*) from public.list_ongoing_pregnancies(v_org)) <> 0 then
    raise exception 'ÉCHEC : grossesse retirée encore listée';
  end if;
  perform pg_temp.refus(format($q$select public.remove_pregnancy(%L, 'Encore')$q$, v_g), '22023', 'introuvable');
  -- Nouvelle ouverture possible.
  v_g2 := public.open_pregnancy(v_f, 'clinical', null, current_setting('test.jour')::date, 140, null, 1, 0, 0);
  if (public.get_pregnancy(v_g2) ->> 'ga_days')::integer <> 140 then
    raise exception 'ÉCHEC : estimation clinique';
  end if;
  perform set_config('test.grossesse2', v_g2::text, true);
  raise notice 'OK : retrait motivé (plus listé, plus lisible), nouvelle ouverture par estimation clinique';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 7. Fusion de dossiers
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_f   uuid := current_setting('test.awa')::uuid;
  v_b   uuid;
  v_gb  uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diop', 'Awa', 'F', 24) returning id into v_b;
  perform set_config('request.jwt.claims',
    '{"sub": "00000000-0000-4000-a15a-00000000000b", "role": "authenticated"}', true);
  v_gb := public.open_pregnancy(v_b, 'lmp', current_setting('test.jour')::date - 30, null, null, null, 1, 0, 0);
  perform pg_temp.refus(format($q$update public.patients set merged_into_id = %L, deleted_at = now() where id = %L$q$,
    v_f, v_b), '22023', 'deux dossiers ont une grossesse en cours');
  perform public.remove_pregnancy(v_gb, 'Doublon');
  update public.patients set merged_into_id = v_f, deleted_at = now() where id = v_b;
  if exists (select 1 from public.pregnancies where patient_id = v_b)
     or (select count(*) from public.pregnancies where patient_id = v_f) <> 3 then
    raise exception 'ÉCHEC : grossesses non rattachées au dossier gardé';
  end if;
  raise notice 'OK : fusion : deux grossesses en cours refusées, grossesses rattachées au dossier gardé';
end $$;

rollback;
