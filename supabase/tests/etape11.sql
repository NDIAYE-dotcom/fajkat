-- =============================================================================
-- Tests — étape 11 (Registre des patients)
-- -----------------------------------------------------------------------------
-- Vérifie : numéros de dossier par structure (PS- / CL-), jamais fixés par le front ;
-- âge déclaré et année estimée ; consentement horodaté ; isolement entre structures ;
-- droits par rôle (caissier crée, pharmacien lit, comptable rien) ; patient_medical
-- fermée au caissier, au pharmacien, au laborantin et à l'accueil, jamais lue en direct ;
-- antécédents sensibles (aide-soignant masqué, lecture journalisée, owner avec
-- is_clinician) ; journal sans valeur médicale ; recherche tolérante et paginée ;
-- doublons ; fusion (owner et admin, journalisée, sans suppression) ; couvertures ;
-- import ligne par ligne ; photo dans le bucket privé ; lecture seule ; anonymes.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3 à 11 appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation : A owner du poste, B owner d'une clinique ; chez A : D admin,
-- C infirmier, S aide-soignant, K caissier, P pharmacien, L laborantin, R accueil,
-- M comptable.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a110-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '05', '06', '07', '08', '09', '10']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a110-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a110-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org_a')::uuid, ('00000000-0000-4000-a110-0000000000' || c)::uuid,
       r, true
  from (values ('0d', 'admin'), ('0c', 'infirmier'), ('05', 'aide_soignant'),
               ('06', 'caissier'), ('07', 'pharmacien'), ('08', 'laborantin'),
               ('09', 'accueil'), ('10', 'comptable')) v(c, r);

insert into public.payers (org_id, kind, name, coverage_rate)
values (current_setting('test.org_a')::uuid, 'mutuelle', 'Mutuelle de Kolda', 80);
select set_config('test.payer', (select id::text from public.payers
  where org_id = current_setting('test.org_a')::uuid), true);

-- Utilisateur courant : test.as('0c') — fonction locale à ce script.
create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a110-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.en_tant_que(text) to authenticated;

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Création, numéros de dossier, âge déclaré, consentement
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');  -- caissier

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_annee text := extract(year from now() at time zone 'Africa/Dakar')::text;
  v_id    uuid;
  v_ligne public.patients;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date, phone,
                               phone_owner, neighborhood, mother_first_name, whatsapp_consent)
  values (v_org_a, 'Ndiaye', 'Fátou', 'F', '1994-03-12', '+221771234567', 'patient',
          'Médina', 'Awa', true)
  returning id into v_id;
  perform set_config('test.p1', v_id::text, true);
  select * into v_ligne from public.patients where id = v_id;
  if v_ligne.file_number <> 'PS-' || v_annee || '-000001' then
    raise exception 'ÉCHEC : numéro de dossier inattendu : %', v_ligne.file_number;
  end if;
  if v_ligne.whatsapp_consent_at <> now() then
    raise exception 'ÉCHEC : consentement WhatsApp non horodaté';
  end if;
  raise notice 'OK : le caissier crée un patient ; numéro %, consentement horodaté',
    v_ligne.file_number;

  insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone,
                               phone_owner, neighborhood, mother_first_name)
  values (v_org_a, 'Diop', 'Moussa', 'M', 30, '+221771234567', 'mere', 'Médina', 'Khady')
  returning id into v_id;
  perform set_config('test.p2', v_id::text, true);
  select * into v_ligne from public.patients where id = v_id;
  if v_ligne.file_number <> 'PS-' || v_annee || '-000002'
     or v_ligne.birth_year <> v_annee::integer - 30
     or v_ligne.age_declared_on is null then
    raise exception 'ÉCHEC : âge déclaré ou numéro suivant incorrect';
  end if;
  raise notice 'OK : âge déclaré, année de naissance estimée, numéros qui se suivent';

  begin
    insert into public.patients (org_id, last_name, first_name, sex)
    values (v_org_a, 'Sow', 'Ali', 'M');
    raise exception 'ÉCHEC : patient sans date ni âge accepté';
  exception when check_violation then
    raise notice 'OK : date de naissance ou âge déclaré obligatoire';
  end;

  begin
    insert into public.patients (org_id, file_number, last_name, first_name, sex, declared_age)
    values (v_org_a, 'PS-1999-999999', 'Fall', 'Ibou', 'M', 40);
    raise exception 'ÉCHEC : numéro de dossier fixé par le front';
  exception when insufficient_privilege then
    raise notice 'OK : le numéro de dossier est attribué par le serveur seulement';
  end;

  begin
    update public.patients set merged_into_id = current_setting('test.p1')::uuid
     where id = current_setting('test.p2')::uuid;
    raise exception 'ÉCHEC : fusion écrite en direct';
  exception when insufficient_privilege then
    raise notice 'OK : ni fusion ni suppression en direct';
  end;
end $$;

-- B : sa propre numérotation, rien chez A.
select pg_temp.en_tant_que('0b');
do $$
declare
  v_num text;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org_b')::uuid, 'Ndiaye', 'Fatou', 'F', 31)
  returning file_number into v_num;
  if v_num not like 'CL-____-000001' then
    raise exception 'ÉCHEC : numéro de clinique inattendu : %', v_num;
  end if;
  raise notice 'OK : la clinique a sa propre numérotation (%)', v_num;

  if exists (select 1 from public.patients where org_id = current_setting('test.org_a')::uuid) then
    raise exception 'ÉCHEC : B voit les patients de A';
  end if;
  begin
    perform public.search_patients(current_setting('test.org_a')::uuid, 'ndiaye');
    raise exception 'ÉCHEC : B cherche dans le registre de A';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.patients (org_id, last_name, first_name, sex, declared_age)
    values (current_setting('test.org_a')::uuid, 'Intrus', 'Bob', 'M', 20);
    raise exception 'ÉCHEC : B crée un patient chez A';
  exception when insufficient_privilege then
    raise notice 'OK : isolement entre structures (lecture, recherche, création)';
  end;
end $$;

-- Pharmacien : lit l'identité, ne crée pas. Comptable : rien.
select pg_temp.en_tant_que('07');
do $$
begin
  if (select count(*) from public.patients) <> 2 then
    raise exception 'ÉCHEC : le pharmacien ne lit pas l''identité';
  end if;
  begin
    insert into public.patients (org_id, last_name, first_name, sex, declared_age)
    values (current_setting('test.org_a')::uuid, 'Ba', 'Ami', 'F', 20);
    raise exception 'ÉCHEC : le pharmacien crée un patient';
  exception when insufficient_privilege then
    raise notice 'OK : le pharmacien lit l''identité sans créer de patient';
  end;
end $$;

select pg_temp.en_tant_que('10');
do $$
begin
  if exists (select 1 from public.patients) then
    raise exception 'ÉCHEC : le comptable lit le registre';
  end if;
  raise notice 'OK : le comptable n''a pas accès au registre';
end $$;

-- -----------------------------------------------------------------------------
-- Données médicales
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');  -- infirmier
do $$
declare
  v_p1 uuid := current_setting('test.p1')::uuid;
  v_m  record;
begin
  perform public.save_patient_medical(v_p1, 'O+', 'Pénicilline', 'Suivi PTME', true);
  select * into v_m from public.get_patient_medical(v_p1);
  if v_m.allergies <> 'Pénicilline' or v_m.medical_history <> 'Suivi PTME'
     or not v_m.is_sensitive or v_m.history_hidden then
    raise exception 'ÉCHEC : l''infirmier ne lit pas la fiche médicale complète';
  end if;
  raise notice 'OK : l''infirmier enregistre et lit la fiche médicale';

  begin
    perform 1 from public.patient_medical;
    raise exception 'ÉCHEC : patient_medical lisible en direct';
  exception when insufficient_privilege then
    raise notice 'OK : patient_medical jamais lue en direct, même par un soignant';
  end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.patient_access_logs
      where patient_id = current_setting('test.p1')::uuid
        and user_id = '00000000-0000-4000-a110-00000000000c') <> 1 then
    raise exception 'ÉCHEC : lecture d''antécédents sensibles non journalisée';
  end if;
  if exists (select 1 from public.audit_logs
             where table_name = 'patient_medical'
               and coalesce(new_data::text, '') || coalesce(old_data::text, '')
                   ~* 'pénicilline|ptme') then
    raise exception 'ÉCHEC : valeur médicale recopiée dans audit_logs';
  end if;
  if not exists (select 1 from public.audit_logs where table_name = 'patient_medical') then
    raise exception 'ÉCHEC : modification médicale non journalisée';
  end if;
  raise notice 'OK : lecture sensible journalisée ; audit sans valeur médicale';
end $$;
set local role authenticated;

-- Caissier, pharmacien, laborantin, accueil : jamais la fiche médicale.
do $$
declare
  v_code text;
begin
  foreach v_code in array array['06', '07', '08', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    begin
      perform public.get_patient_medical(current_setting('test.p1')::uuid);
      raise exception 'ÉCHEC : le rôle % lit la fiche médicale', v_code;
    exception when insufficient_privilege then
      null;
    end;
    begin
      perform public.save_patient_medical(current_setting('test.p1')::uuid, 'A+', null, null);
      raise exception 'ÉCHEC : le rôle % écrit la fiche médicale', v_code;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'OK : caissier, pharmacien, laborantin et accueil sans fiche médicale';
end $$;

-- Aide-soignant : lit allergies et groupe, antécédents sensibles masqués.
select pg_temp.en_tant_que('05');
do $$
declare
  v_m record;
begin
  select * into v_m from public.get_patient_medical(current_setting('test.p1')::uuid);
  if v_m.allergies <> 'Pénicilline' or v_m.medical_history is not null
     or not v_m.history_hidden then
    raise exception 'ÉCHEC : antécédents sensibles visibles par l''aide-soignant';
  end if;
  -- Il corrige les allergies sans pouvoir effacer les antécédents ni le drapeau.
  perform public.save_patient_medical(current_setting('test.p1')::uuid, 'O+',
                                      'Pénicilline, arachide', null, false);
  raise notice 'OK : aide-soignant : allergies oui, antécédents sensibles masqués';
end $$;

-- Owner sans l'indicateur soignant : pas de fiche médicale. Avec : oui.
select pg_temp.en_tant_que('0a');
do $$
declare
  v_m record;
begin
  if (select (public.patient_permissions(current_setting('test.org_a')::uuid) ->> 'medical')::boolean) then
    raise exception 'ÉCHEC : owner non soignant avec accès médical';
  end if;
  begin
    perform public.get_patient_medical(current_setting('test.p1')::uuid);
    raise exception 'ÉCHEC : owner non soignant lit la fiche médicale';
  exception when insufficient_privilege then
    raise notice 'OK : owner sans l''indicateur soignant : pas de fiche médicale';
  end;

  begin
    perform public.set_member_clinician(
      (select id from public.memberships where user_id = '00000000-0000-4000-a110-000000000006'),
      true);
    raise exception 'ÉCHEC : indicateur soignant activé pour un caissier';
  exception when invalid_parameter_value then
    null;
  end;

  perform public.set_member_clinician(
    (select id from public.memberships where user_id = auth.uid()
       and org_id = current_setting('test.org_a')::uuid), true);
  select * into v_m from public.get_patient_medical(current_setting('test.p1')::uuid);
  if v_m.medical_history <> 'Suivi PTME' or v_m.allergies <> 'Pénicilline, arachide'
     or not v_m.is_sensitive then
    raise exception 'ÉCHEC : l''owner soignant ne lit pas la fiche, ou l''aide-soignant l''a altérée';
  end if;
  raise notice 'OK : owner avec l''indicateur soignant : fiche complète';
end $$;

select pg_temp.en_tant_que('0d');
do $$
begin
  begin
    perform public.set_member_clinician(
      (select id from public.memberships where user_id = auth.uid()), true);
    raise exception 'ÉCHEC : un admin active lui-même l''indicateur soignant';
  exception when insufficient_privilege then
    raise notice 'OK : seul l''owner active l''indicateur soignant';
  end;
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.audit_logs
                 where table_name = 'memberships'
                   and (new_data ->> 'is_clinician')::boolean
                   and user_id = '00000000-0000-4000-a110-00000000000a') then
    raise exception 'ÉCHEC : activation de l''indicateur soignant non journalisée';
  end if;
  raise notice 'OK : activation de l''indicateur soignant journalisée';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Recherche
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');  -- accueil
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_r   record;
begin
  -- Quelques homonymes pour la pagination.
  insert into public.patients (org_id, last_name, first_name, sex, declared_age, neighborhood)
  select v_org, 'Ndiaye', 'Mariama ' || i, 'F', 20 + i, 'Sikilo' from generate_series(1, 3) i;

  if (select count(*) from public.search_patients(v_org, 'fatou ndiaye')) <> 1
     or (select first_name from public.search_patients(v_org, 'NDIAYE fatou')) <> 'Fátou' then
    raise exception 'ÉCHEC : recherche sans accents, nom et prénom inversés';
  end if;
  if (select count(*) from public.search_patients(v_org, 'ndiay')) <> 4 then
    raise exception 'ÉCHEC : recherche partielle';
  end if;
  if not exists (select 1 from public.search_patients(v_org, 'ndiayee fatou')) then
    raise exception 'ÉCHEC : faute de frappe non tolérée';
  end if;
  raise notice 'OK : recherche sans accents, mots inversés, partielle, faute tolérée';

  if (select count(*) from public.search_patients(v_org, '1234')) <> 2
     or (select count(*) from public.search_patients(v_org, '77 123 45')) <> 2 then
    raise exception 'ÉCHEC : recherche par téléphone partiel';
  end if;
  if (select last_name from public.search_patients(v_org, '000002')) <> 'Diop'
     or (select last_name from public.search_patients(v_org,
           (select file_number from public.patients where id = current_setting('test.p2')::uuid)))
        <> 'Diop' then
    raise exception 'ÉCHEC : recherche par numéro de dossier';
  end if;
  if (select count(*) from public.search_patients(v_org, 'diop medina khady')) <> 1 then
    raise exception 'ÉCHEC : recherche par nom, quartier et prénom de la mère';
  end if;
  raise notice 'OK : téléphone partiel, numéro de dossier, quartier et prénom de la mère';

  select * into v_r from public.search_patients(v_org, 'ndiaye', 2, 2) limit 1;
  if (select count(*) from public.search_patients(v_org, 'ndiaye', 2, 2)) <> 2
     or v_r.total_count <> 4 then
    raise exception 'ÉCHEC : pagination côté serveur';
  end if;
  if (select count(*) from public.search_patients(v_org, '')) <> 5 then
    raise exception 'ÉCHEC : liste par défaut';
  end if;
  raise notice 'OK : pagination côté serveur, total renvoyé';
end $$;

-- -----------------------------------------------------------------------------
-- Doublons
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
begin
  if (select reason from public.find_duplicate_candidates(v_org, 'Ndiaye', 'Fatou',
        '+221 77 123 45 67') limit 1) <> 'meme_telephone' then
    raise exception 'ÉCHEC : même téléphone et nom proche non signalés';
  end if;
  -- Numéro partagé par la famille : un autre nom n'est pas un doublon.
  if exists (select 1 from public.find_duplicate_candidates(v_org, 'Ndiaye', 'Ibrahima',
               '+221771234567')) then
    raise exception 'ÉCHEC : un membre de la famille signalé comme doublon';
  end if;
  if (select reason from public.find_duplicate_candidates(v_org, 'Diop', 'Mousa', null, 'Khadi')
      limit 1) <> 'meme_mere' then
    raise exception 'ÉCHEC : même nom et même mère non signalés';
  end if;
  raise notice 'OK : doublons proposés (même téléphone + nom, même nom + mère), famille épargnée';
end $$;

-- -----------------------------------------------------------------------------
-- Couvertures
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');  -- caissier
do $$
begin
  insert into public.patient_coverages (org_id, patient_id, scheme, payer_id, member_number)
  values (current_setting('test.org_a')::uuid, current_setting('test.p2')::uuid, 'mutuelle',
          current_setting('test.payer')::uuid, 'MK-0042');
  if (select coverage_rate from public.patient_coverages
      where patient_id = current_setting('test.p2')::uuid) <> 80 then
    raise exception 'ÉCHEC : taux du tiers payant non repris';
  end if;
  begin
    insert into public.patient_coverages (org_id, patient_id, scheme, payer_id)
    values (current_setting('test.org_a')::uuid, current_setting('test.p2')::uuid, 'ipm',
            current_setting('test.payer')::uuid);
    raise exception 'ÉCHEC : tiers payant d''un autre régime accepté';
  exception when invalid_parameter_value then
    raise notice 'OK : couverture enregistrée par le caissier, taux repris, régime vérifié';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Fusion
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_id uuid;
begin
  -- Doublon de Moussa Diop, avec une fiche médicale et sa couverture ailleurs.
  insert into public.patients (org_id, last_name, first_name, sex, declared_age,
                               mother_first_name, occupation)
  values (current_setting('test.org_a')::uuid, 'Diop', 'Mousa', 'M', 31, 'Khady', 'Maçon')
  returning id into v_id;
  perform set_config('test.p3', v_id::text, true);
end $$;

select pg_temp.en_tant_que('0c');
do $$
begin
  perform public.save_patient_medical(current_setting('test.p3')::uuid, 'B+', 'Aspirine', null);
  begin
    perform public.merge_patients(current_setting('test.p2')::uuid,
                                  current_setting('test.p3')::uuid);
    raise exception 'ÉCHEC : un infirmier fusionne des dossiers';
  exception when insufficient_privilege then
    raise notice 'OK : la fusion est réservée à owner et admin';
  end;
end $$;

select pg_temp.en_tant_que('0d');  -- admin
do $$
declare
  v_garde public.patients;
begin
  v_garde := public.merge_patients(current_setting('test.p2')::uuid,
                                   current_setting('test.p3')::uuid, 'Même personne');
  if v_garde.occupation <> 'Maçon' then
    raise exception 'ÉCHEC : champs vides non complétés par le doublon';
  end if;
  if not exists (select 1 from public.patients
                 where id = current_setting('test.p3')::uuid
                   and merged_into_id = v_garde.id and deleted_at is not null) then
    raise exception 'ÉCHEC : doublon non marqué fusionné';
  end if;
  if exists (select 1 from public.search_patients(current_setting('test.org_a')::uuid, 'mousa'))
     and (select count(*) from public.search_patients(current_setting('test.org_a')::uuid, 'diop')) <> 1 then
    raise exception 'ÉCHEC : doublon fusionné encore dans la recherche';
  end if;
  begin
    perform public.merge_patients(current_setting('test.p2')::uuid,
                                  current_setting('test.p3')::uuid);
    raise exception 'ÉCHEC : fusion répétée acceptée';
  exception when invalid_parameter_value then
    null;
  end;
  if not exists (select 1 from public.patient_merges
                 where kept_patient_id = v_garde.id
                   and merged_patient_id = current_setting('test.p3')::uuid
                   and merged_snapshot ->> 'occupation' = 'Maçon') then
    raise exception 'ÉCHEC : fusion non journalisée';
  end if;
  raise notice 'OK : fusion par l''admin, doublon conservé et marqué, journalisée';
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.patients where id = current_setting('test.p3')::uuid) then
    raise exception 'ÉCHEC : doublon supprimé physiquement';
  end if;
  if (select count(*) from public.patient_medical
      where patient_id = current_setting('test.p2')::uuid and deleted_at is null) <> 1
     or (select allergies from public.patient_medical
         where patient_id = current_setting('test.p2')::uuid and deleted_at is null) <> 'Aspirine'
     or not exists (select 1 from public.audit_logs
                    where table_name = 'patient_merges') then
    raise exception 'ÉCHEC : fiche médicale non rattachée, ou fusion absente du journal';
  end if;
  raise notice 'OK : aucune suppression physique, fiche médicale rattachée, audit';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Import
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
begin
  perform public.import_patients(current_setting('test.org_a')::uuid, '[]'::jsonb);
  raise exception 'ÉCHEC : l''accueil importe un registre';
exception when insufficient_privilege then
  raise notice 'OK : import réservé à owner et admin';
end $$;

select pg_temp.en_tant_que('0d');
do $$
declare
  v_r record;
  v_ok integer := 0;
  v_err text[] := '{}';
begin
  for v_r in select * from public.import_patients(current_setting('test.org_a')::uuid, '[
      {"line": 2, "last_name": "Sarr", "first_name": "Coumba", "sex": "f",
       "birth_date": "05/10/1988", "legacy_file_number": "REG-1988-12"},
      {"line": 3, "last_name": "Sarr", "first_name": "Modou", "declared_age": "40"},
      {"line": 4, "last_name": "Sarr", "first_name": "Aïda", "sex": "F", "birth_date": "31/02/2001"},
      {"line": 5, "last_name": "Sarr", "first_name": "Bineta", "sex": "F", "declared_age": "dix"}
    ]'::jsonb)
  loop
    if v_r.error is null then
      v_ok := v_ok + 1;
    else
      v_err := v_err || (v_r.line || ' ' || v_r.error);
    end if;
  end loop;
  if v_ok <> 1 or cardinality(v_err) <> 3
     or v_err[1] <> '3 Sexe à indiquer : F ou M.'
     or v_err[2] not like '4 Date de naissance illisible%'
     or v_err[3] not like '5 Âge déclaré illisible%' then
    raise exception 'ÉCHEC : rapport d''import inattendu : %', v_err;
  end if;
  if (select birth_date from public.patients where legacy_file_number = 'REG-1988-12')
     <> date '1988-10-05' then
    raise exception 'ÉCHEC : date JJ/MM/AAAA mal lue';
  end if;
  if not exists (select 1 from public.search_patients(current_setting('test.org_a')::uuid,
                                                       'REG-1988-12')) then
    raise exception 'ÉCHEC : ancien numéro non cherchable';
  end if;
  raise notice 'OK : import ligne par ligne, erreurs en français, ancien numéro cherchable';
end $$;

-- -----------------------------------------------------------------------------
-- Photo (bucket privé)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
declare
  v_chemin text := current_setting('test.org_a') || '/' || current_setting('test.p1')
                   || '/photo-1.webp';
begin
  insert into storage.objects (bucket_id, name) values ('patients', v_chemin);
  update public.patients set photo_path = v_chemin where id = current_setting('test.p1')::uuid;
  begin
    insert into storage.objects (bucket_id, name)
    values ('patients', current_setting('test.org_a') || '/' || gen_random_uuid() || '/x.webp');
    raise exception 'ÉCHEC : photo déposée pour un patient inexistant';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK : photo déposée dans le dossier du patient';
end $$;

select pg_temp.en_tant_que('0b');
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'patients') then
    raise exception 'ÉCHEC : B voit les photos de A';
  end if;
  raise notice 'OK : photos invisibles pour une autre structure';
end $$;

-- -----------------------------------------------------------------------------
-- Lecture seule, anonymes
-- -----------------------------------------------------------------------------
reset role;
update public.organizations set status = 'read_only' where id = current_setting('test.org_a')::uuid;
set local role authenticated;

select pg_temp.en_tant_que('09');
do $$
begin
  if (select count(*) from public.search_patients(current_setting('test.org_a')::uuid, 'ndiaye')) = 0 then
    raise exception 'ÉCHEC : registre illisible en lecture seule';
  end if;
  begin
    insert into public.patients (org_id, last_name, first_name, sex, declared_age)
    values (current_setting('test.org_a')::uuid, 'Faye', 'Rama', 'F', 25);
    raise exception 'ÉCHEC : patient créé en lecture seule';
  exception when insufficient_privilege then
    raise notice 'OK : lecture seule : registre lisible, aucune création';
  end;
end $$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.patients;
  raise exception 'ÉCHEC : patients lisibles sans connexion';
exception when insufficient_privilege then
  raise notice 'OK : registre fermé aux anonymes';
end $$;

reset role;

rollback;
