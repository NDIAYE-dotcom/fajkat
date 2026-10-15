-- =============================================================================
-- Tests — étape 11f (Qualité du registre)
-- -----------------------------------------------------------------------------
-- Vérifie : clé de prononciation (Mamadou / Momodou / Mamadu, Fatou / Fatu, Ndèye / Ndeye,
-- Moussa / Musa, Aïssatou / Aissatou / Aïssatu, N'diaye / Ndiaye, M'Baye / Mbaye,
-- Mame-Diarra / Mame Diarra, Thiam / Tiam, Khady / Kady, Sheikh / Cheikh, Bah / Ba) ;
-- contre-exemples Fatou / Fanta et Ndiaye / Ndoye ; doublons de la création rapide et
-- d'un import ; recherche ; suggestions de quartier (fréquence, fautes de frappe,
-- structures isolées) ; fusion refusée à l'accueil, journalisée pour l'owner ; numéro
-- d'un dossier fusionné qui mène au dossier gardé.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11f.sql
-- Prérequis : migrations des étapes 3 à 11f appliquées.
-- =============================================================================

begin;

-- A owner du poste, R accueil ; B owner d'une autre structure.
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a11f-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11f-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '09']) c;

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a11f-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.en_tant_que('0b');
select set_config('test.org_b',
  public.create_organization('Poste de B', 'poste_sante', 'SN', 'Ziguinchor')::text, true);
select pg_temp.en_tant_que('0a');
select set_config('test.org',
  public.create_organization('Poste de santé 11f', 'poste_sante', 'SN', 'Dakar')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org')::uuid, '00000000-0000-4000-a11f-000000000009', 'accueil', true);

-- -----------------------------------------------------------------------------
-- Clé de prononciation
-- -----------------------------------------------------------------------------
do $$
declare
  v_groupe text[];
  v_groupes text[][] := array[
    array['Mamadou', 'Momodou', 'Mamadu'],
    array['Fatou', 'Fatu', 'Fatou'],
    array['Ndèye', 'Ndeye', 'NDEYE'],
    array['Moussa', 'Musa', 'Mousa'],
    array['Aïssatou', 'Aissatou', 'Aïssatu'],
    array['N''diaye', 'Ndiaye', 'N’Diaye'],
    array['M''Baye', 'Mbaye', 'MBAYE'],
    array['Mame-Diarra', 'Mame Diarra', 'Mame  Diarra'],
    array['Thiam', 'Tiam', 'THIAM'],
    array['Khady', 'Kady', 'Xadi'],
    array['Sheikh', 'Cheikh', 'Cheikh'],
    array['Bah', 'Ba', 'BA']];
begin
  foreach v_groupe slice 1 in array v_groupes loop
    if public.patient_phonetic(v_groupe[1]) <> public.patient_phonetic(v_groupe[2])
       or public.patient_phonetic(v_groupe[1]) <> public.patient_phonetic(v_groupe[3]) then
      raise exception 'ÉCHEC : % ne se prononcent pas pareil', v_groupe;
    end if;
  end loop;
  if public.patient_phonetic('Fatou') = public.patient_phonetic('Fanta')
     or public.patient_phonetic('Ndiaye') = public.patient_phonetic('Ndoye') then
    raise exception 'ÉCHEC : Fatou / Fanta ou Ndiaye / Ndoye confondus';
  end if;
  raise notice 'OK : variantes d''orthographe rapprochées, Fatou / Fanta et Ndiaye / Ndoye distincts';
end $$;

-- -----------------------------------------------------------------------------
-- Dossiers de départ (owner)
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.en_tant_que('0a');
insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone,
                             phone_owner, neighborhood, mother_first_name)
select current_setting('test.org')::uuid, v.nom, v.prenom, v.sexe, v.age, v.tel,
       case when v.tel is not null then 'mere' end, v.quartier, v.mere
  from (values
    ('Diallo', 'Mamadou', 'M', 40, null, 'Grand Yoff', null),
    ('Ndiaye', 'Fatou', 'F', 30, '+221771110000', 'Grand Yoff', 'Awa'),
    ('Sow', 'Aïssatou', 'F', 25, null, 'grand yoff', null),
    ('Mbaye', 'Mame-Diarra', 'F', 35, null, 'Médina', null),
    ('Bah', 'Khady', 'F', 50, null, 'Médina', null),
    ('Thiam', 'Cheikh', 'M', 45, null, 'Granf Yoff', 'Ndèye'),
    ('Fall', 'Moussa', 'M', 20, null, 'Grand Yoff', null)
  ) v(nom, prenom, sexe, age, tel, quartier, mere);

-- -----------------------------------------------------------------------------
-- Doublons : création rapide et import
-- -----------------------------------------------------------------------------
do $$
declare
  v_org   uuid := current_setting('test.org')::uuid;
  v_annee integer := extract(year from now() at time zone 'Africa/Dakar')::integer;
  v_r     record;
begin
  select * into v_r from public.find_duplicate_candidates(v_org, 'Diallo', 'Momodou',
    null, null, v_annee - 40) limit 1;
  if v_r.reason is distinct from 'meme_nom_age' or v_r.first_name <> 'Mamadou' then
    raise exception 'ÉCHEC : Momodou Diallo (même âge) non rapproché de Mamadou : %', v_r.reason;
  end if;
  -- Nom et prénom intervertis, autre orthographe.
  if not exists (select 1 from public.find_duplicate_candidates(v_org, 'Mamadu', 'Dialo',
                   null, null, v_annee - 41)) then
    raise exception 'ÉCHEC : Mamadu / Dialo intervertis non rapprochés';
  end if;
  if (select reason from public.find_duplicate_candidates(v_org, 'N''diaye', 'Fatu',
        '+221771110000') limit 1) is distinct from 'meme_telephone' then
    raise exception 'ÉCHEC : N''diaye Fatu (même téléphone) non rapprochée';
  end if;
  if (select reason from public.find_duplicate_candidates(v_org, 'Tiam', 'Sheikh', null,
        'Ndeye') limit 1) is distinct from 'meme_mere' then
    raise exception 'ÉCHEC : Tiam Sheikh (même mère) non rapproché';
  end if;
  if not exists (select 1 from public.find_duplicate_candidates(v_org, 'Ba', 'Kady',
                   null, null, v_annee - 50))
     or not exists (select 1 from public.find_duplicate_candidates(v_org, 'M''Baye',
                      'Mame Diarra', null, null, v_annee - 35))
     or not exists (select 1 from public.find_duplicate_candidates(v_org, 'Sow', 'Aissatu',
                      null, null, v_annee - 25))
     or not exists (select 1 from public.find_duplicate_candidates(v_org, 'Fall', 'Musa',
                      null, null, v_annee - 20)) then
    raise exception 'ÉCHEC : Ba Kady, M''Baye Mame Diarra, Sow Aissatu ou Fall Musa non rapprochés';
  end if;
  raise notice 'OK : création rapide : variantes rapprochées (âge, téléphone, mère, intervertis)';

  -- Contre-exemple : Fanta, sœur de Fatou, même téléphone, même mère, même âge.
  if exists (select 1 from public.find_duplicate_candidates(v_org, 'Ndiaye', 'Fanta',
               '+221771110000', 'Awa', v_annee - 30)) then
    raise exception 'ÉCHEC : Fanta Ndiaye annoncée comme doublon de Fatou Ndiaye';
  end if;
  -- Même prononciation, mais rien d'autre en commun : aucune alerte (homonymes fréquents).
  if exists (select 1 from public.find_duplicate_candidates(v_org, 'Diallo', 'Momodou',
               null, null, v_annee - 70)) then
    raise exception 'ÉCHEC : homonyme d''un autre âge annoncé comme doublon';
  end if;
  raise notice 'OK : Fatou / Fanta (même famille) et homonyme d''un autre âge non signalés';

  select * into v_r from public.find_import_duplicates(v_org, jsonb_build_array(
      jsonb_build_object('line', 4, 'last_name', 'Dialo', 'first_name', 'Momodou',
                         'birth_year', v_annee - 40)));
  if v_r.line is distinct from 4 or v_r.reason is distinct from 'meme_nom_age' then
    raise exception 'ÉCHEC : import : Momodou Dialo non rapproché';
  end if;
  raise notice 'OK : import et registre papier : variantes rapprochées';
end $$;

-- -----------------------------------------------------------------------------
-- Recherche
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  if (select first_name from public.search_patients(v_org, 'momodou') limit 1)
       is distinct from 'Mamadou'
     or (select last_name from public.search_patients(v_org, 'aissatu') limit 1)
       is distinct from 'Sow'
     or (select last_name from public.search_patients(v_org, 'mamediarra') limit 1)
       is distinct from 'Mbaye'
     or (select last_name from public.search_patients(v_org, 'tiam sheikh') limit 1)
       is distinct from 'Thiam'
     or (select last_name from public.search_patients(v_org, 'kady ba') limit 1)
       is distinct from 'Bah' then
    raise exception 'ÉCHEC : recherche par une autre orthographe';
  end if;
  if exists (select 1 from public.search_patients(v_org, 'fanta')) then
    raise exception 'ÉCHEC : « fanta » trouve Fatou';
  end if;
  raise notice 'OK : recherche : Momodou, Aissatu, Mamediarra, Tiam Sheikh, Kady Ba ; pas Fanta';
end $$;

-- -----------------------------------------------------------------------------
-- Suggestions de quartier
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_r   record;
begin
  select * into v_r from public.suggest_neighborhoods(v_org, '') limit 1;
  if v_r.neighborhood is distinct from 'Grand Yoff' or v_r.patient_count <> 4 then
    raise exception 'ÉCHEC : quartier le plus fréquent : % (%)', v_r.neighborhood, v_r.patient_count;
  end if;
  if (select neighborhood from public.suggest_neighborhoods(v_org, 'gr') limit 1)
       is distinct from 'Grand Yoff'
     or (select neighborhood from public.suggest_neighborhoods(v_org, 'yo') limit 1)
       is distinct from 'Grand Yoff'
     or (select neighborhood from public.suggest_neighborhoods(v_org, 'medi') limit 1)
       is distinct from 'Médina' then
    raise exception 'ÉCHEC : suggestions par début de mot';
  end if;
  if not exists (select 1 from public.suggest_neighborhoods(v_org, 'Grnd Yof')
                  where neighborhood = 'Grand Yoff') then
    raise exception 'ÉCHEC : faute de frappe non tolérée';
  end if;
  if exists (select 1 from public.suggest_neighborhoods(v_org, 'Pikine')) then
    raise exception 'ÉCHEC : quartier jamais saisi proposé';
  end if;
  raise notice 'OK : quartiers : les plus fréquents d''abord, variantes regroupées, fautes tolérées';
end $$;

select pg_temp.en_tant_que('0b');
do $$
begin
  if exists (select 1 from public.suggest_neighborhoods(current_setting('test.org_b')::uuid, '')) then
    raise exception 'ÉCHEC : quartiers d''une autre structure proposés';
  end if;
  begin
    perform public.suggest_neighborhoods(current_setting('test.org')::uuid, 'gr');
    raise exception 'ÉCHEC : quartiers lus depuis une autre structure';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : quartiers propres à chaque structure';
end $$;

-- -----------------------------------------------------------------------------
-- Fusion
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
select set_config('test.doublon', (public.import_patients(current_setting('test.org')::uuid,
  '[{"line": 2, "last_name": "Dialo", "first_name": "Momodou", "sex": "M", "declared_age": 40,
     "neighborhood": "Grand Yoff"}]'::jsonb)).patient_id::text, true);
select set_config('test.garde', (select id::text from public.patients
  where first_name = 'Mamadou' and org_id = current_setting('test.org')::uuid), true);

select pg_temp.en_tant_que('09');
do $$
begin
  perform public.merge_patients(current_setting('test.garde')::uuid,
                                current_setting('test.doublon')::uuid);
  raise exception 'ÉCHEC : l''accueil fusionne deux dossiers';
exception when insufficient_privilege then
  raise notice 'OK : fusion refusée à l''accueil';
end $$;

select pg_temp.en_tant_que('0a');
do $$
declare
  v_garde uuid := current_setting('test.garde')::uuid;
  v_doublon uuid := current_setting('test.doublon')::uuid;
begin
  perform public.merge_patients(v_garde, v_doublon, 'Même personne, autre orthographe');
  if (select merged_into_id from public.patients where id = v_doublon) is distinct from v_garde
     or not exists (select 1 from public.patient_merges
                     where kept_patient_id = v_garde and merged_patient_id = v_doublon) then
    raise exception 'ÉCHEC : fusion non journalisée ou dossier fusionné sans renvoi';
  end if;
  if exists (select 1 from public.search_patients(current_setting('test.org')::uuid, 'dialo momodou')
              where id = v_doublon) then
    raise exception 'ÉCHEC : dossier fusionné encore dans la recherche';
  end if;
  raise notice 'OK : fusion journalisée, le dossier fusionné renvoie vers celui qu''on garde';
end $$;

-- Numéro d'un dossier fusionné (carte ou papier ancien) : mène au dossier gardé.
do $$
declare
  v_org     uuid := current_setting('test.org')::uuid;
  v_garde   uuid := current_setting('test.garde')::uuid;
  v_ancien  text := (select file_number from public.patients
                      where id = current_setting('test.doublon')::uuid);
  v_r       record;
begin
  select * into v_r from public.search_patients(v_org, v_ancien) limit 1;
  if v_r.id is distinct from v_garde or v_r.merged_file_numbers is distinct from v_ancien then
    raise exception 'ÉCHEC : n° complet d''un dossier fusionné : %', v_r;
  end if;
  select * into v_r from public.search_patients(v_org, right(v_ancien, 6)) limit 1;
  if v_r.id is distinct from v_garde or v_r.merged_file_numbers is distinct from v_ancien then
    raise exception 'ÉCHEC : chiffres d''un dossier fusionné (%)', right(v_ancien, 6);
  end if;
  if exists (select 1 from public.search_patients(v_org, 'Diallo') where merged_file_numbers is not null) then
    raise exception 'ÉCHEC : mention de fusion hors d''une recherche par numéro';
  end if;
  if (select reason from public.patient_merges where kept_patient_id = v_garde)
       is distinct from 'Même personne, autre orthographe' then
    raise exception 'ÉCHEC : fusion absente du journal du dossier gardé';
  end if;
  raise notice 'OK : n° d''un dossier fusionné (complet ou en partie) -> dossier gardé, avec mention';
end $$;

select pg_temp.en_tant_que('09');
do $$
begin
  if exists (select 1 from public.patient_merges) then
    raise exception 'ÉCHEC : l''accueil lit le journal des fusions';
  end if;
  raise notice 'OK : journal des fusions fermé à l''accueil';
end $$;

reset role;

rollback;
