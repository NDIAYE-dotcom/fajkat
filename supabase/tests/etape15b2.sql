-- =============================================================================
-- Tests — étape 15, partie B2 : bilan des CPN corrigé, soins, Td, examens
-- -----------------------------------------------------------------------------
-- Vérifie : anc_status_compute sur les cas communs (test.cas ci-dessous, lus aussi par
-- e2e/maternite-bilan.spec.js), datation corrigée comprise ; soins recopiés de la CPN
-- (règles d'âge gestationnel, d'intervalle et de nombre lues dans la table), TPI bloqué
-- par « sous cotrimoxazole » (CPN rendue sensible), statut du TPI identique à celui d'une
-- femme sans SP partout ailleurs et pour l'aide-soignant ; soins faits ailleurs sans
-- doublon ; Td fait ici ou d'après le carnet (date approximative ramenée au premier jour
-- possible), rang suivant, délai minimal, annulation motivée ; examens de la grossesse
-- (consultation et laboratoire extérieur) réservés aux habilités, lecture sensible
-- journalisée ; accueil, caissier, owner qui n'exerce pas refusés ; aucune lecture directe ;
-- fusion de dossiers ; registre audit_medical_tables.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape15b2.sql, ou
-- tel quel dans le SQL Editor (aucune commande psql, aucun fichier lu).
-- =============================================================================

begin;

-- Cas communs du bilan des CPN (modèle « 4 CPN », âges gestationnels en jours d'après la
-- datation retenue). e2e/maternite-bilan.spec.js lit ce même texte, entre les deux balises.
select set_config('test.cas', $cas_communs$
{
  "contacts": [
    {
      "contact_number": 1,
      "target_ga_days": 84,
      "window_start_days": 0,
      "window_end_days": 118
    },
    {
      "contact_number": 2,
      "target_ga_days": 182,
      "window_start_days": 119,
      "window_end_days": 202
    },
    {
      "contact_number": 3,
      "target_ga_days": 224,
      "window_start_days": 203,
      "window_end_days": 244
    },
    {
      "contact_number": 4,
      "target_ga_days": 252,
      "window_start_days": 245,
      "window_end_days": 272
    }
  ],
  "cas": [
    {
      "nom": "TEST Agenda 2 : CPN à 15 et 16 SA, aujourd'hui 16 SA",
      "visites": [
        105,
        112
      ],
      "jour": 112,
      "attendu": {
        "covered": [
          1
        ],
        "missed": 0,
        "expected": 0,
        "next_contact": 2,
        "anc_number": 3
      }
    },
    {
      "nom": "TEST Agenda 2 après la fin de la fenêtre 1 (17 SA 6 j)",
      "visites": [
        105,
        112
      ],
      "jour": 125,
      "attendu": {
        "covered": [
          1
        ],
        "missed": 0,
        "expected": 1,
        "next_contact": 2,
        "anc_number": 3
      }
    },
    {
      "nom": "CPN pile sur les limites : 16 SA 6 j puis 17 SA 0 j",
      "visites": [
        118,
        119
      ],
      "jour": 120,
      "attendu": {
        "covered": [
          1,
          2
        ],
        "missed": 0,
        "expected": 1,
        "next_contact": 3,
        "anc_number": 3
      }
    },
    {
      "nom": "1re CPN tardive à 20 SA : contact 1 manqué",
      "visites": [
        140
      ],
      "jour": 140,
      "attendu": {
        "covered": [
          2
        ],
        "missed": 1,
        "expected": 1,
        "next_contact": 3,
        "anc_number": 2
      }
    },
    {
      "nom": "CPN après la dernière fenêtre (40 SA) : comptée, ne couvre rien",
      "visites": [
        280
      ],
      "jour": 285,
      "attendu": {
        "covered": [],
        "missed": 4,
        "expected": 4,
        "next_contact": null,
        "anc_number": null
      }
    },
    {
      "nom": "Aucune CPN à 30 SA",
      "visites": [],
      "jour": 210,
      "attendu": {
        "covered": [],
        "missed": 2,
        "expected": 2,
        "next_contact": 3,
        "anc_number": 1
      }
    }
  ],
  "datation": {
    "nom": "Datation corrigée (DDR 7 jours plus tôt) : la CPN passe du contact 1 au contact 2",
    "visite": 115,
    "jour": 115,
    "decalage": 7,
    "avant": {
      "covered": [
        1
      ],
      "missed": 0,
      "expected": 0,
      "next_contact": 2,
      "anc_number": 2
    },
    "apres": {
      "covered": [
        2
      ],
      "missed": 1,
      "expected": 1,
      "next_contact": 3,
      "anc_number": 2
    }
  }
}
$cas_communs$, true);

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a15c-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e15c-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e', '09', '0f']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15c-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé de Sédhiou', 'poste_sante', 'SN', 'Sédhiou')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b sage-femme, 0c infirmier, 0d aide-soignant, 0e caissier,
-- 09 accueil, 0f admin qui exerce.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a15c-0000000000' || c)::uuid, r, true,
       c = '0f'
  from (values ('0b', 'sage_femme'), ('0c', 'infirmier'), ('0d', 'aide_soignant'),
               ('0e', 'caissier'), ('09', 'accueil'), ('0f', 'admin')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a15c-0000000000' || p_code,
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
create function pg_temp.type_cs(p_code text) returns uuid language sql security definer as $$
  select id from public.encounter_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.soin(p_code text) returns uuid language sql security definer as $$
  select id from public.maternal_intervention_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.examen(p_code text) returns uuid language sql security definer as $$
  select id from public.rapid_test_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
-- Patiente avec une grossesse ouverte (DDR il y a p_ga jours), par la sage-femme.
create function pg_temp.patiente(p_nom text, p_ga integer) returns uuid
language plpgsql security definer as $$
declare
  v_p uuid;
begin
  perform pg_temp.en_tant_que('0b');
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'B2', p_nom, 'F', 25) returning id into v_p;
  return public.open_pregnancy(v_p, 'lmp', public.org_local_date(current_setting('test.org')::uuid) - p_ga,
                               null, null, null, 1, 0, 0);
end;
$$;
create function pg_temp.grossesse(p_id uuid) returns public.pregnancies language sql security definer as $$
  select * from public.pregnancies where id = p_id;
$$;
create function pg_temp.bilan(p_g uuid) returns jsonb language sql security definer as $$
  select public.anc_status_compute(p_g);
$$;
-- Résumé d'un bilan, dans la forme des cas communs.
create function pg_temp.resume(b jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'covered', coalesce((select jsonb_agg((c ->> 'contact_number')::integer order by (c ->> 'contact_number')::integer)
                           from jsonb_array_elements(b -> 'contacts') c where c ->> 'state' = 'covered'), '[]'::jsonb),
    'missed', b -> 'missed', 'expected', b -> 'expected',
    'next_contact', coalesce(b -> 'next' -> 'contact_number', 'null'::jsonb),
    'anc_number', coalesce(b -> 'next' -> 'anc_number', 'null'::jsonb));
$$;
-- CPN validée par la sage-femme avec un brouillon donné ; renvoie la consultation.
create function pg_temp.cpn(p_patient uuid, p_draft jsonb) returns uuid language plpgsql as $$
declare
  v     jsonb;
  v_ver integer;
begin
  perform pg_temp.en_tant_que('0b');
  v := public.start_encounter(p_patient, null, pg_temp.type_cs('cpn'));
  v_ver := (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
             jsonb_build_object('reason', 'CPN') || p_draft) ->> 'version')::integer;
  perform public.validate_encounter((v ->> 'id')::uuid, v_ver);
  return (v ->> 'id')::uuid;
end;
$$;
-- Même chose, refus attendu ; le brouillon reste ouvert (renvoyé pour être abandonné).
create function pg_temp.cpn_refusee(p_patient uuid, p_draft jsonb, p_extrait text) returns void
language plpgsql as $$
declare
  v     jsonb;
  v_ver integer;
begin
  perform pg_temp.en_tant_que('0b');
  v := public.start_encounter(p_patient, null, pg_temp.type_cs('cpn'));
  v_ver := (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
             jsonb_build_object('reason', 'CPN') || p_draft) ->> 'version')::integer;
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', v ->> 'id', v_ver),
                        '22023', p_extrait);
  perform public.discard_encounter_draft((v ->> 'id')::uuid, v_ver);
end;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text),
  pg_temp.type_cs(text), pg_temp.soin(text), pg_temp.examen(text), pg_temp.patiente(text, integer),
  pg_temp.grossesse(uuid), pg_temp.bilan(uuid), pg_temp.resume(jsonb),
  pg_temp.cpn(uuid, jsonb), pg_temp.cpn_refusee(uuid, jsonb, text) to authenticated;

select set_config('test.jour', public.org_local_date(current_setting('test.org')::uuid)::text, false);

-- -----------------------------------------------------------------------------
-- 1. Bilan des CPN : cas communs avec la copie JS
-- -----------------------------------------------------------------------------
do $$
begin
  -- Les contacts du fichier sont ceux du modèle « 4 CPN » de la base.
  if (select jsonb_agg(jsonb_build_object('contact_number', contact_number,
                                          'target_ga_days', target_ga_days,
                                          'window_start_days', window_start_days,
                                          'window_end_days', window_end_days) order by contact_number)
        from public.anc_schedule_contacts where model_code = 'cpn4')
     <> current_setting('test.cas')::jsonb -> 'contacts' then
    raise exception 'ÉCHEC : contacts du fichier des cas différents du modèle cpn4';
  end if;
end $$;

set local role authenticated;
do $$
declare
  v_cas jsonb;
  v_g   uuid;
  v_ddr date;
  v_ga  integer;
  v_r   jsonb;
  v_n   integer := 0;
begin
  for v_cas in select * from jsonb_array_elements(current_setting('test.cas')::jsonb -> 'cas') loop
    v_g := pg_temp.patiente('Cas ' || v_n, (v_cas ->> 'jour')::integer);
    v_ddr := current_setting('test.jour')::date - (v_cas ->> 'jour')::integer;
    for v_ga in select x::integer from jsonb_array_elements_text(v_cas -> 'visites') x loop
      perform public.add_external_anc_visit(v_g, v_ddr + v_ga, 'Carnet');
    end loop;
    v_r := pg_temp.resume(pg_temp.bilan(v_g));
    if v_r <> v_cas -> 'attendu' then
      raise exception 'ÉCHEC : % : % (attendu %)', v_cas ->> 'nom', v_r, v_cas -> 'attendu';
    end if;
    -- Le numéro de CPN reste l'ordre des visites.
    if (pg_temp.bilan(v_g) ->> 'done')::integer <> jsonb_array_length(v_cas -> 'visites') then
      raise exception 'ÉCHEC : % : CPN faites', v_cas ->> 'nom';
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'OK : bilan des CPN, % cas communs avec la copie JS', v_n;
end $$;

do $$
declare
  d   jsonb := current_setting('test.cas')::jsonb -> 'datation';
  v_g uuid;
  v_r jsonb;
begin
  v_g := pg_temp.patiente('Datation', (d ->> 'jour')::integer);
  perform public.add_external_anc_visit(
    v_g, current_setting('test.jour')::date - (d ->> 'jour')::integer + (d ->> 'visite')::integer, 'Carnet');
  v_r := pg_temp.resume(pg_temp.bilan(v_g));
  if v_r <> d -> 'avant' then
    raise exception 'ÉCHEC : datation, avant : % (attendu %)', v_r, d -> 'avant';
  end if;
  -- Nouvelle DDR, plus tôt du décalage : la même CPN passe dans la fenêtre suivante.
  perform public.add_pregnancy_dating(v_g, 'lmp',
    current_setting('test.jour')::date - (d ->> 'jour')::integer - (d ->> 'decalage')::integer,
    null, null, null);
  v_r := pg_temp.resume(pg_temp.bilan(v_g));
  if v_r <> d -> 'apres' then
    raise exception 'ÉCHEC : datation, après : % (attendu %)', v_r, d -> 'apres';
  end if;
  -- La fiche de la CPN garde son « SA du jour ».
  if (select ga_days from public.list_anc_visits(v_g)) <> (d ->> 'visite')::integer then
    raise exception 'ÉCHEC : SA du jour de la fiche recalculé';
  end if;
  raise notice 'OK : datation corrigée : la CPN change de contact, la fiche garde son SA du jour';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Référentiels recopiés, registre du journal
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  -- Structure créée après la migration : valeurs par défaut reçues à la création.
  if (select count(*) from public.maternal_intervention_types where org_id = v_org) <> 4
     or (select count(*) from public.anc_counselling_topics where org_id = v_org) <> 7
     or (select count(*) from public.anc_tests where org_id = v_org) <> 5
     or not exists (select 1 from public.vaccine_doses where vaccine_code = 'td' and dose_rank = 5) then
    raise exception 'ÉCHEC : nouvelle structure sans soins, conseils, examens ou Td par défaut';
  end if;
  -- AgHBs sensible, comme le VIH et la syphilis.
  if (select count(*) from public.rapid_test_types
       where org_id = v_org and template_code in ('tdr_vih', 'tdr_syphilis', 'tdr_hepatite_b')
         and is_sensitive) <> 3 then
    raise exception 'ÉCHEC : AgHBs non sensible';
  end if;
  perform public.seed_anc_care(v_org);
  if (select count(*) from public.maternal_intervention_types where org_id = v_org) <> 4
     or (select count(*) from public.anc_counselling_topics where org_id = v_org) <> 7
     or (select count(*) from public.anc_tests where org_id = v_org) <> 5 then
    raise exception 'ÉCHEC : soins, conseils ou examens recopiés (ou en double)';
  end if;
  if (select count(*) from public.audit_medical_tables
       where table_name in ('pregnancy_conditions', 'maternal_interventions', 'anc_counselling_given',
                            'immunizations', 'external_test_results')) <> 5 then
    raise exception 'ÉCHEC : nouvelles tables absentes d''audit_medical_tables';
  end if;
  raise notice 'OK : nouvelle structure : 4 soins, 7 conseils, 5 examens, Td, recopiés une fois ; AgHBs sensible ; 5 tables au registre du journal';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Soins de la CPN, cotrimoxazole
-- -----------------------------------------------------------------------------
-- Awa (20 SA) : SP. Bineta (20 SA) : sous cotrimoxazole. Coumba (20 SA) : rien.
-- Dior (10 SA) : trop tôt pour la SP.
set local role authenticated;
select set_config('test.g_awa', pg_temp.patiente('Awa', 140)::text, true);
select set_config('test.g_bineta', pg_temp.patiente('Bineta', 140)::text, true);
select set_config('test.g_coumba', pg_temp.patiente('Coumba', 140)::text, true);
select set_config('test.g_dior', pg_temp.patiente('Dior', 70)::text, true);
select set_config('test.awa', (pg_temp.grossesse(current_setting('test.g_awa')::uuid)).patient_id::text, true);
select set_config('test.bineta', (pg_temp.grossesse(current_setting('test.g_bineta')::uuid)).patient_id::text, true);
select set_config('test.coumba', (pg_temp.grossesse(current_setting('test.g_coumba')::uuid)).patient_id::text, true);
select set_config('test.dior', (pg_temp.grossesse(current_setting('test.g_dior')::uuid)).patient_id::text, true);

do $$
declare
  v_enc uuid;
  v     jsonb;
begin
  -- Dior : SP avant 13 SA refusée.
  perform pg_temp.cpn_refusee(current_setting('test.dior')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('interventions',
      jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))), 'à partir de 13 SA');
  -- Soin inconnu, ou noté deux fois.
  perform pg_temp.cpn_refusee(current_setting('test.awa')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('interventions',
      jsonb_build_array(jsonb_build_object('type_id', gen_random_uuid())))), 'choisissez dans la liste');
  perform pg_temp.cpn_refusee(current_setting('test.awa')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('interventions', jsonb_build_array(
      jsonb_build_object('type_id', pg_temp.soin('fer_acide_folique')),
      jsonb_build_object('type_id', pg_temp.soin('fer_acide_folique'))))), 'noté deux fois');
  -- Awa : fer, SP 1, deux conseils, une remarque.
  v_enc := pg_temp.cpn(current_setting('test.awa')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('interventions', jsonb_build_array(
      jsonb_build_object('type_id', pg_temp.soin('fer_acide_folique')),
      jsonb_build_object('type_id', pg_temp.soin('tpi_sp'), 'note', 'Bien tolérée')),
    'counselling', (select jsonb_agg(id) from public.anc_counselling_topics
                     where org_id = current_setting('test.org')::uuid and template_code in ('alimentation', 'signes_danger')),
    'conditions', '[]'::jsonb)));
  if (public.get_encounter(v_enc) ->> 'is_sensitive')::boolean then
    raise exception 'ÉCHEC : CPN ordinaire rendue sensible';
  end if;
  v := public.get_encounter_anc_care(v_enc);
  if jsonb_array_length(v -> 'given' -> 'interventions') <> 2
     or jsonb_array_length(v -> 'given' -> 'counselling') <> 2
     or not exists (select 1 from jsonb_array_elements(v -> 'given' -> 'interventions') i
                     where i ->> 'dose_label' = 'SP' and (i ->> 'dose_number')::integer = 1) then
    raise exception 'ÉCHEC : soins de la CPN d''Awa : %', v -> 'given';
  end if;
  -- SP 2 le même jour : intervalle d'un mois.
  perform pg_temp.cpn_refusee(current_setting('test.awa')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('interventions',
      jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))),
    'prochaine dose possible à partir du ' || to_char(current_setting('test.jour')::date + 28, 'DD/MM/YYYY'));
  raise notice 'OK : soins recopiés de la CPN (SP 1, fer, conseils) ; SP refusée avant 13 SA et avant un mois ; soin inconnu ou en double refusé';
end $$;

do $$
declare
  v_enc uuid;
  v     jsonb;
begin
  -- Bineta : sous cotrimoxazole, SP bloquée par la règle de la table.
  perform pg_temp.cpn_refusee(current_setting('test.bineta')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('conditions', jsonb_build_array('cotrimoxazole'),
      'interventions', jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))),
    'Pas de SP pour une patiente sous cotrimoxazole');
  v_enc := pg_temp.cpn(current_setting('test.bineta')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('conditions', jsonb_build_array('cotrimoxazole'),
      'interventions', jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('fer_acide_folique'))))));
  perform set_config('test.e_bineta', v_enc::text, true);
  if not (public.get_encounter(v_enc) ->> 'is_sensitive')::boolean then
    raise exception 'ÉCHEC : CPN « sous cotrimoxazole » non sensible';
  end if;
  v := public.get_encounter_anc_care(v_enc);
  if not exists (select 1 from jsonb_array_elements(v -> 'conditions') c
                  where c ->> 'code' = 'cotrimoxazole' and (c ->> 'active')::boolean)
     or not exists (select 1 from jsonb_array_elements(v -> 'care') c
                     where c ->> 'code' = 'tpi_sp' and (c ->> 'blocked')::boolean
                       and c ->> 'block_message' like 'Pas de SP%') then
    raise exception 'ÉCHEC : écran CPN de la sage-femme sans la situation ni le blocage : %', v;
  end if;
  -- Une règle changée dans la table (sage-femme) vaut pour les saisies suivantes.
  update public.maternal_intervention_types
     set block_message = 'SP contre-indiquée sous cotrimoxazole.' where id = pg_temp.soin('tpi_sp');
  perform pg_temp.cpn_refusee(current_setting('test.bineta')::uuid,
    jsonb_build_object('maternite', jsonb_build_object(
      'interventions', jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))),
    'SP contre-indiquée sous cotrimoxazole.');
  raise notice 'OK : sous cotrimoxazole : SP bloquée avec le message de la table (gardé sans clé « conditions »), CPN sensible, situation lue dans l''écran CPN';
end $$;

do $$
declare
  v_tpi_b jsonb;
  v_tpi_c jsonb;
  v_code  text;
  v       jsonb;
begin
  -- Partout ailleurs et pour tous : Bineta (sous cotrimoxazole) a le même statut TPI que
  -- Coumba (aucune SP, aucune situation), jamais « bloqué ».
  foreach v_code in array array['0b', '0c', '0d'] loop
    perform pg_temp.en_tant_que(v_code);
    v := public.get_anc_care(current_setting('test.g_bineta')::uuid);
    select c into v_tpi_b from jsonb_array_elements(v -> 'care') c where c ->> 'code' = 'tpi_sp';
    select c into v_tpi_c from jsonb_array_elements(
      public.get_anc_care(current_setting('test.g_coumba')::uuid) -> 'care') c where c ->> 'code' = 'tpi_sp';
    if v_tpi_b <> v_tpi_c or (v_tpi_b ->> 'blocked')::boolean or v_tpi_b ->> 'block_message' is not null then
      raise exception 'ÉCHEC : statut TPI différent sous cotrimoxazole (%) : % / %', v_code, v_tpi_b, v_tpi_c;
    end if;
    if v ? 'conditions' or v::text like '%cotrimoxazole%' or v::text like '%Pas de SP%' then
      raise exception 'ÉCHEC : situation révélée dans l''onglet Grossesse (%)', v_code;
    end if;
  end loop;
  -- Aide-soignant : ni conseils (clé absente), ni l'écran CPN, ni les remarques des soins.
  perform pg_temp.en_tant_que('0d');
  if public.get_anc_care(current_setting('test.g_awa')::uuid) ? 'counselling' then
    raise exception 'ÉCHEC : conseils lus par l''aide-soignant';
  end if;
  perform pg_temp.refus(format('select public.get_encounter_anc_care(%L)', current_setting('test.e_bineta')),
                        '42501', 'introuvable');
  if exists (select 1 from jsonb_array_elements(public.get_anc_care(current_setting('test.g_awa')::uuid) -> 'interventions') i
              where i ->> 'note' is not null) then
    raise exception 'ÉCHEC : remarque d''un soin lue par l''aide-soignant';
  end if;
  perform pg_temp.en_tant_que('0b');
  if not exists (select 1 from jsonb_array_elements(public.get_anc_care(current_setting('test.g_awa')::uuid) -> 'interventions') i
                  where i ->> 'note' = 'Bien tolérée')
     or jsonb_array_length(public.get_anc_care(current_setting('test.g_awa')::uuid) -> 'counselling') <> 2 then
    raise exception 'ÉCHEC : remarque du soin ou conseils absents pour la sage-femme';
  end if;
  raise notice 'OK : sous cotrimoxazole, même statut TPI qu''une femme sans SP pour tous hors de l''écran CPN ; aide-soignant sans écran CPN ni remarques';
end $$;

do $$
begin
  -- Bineta, CPN suivante : décocher sans motif est refusé ; avec un motif, la situation est
  -- close et la SP redevient possible.
  perform pg_temp.cpn_refusee(current_setting('test.bineta')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('conditions', '[]'::jsonb)), 'Indiquez pourquoi « Sous cotrimoxazole » est décoché');
  perform pg_temp.cpn(current_setting('test.bineta')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('conditions', '[]'::jsonb,
      'condition_end_reasons', jsonb_build_object('cotrimoxazole', 'Traitement arrêté par le médecin'),
      'interventions', jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))));
  if exists (select 1 from jsonb_array_elements(
               public.get_encounter_anc_care(current_setting('test.e_bineta')::uuid) -> 'conditions') c
              where (c ->> 'active')::boolean) then
    raise exception 'ÉCHEC : situation toujours en cours après la CPN qui la décoche';
  end if;
  raise notice 'OK : situation décochée seulement avec un motif, SP donnée ensuite';
end $$;

-- -----------------------------------------------------------------------------
-- 4. Soins faits ailleurs
-- -----------------------------------------------------------------------------
do $$
declare
  v_c  uuid := gen_random_uuid();
  v_id uuid;
  v_n  integer;
begin
  perform pg_temp.en_tant_que('0b');
  -- SP faite ailleurs : datée, envoyée deux fois (coupure) : une seule ligne.
  v_id := public.add_external_intervention(current_setting('test.g_coumba')::uuid, pg_temp.soin('tpi_sp'),
    current_setting('test.jour')::date - 40, 'Poste de Diattacounda', null, v_c);
  if public.add_external_intervention(current_setting('test.g_coumba')::uuid, pg_temp.soin('tpi_sp'),
       current_setting('test.jour')::date - 40, 'Poste de Diattacounda', null, v_c) <> v_id then
    raise exception 'ÉCHEC : envoi répété : deux lignes';
  end if;
  perform pg_temp.refus(format('select public.add_external_intervention(%L, %L, null, %L, null, %L)',
    current_setting('test.g_coumba'), pg_temp.soin('tpi_sp'), 'Poste', gen_random_uuid()), '22023', 'Indiquez la date');
  perform pg_temp.refus(format('select public.add_external_intervention(%L, %L, %L, %L, null, %L)',
    current_setting('test.g_coumba'), pg_temp.soin('fer_acide_folique'), current_setting('test.jour'),
    'Poste', gen_random_uuid()), '22023', 'ne se note pas comme fait ailleurs');
  -- Moustiquaire déjà reçue : une case, sans date ; plus proposée ensuite.
  perform public.add_external_intervention(current_setting('test.g_coumba')::uuid, pg_temp.soin('moustiquaire'),
    null, null, null, gen_random_uuid());
  if not exists (select 1 from jsonb_array_elements(public.get_anc_care(current_setting('test.g_coumba')::uuid) -> 'care') c
                  where c ->> 'code' = 'moustiquaire' and (c ->> 'complete')::boolean) then
    raise exception 'ÉCHEC : moustiquaire reçue ailleurs encore proposée';
  end if;
  perform pg_temp.cpn_refusee(current_setting('test.coumba')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('interventions',
      jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('moustiquaire'))))), 'déjà noté');
  -- SP ici 40 jours après la SP faite ailleurs : SP 2.
  perform pg_temp.cpn(current_setting('test.coumba')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('interventions', jsonb_build_array(jsonb_build_object('type_id', pg_temp.soin('tpi_sp'))))));
  select count(*) into v_n from jsonb_array_elements(public.get_anc_care(current_setting('test.g_coumba')::uuid) -> 'interventions') i
   where i ->> 'dose_label' = 'SP' and (i ->> 'dose_number')::integer = 2 and i ->> 'origin' = 'here';
  if v_n <> 1 then
    raise exception 'ÉCHEC : SP faite ici après une SP faite ailleurs non numérotée 2';
  end if;
  -- Retrait motivé ; faite ici : jamais retirée.
  perform pg_temp.refus(format('select public.remove_external_intervention(%L, %L)', v_id, ''), '22023', 'Indiquez pourquoi');
  perform public.remove_external_intervention(v_id, 'Erreur de carnet');
  perform pg_temp.refus(format('select public.remove_external_intervention(%L, %L)',
    (select (i ->> 'id') from jsonb_array_elements(public.get_anc_care(current_setting('test.g_coumba')::uuid) -> 'interventions') i
      where i ->> 'origin' = 'here' limit 1), 'Erreur'), '22023', 'avenant');
  -- Aide-soignant : lecture seule.
  perform pg_temp.en_tant_que('0d');
  perform pg_temp.refus(format('select public.add_external_intervention(%L, %L, %L, %L, null, %L)',
    current_setting('test.g_awa'), pg_temp.soin('tpi_sp'), current_setting('test.jour'), 'Poste',
    gen_random_uuid()), '42501');
  raise notice 'OK : SP faite ailleurs datée et sans doublon, moustiquaire reçue ailleurs (case), numérotation suivie, retrait motivé, aide-soignant en lecture seule';
end $$;

-- -----------------------------------------------------------------------------
-- 5. Td
-- -----------------------------------------------------------------------------
do $$
declare
  v_c  uuid := gen_random_uuid();
  v_id uuid;
  v    jsonb;
begin
  perform pg_temp.en_tant_que('0b');
  -- Dior : Td 1 d'après le carnet, « mars 2024 » : daté du 01/03/2024 (lecture prudente).
  v_id := public.add_immunization_from_card(current_setting('test.dior')::uuid, 'td', 1,
    '2024-03-17', 'month', 'Centre de santé de Sédhiou', null, v_c);
  if public.add_immunization_from_card(current_setting('test.dior')::uuid, 'td', 1,
       '2024-03-17', 'month', 'Centre de santé de Sédhiou', null, v_c) <> v_id then
    raise exception 'ÉCHEC : envoi répété du Td : deux lignes';
  end if;
  -- Td 2 « 2025 » : 01/01/2025 ; Td 3 possible dès le 02/07/2025 (01/01/2025 + 182 jours).
  perform public.add_immunization_from_card(current_setting('test.dior')::uuid, 'td', 2,
    '2025-08-20', 'year', null, null, gen_random_uuid());
  v := public.vaccine_status(current_setting('test.dior')::uuid, 'td');
  if (v -> 'doses' -> 0 ->> 'given_on') <> '2024-03-01' or (v -> 'doses' -> 1 ->> 'given_on') <> '2025-01-01'
     or (v -> 'next' ->> 'rank')::integer <> 3 or (v -> 'next' ->> 'possible_from') <> '2025-07-02'
     or (v -> 'protection' ->> 'until') <> '2028-01-01'
     or (v -> 'doses' -> 0 ->> 'date_precision') <> 'month' or (v -> 'doses' -> 1 ->> 'date_precision') <> 'year'
     or (v -> 'next' ->> 'precision') <> 'year' or (v -> 'protection' ->> 'precision') <> 'year' then
    raise exception 'ÉCHEC : lecture prudente des dates approximatives : %', v;
  end if;
  perform pg_temp.refus(format('select public.add_immunization_from_card(%L, %L, 2, %L, %L, null, null, %L)',
    current_setting('test.dior'), 'td', '2025-02-01', 'day', gen_random_uuid()), '22023', 'déjà notée');
  perform pg_temp.refus(format('select public.add_immunization_from_card(%L, %L, 3, %L, %L, null, null, %L)',
    current_setting('test.dior'), 'td', current_setting('test.jour')::date + 1, 'day', gen_random_uuid()),
    '22023', 'futur');
  -- Td 3 pendant la CPN : rang suivant d'office.
  perform pg_temp.cpn(current_setting('test.dior')::uuid, jsonb_build_object('maternite',
    jsonb_build_object('td', jsonb_build_object('given', true, 'lot_number', 'L-2026-07'))));
  v := public.vaccine_status(current_setting('test.dior')::uuid, 'td');
  if jsonb_array_length(v -> 'doses') <> 3 or (v -> 'doses' -> 2 ->> 'origin') <> 'here'
     or (v -> 'doses' -> 2 ->> 'lot_number') <> 'L-2026-07' or (v -> 'next' ->> 'rank')::integer <> 4 then
    raise exception 'ÉCHEC : Td 3 fait pendant la CPN : %', v;
  end if;
  -- Awa : Td 1 il y a 10 jours ; Td 2 aujourd'hui refusé (4 semaines).
  perform public.add_immunization_from_card(current_setting('test.awa')::uuid, 'td', 1,
    current_setting('test.jour')::date - 10, 'day', null, null, gen_random_uuid());
  perform pg_temp.cpn_refusee(current_setting('test.awa')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('td', jsonb_build_object('given', true))),
    'Td 2 : possible à partir du ' || to_char(current_setting('test.jour')::date + 18, 'DD/MM/YYYY'));
  -- Annulation motivée : la dose reste, le rang se libère.
  perform pg_temp.refus(format('select public.void_immunization(%L, %L)', v_id, ' '), '22023', 'Indiquez pourquoi');
  perform public.void_immunization(v_id, 'Erreur de dose');
  if (public.vaccine_status(current_setting('test.dior')::uuid, 'td') -> 'doses' -> 0 ->> 'dose_rank') <> '2' then
    raise exception 'ÉCHEC : annulation du Td 1';
  end if;
  -- Aide-soignant : lit, ne note pas. Accueil, caissier, owner qui n'exerce pas : rien.
  perform pg_temp.en_tant_que('0d');
  perform public.vaccine_status(current_setting('test.dior')::uuid, 'td');
  perform pg_temp.refus(format('select public.add_immunization_from_card(%L, %L, 4, %L, %L, null, null, %L)',
    current_setting('test.dior'), 'td', current_setting('test.jour'), 'day', gen_random_uuid()), '42501');
  perform pg_temp.refus(format('select public.void_immunization(%L, %L)',
    public.vaccine_status(current_setting('test.dior')::uuid, 'td') -> 'doses' -> 0 ->> 'id', 'Essai'), '42501');
  raise notice 'OK : Td d''après le carnet (date au mois ou à l''année ramenée au premier jour), rang suivant et délai minimal, Td fait pendant la CPN, envoi répété sans doublon, annulation motivée, aide-soignant en lecture seule';
end $$;
reset role;

-- Dose annulée gardée avec son motif (vérifié en propriétaire : aucune lecture directe).
do $$
begin
  if (select count(*) from public.immunizations
       where patient_id = current_setting('test.dior')::uuid) <> 3
     or (select count(*) from public.immunizations
          where patient_id = current_setting('test.dior')::uuid and deleted_at is not null
            and removed_reason = 'Erreur de dose') <> 1 then
    raise exception 'ÉCHEC : dose annulée absente';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Examens de la grossesse
-- -----------------------------------------------------------------------------
set local role authenticated;
do $$
declare
  v     jsonb;
  v_c   uuid := gen_random_uuid();
  v_id  uuid;
begin
  -- TDR VIH dans une CPN d'Awa (consultation sensible d'office), Hb d'un laboratoire.
  perform pg_temp.cpn(current_setting('test.awa')::uuid, jsonb_build_object(
    'tests', jsonb_build_array(jsonb_build_object('rapid_test_type_id', pg_temp.examen('tdr_vih'),
                                                  'result', 'negative'))));
  v_id := public.add_external_test_result(current_setting('test.g_awa')::uuid, pg_temp.examen('hemoglobine'),
    current_setting('test.jour')::date - 3, 'Laboratoire Bio 24', null, 10.5, null, null, v_c);
  if public.add_external_test_result(current_setting('test.g_awa')::uuid, pg_temp.examen('hemoglobine'),
       current_setting('test.jour')::date - 3, 'Laboratoire Bio 24', null, 10.5, null, null, v_c) <> v_id then
    raise exception 'ÉCHEC : résultat extérieur envoyé deux fois';
  end if;
  perform pg_temp.refus(format('select public.add_external_test_result(%L, %L, %L, %L, null, null, null, null, %L)',
    current_setting('test.g_awa'), pg_temp.examen('hemoglobine'), current_setting('test.jour'), 'Labo',
    gen_random_uuid()), '22023', 'tapez la valeur');
  perform pg_temp.refus(format('select public.add_external_test_result(%L, %L, %L, %L, %L, null, null, null, %L)',
    current_setting('test.g_awa'), pg_temp.examen('tdr_syphilis'), current_setting('test.jour'), ' ',
    'negative', gen_random_uuid()), '22023', 'laboratoire');

  -- AgHBs d'un laboratoire, apporté à une CPN de Coumba : CPN sensible d'office.
  perform set_config('test.e_coumba_ext', pg_temp.cpn(current_setting('test.coumba')::uuid,
    jsonb_build_object('maternite', jsonb_build_object('external_tests', jsonb_build_array(
      jsonb_build_object('client_id', gen_random_uuid(), 'rapid_test_type_id', pg_temp.examen('tdr_hepatite_b'),
                         'taken_on', current_setting('test.jour')::date - 5, 'lab_name', 'Labo de Sédhiou',
                         'result', 'negative')))))::text, true);
  if not (public.get_encounter(current_setting('test.e_coumba_ext')::uuid) ->> 'is_sensitive')::boolean
     or not exists (select 1 from jsonb_array_elements(
                      public.get_pregnancy_tests(current_setting('test.g_coumba')::uuid, gen_random_uuid()) -> 'tests') t
                     where t ->> 'label' like 'TDR hépatite B%' and t -> 'results' -> 0 ->> 'source' = 'external') then
    raise exception 'ÉCHEC : AgHBs extérieur saisi pendant la CPN : CPN non sensible ou résultat absent';
  end if;

  -- Une ligne READ par ouverture : deux lectures avec le même identifiant (rechargement),
  -- puis une réouverture.
  perform pg_temp.refus(format('select public.get_pregnancy_tests(%L)', current_setting('test.g_awa')),
                        '22023', 'Identifiant d''ouverture');
  perform set_config('test.ouverture', gen_random_uuid()::text, true);
  perform public.get_pregnancy_tests(current_setting('test.g_awa')::uuid, current_setting('test.ouverture')::uuid);
  v := public.get_pregnancy_tests(current_setting('test.g_awa')::uuid, current_setting('test.ouverture')::uuid);
  if jsonb_array_length(v -> 'tests') <> 5
     or not exists (select 1 from jsonb_array_elements(v -> 'tests') t
                     where t ->> 'label' like 'TDR VIH%' and t -> 'results' -> 0 ->> 'source' = 'here'
                       and t -> 'results' -> 0 ->> 'result' = 'negative')
     or not exists (select 1 from jsonb_array_elements(v -> 'tests') t
                     where t ->> 'label' like 'Hémoglobine%' and t -> 'results' -> 0 ->> 'source' = 'external'
                       and t -> 'results' -> 0 ->> 'lab_name' = 'Laboratoire Bio 24')
     or not exists (select 1 from jsonb_array_elements(v -> 'tests') t
                     where t ->> 'label' like 'TDR hépatite B%' and jsonb_array_length(t -> 'results') = 0) then
    raise exception 'ÉCHEC : examens de la grossesse : %', v;
  end if;
  raise notice 'OK : examens de la grossesse : TDR de la CPN, Hb d''un laboratoire extérieur (sans doublon), hépatite B à faire';
end $$;
reset role;

-- Lecture sensible journalisée : une ligne READ par ouverture, pas par rechargement.
do $$
begin
  if (select count(*) from public.audit_logs
       where action = 'READ' and table_name = 'pregnancies'
         and record_id = current_setting('test.g_awa')) <> 1 then
    raise exception 'ÉCHEC : lecture des examens sensibles non journalisée, ou une ligne par rechargement';
  end if;
  set local role authenticated;
  perform pg_temp.en_tant_que('0b');
  perform public.get_pregnancy_tests(current_setting('test.g_awa')::uuid, gen_random_uuid());
  reset role;
  if (select count(*) from public.audit_logs
       where action = 'READ' and table_name = 'pregnancies'
         and record_id = current_setting('test.g_awa')) <> 2 then
    raise exception 'ÉCHEC : réouverture des examens non journalisée';
  end if;
  raise notice 'OK : examens sensibles : une ligne READ par ouverture (rechargement compris), refus sans identifiant d''ouverture';
end $$;

set local role authenticated;
do $$
declare
  v_code text;
  v_t    text;
begin
  -- Examens : liste entière réservée aux habilités ; rien pour l'aide-soignant.
  foreach v_code in array array['0d', '09', '0e', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select public.get_pregnancy_tests(%L, %L)', current_setting('test.g_awa'),
                          gen_random_uuid()), '42501', 'réservés aux soignants habilités');
    perform pg_temp.refus(format('select public.get_encounter_anc_care(%L)', current_setting('test.e_bineta')),
                          '42501');
  end loop;
  -- Accueil, caissier, owner qui n'exerce pas : ni soins, ni vaccins.
  foreach v_code in array array['09', '0e', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select public.get_anc_care(%L)', current_setting('test.g_awa')), '42501');
    perform pg_temp.refus(format('select public.vaccine_status(%L, %L)', current_setting('test.dior'), 'td'), '42501');
  end loop;
  -- Aucune lecture directe des données des patientes, même pour la sage-femme.
  perform pg_temp.en_tant_que('0b');
  foreach v_t in array array['pregnancy_conditions', 'maternal_interventions', 'anc_counselling_given',
                             'immunizations', 'external_test_results'] loop
    perform pg_temp.refus(format('select count(*) from public.%I', v_t), '42501');
  end loop;
  -- Référentiels lus par les membres ; règles modifiées par la sage-femme, pas l'infirmier.
  perform pg_temp.en_tant_que('0c');
  update public.maternal_intervention_types set min_interval_days = 20 where id = pg_temp.soin('tpi_sp');
  if (select min_interval_days from public.maternal_intervention_types where id = pg_temp.soin('tpi_sp')) <> 28 then
    raise exception 'ÉCHEC : infirmier modifie une règle';
  end if;
  raise notice 'OK : examens et écran CPN refusés à l''aide-soignant, à l''accueil, au caissier et à l''owner qui n''exerce pas ; soins et vaccins refusés aux non-soignants ; aucune lecture directe ; règles réservées aux paramètres';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 7. Lignes figées, fusion de dossiers
-- -----------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_b uuid;
begin
  perform pg_temp.refus('delete from public.immunizations', '42501');
  perform pg_temp.refus(format('update public.maternal_interventions set note = %L where origin = %L', 'x', 'here'),
                        '42501');
  perform pg_temp.refus('update public.anc_counselling_given set label = ''x''', '42501');
  perform pg_temp.refus('update public.pregnancy_conditions set started_on = started_on - 1', '42501');

  -- Deux dossiers avec un Td 1 : fusion acceptée sans message ; la dose la plus fiable reste
  -- (date au jour avant date à l'année), l'autre est annulée « Doublon après fusion ».
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'FUSION', 'Ami', 'F', 30) returning id into v_a;
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'FUSION', 'Amy', 'F', 30) returning id into v_b;
  set local role authenticated;
  perform pg_temp.en_tant_que('0b');
  perform public.add_immunization_from_card(v_a, 'td', 1, '2023-01-01', 'year', null, null, gen_random_uuid());
  perform public.add_immunization_from_card(v_b, 'td', 1, '2024-06-12', 'day', null, null, gen_random_uuid());
  perform public.add_immunization_from_card(v_b, 'td', 2, '2024-09-01', 'month', null, null, gen_random_uuid());
  -- Owner qui n'exerce pas : fusionne sans rien savoir des vaccins.
  perform pg_temp.en_tant_que('0a');
  perform public.merge_patients(v_a, v_b, 'Doublon');
  reset role;
  if (select count(*) from public.immunizations where patient_id = v_a and deleted_at is null) <> 2
     or (select given_on from public.immunizations
          where patient_id = v_a and dose_rank = 1 and deleted_at is null) <> '2024-06-12'
     or (select removed_reason from public.immunizations
          where patient_id = v_a and dose_rank = 1 and deleted_at is not null) <> 'Doublon après fusion'
     or exists (select 1 from public.immunizations where patient_id = v_b)
     or not exists (select 1 from public.audit_logs
                     where table_name = 'immunizations' and action = 'UPDATE'
                       and new_data -> 'changed_fields' ? 'removed_reason') then
    raise exception 'ÉCHEC : fusion avec un Td en double';
  end if;

  -- Faite ici avant le carnet : Td 3 de Dior (CPN) gardé contre un Td 3 au jour près du carnet.
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'FUSION', 'Dior', 'F', 25) returning id into v_a;
  set local role authenticated;
  perform pg_temp.en_tant_que('0b');
  perform public.add_immunization_from_card(v_a, 'td', 3, current_setting('test.jour')::date - 1, 'day',
                                            null, null, gen_random_uuid());
  perform pg_temp.en_tant_que('0a');
  perform public.merge_patients(v_a, current_setting('test.dior')::uuid, 'Doublon');
  reset role;
  if (select origin from public.immunizations
       where patient_id = v_a and dose_rank = 3 and deleted_at is null) <> 'here' then
    raise exception 'ÉCHEC : fusion : dose faite ici non gardée';
  end if;
  raise notice 'OK : lignes figées ; fusion jamais refusée : dose la plus fiable gardée (ici, puis date la plus précise), l''autre annulée « Doublon après fusion » et journalisée';
end $$;

-- -----------------------------------------------------------------------------
-- 8. Fusion de dossiers : deux grossesses en cours
-- -----------------------------------------------------------------------------
do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_k    uuid;
  v_l    uuid;
  v_gk   uuid;
  v_gl   uuid;
  v_enc  uuid;
  v      jsonb;
begin
  -- a) DPA + 42 jours dépassée dans le dossier absorbé : autre grossesse, close « ended »,
  --    celle du dossier gardé reste en cours ; rien n'est mélangé.
  v_gk := pg_temp.patiente('Khady', 100);
  v_gl := pg_temp.patiente('Kadi', 300);
  v_k := (pg_temp.grossesse(v_gk)).patient_id;
  v_l := (pg_temp.grossesse(v_gl)).patient_id;
  update public.maternity_settings set overdue_closure_days = 10 where org_id = v_org;
  update public.patients set merged_into_id = v_k, deleted_at = now() where id = v_l;
  if (pg_temp.grossesse(v_gl)).status <> 'ended' or (pg_temp.grossesse(v_gl)).deleted_at is not null
     or (pg_temp.grossesse(v_gl)).patient_id <> v_k or (pg_temp.grossesse(v_gk)).status <> 'ongoing' then
    raise exception 'ÉCHEC : grossesse au-delà de la DPA + délai non close à part';
  end if;
  update public.maternity_settings set overdue_closure_days = 42 where org_id = v_org;

  -- b) Même grossesse saisie deux fois, DDR différentes : la plus remplie est gardée, tout
  --    lui est rattaché, cotrimoxazole compris ; ce qui a été noté « fait ailleurs » dans les
  --    deux n'est compté qu'une fois.
  v_gk := pg_temp.patiente('Ndeye', 140);
  v_gl := pg_temp.patiente('Ndèye', 147);
  v_k := (pg_temp.grossesse(v_gk)).patient_id;
  v_l := (pg_temp.grossesse(v_gl)).patient_id;
  set local role authenticated;
  -- Dossier gardé : cotrimoxazole, un conseil, une CPN ici ; CPN ailleurs (J-60), SP ailleurs
  -- (J-30), moustiquaire reçue.
  v_enc := pg_temp.cpn(v_k, jsonb_build_object('maternite', jsonb_build_object(
    'conditions', jsonb_build_array('cotrimoxazole'),
    'counselling', (select jsonb_agg(id) from public.anc_counselling_topics
                     where org_id = v_org and template_code = 'alimentation'))));
  perform public.add_external_anc_visit(v_gk, current_setting('test.jour')::date - 60, 'Poste de Bounkiling');
  perform public.add_external_intervention(v_gk, pg_temp.soin('tpi_sp'), current_setting('test.jour')::date - 30,
                                           'Poste de Bounkiling', null, gen_random_uuid());
  perform public.add_external_intervention(v_gk, pg_temp.soin('moustiquaire'), null, null, null, gen_random_uuid());
  -- Dossier absorbé : les mêmes CPN (J-60) et SP (J-30) d'après le même carnet, une CPN de
  -- plus (J-30), la moustiquaire, le même résultat extérieur deux fois (un par dossier).
  perform public.add_external_anc_visit(v_gl, current_setting('test.jour')::date - 30, 'Poste de Bounkiling');
  perform public.add_external_anc_visit(v_gl, current_setting('test.jour')::date - 60, 'Poste de Bounkiling');
  perform public.add_external_intervention(v_gl, pg_temp.soin('tpi_sp'), current_setting('test.jour')::date - 30,
                                           'Poste de Bounkiling', null, gen_random_uuid());
  perform public.add_external_intervention(v_gl, pg_temp.soin('moustiquaire'), null, null, null, gen_random_uuid());
  perform public.add_external_test_result(v_gl, pg_temp.examen('hemoglobine'), current_setting('test.jour')::date - 30,
                                          'Labo de Bounkiling', null, 11.2, null, null, gen_random_uuid());
  perform public.add_external_test_result(v_gk, pg_temp.examen('hemoglobine'), current_setting('test.jour')::date - 30,
                                          'Labo de Bounkiling', null, 11.2, null, null, gen_random_uuid());
  -- Fusion par l'owner qui n'exerce pas : aucun message, aucun refus.
  perform pg_temp.en_tant_que('0a');
  perform public.merge_patients(v_k, v_l, 'Doublon');
  reset role;
  -- Gardée : la plus remplie (dossier gardé, 8 saisies contre 6).
  if (pg_temp.grossesse(v_gk)).deleted_at is not null
     or (pg_temp.grossesse(v_gl)).removed_reason <> 'Doublon après fusion'
     or (pg_temp.grossesse(v_gl)).patient_id <> v_k then
    raise exception 'ÉCHEC : grossesse la plus remplie non gardée (ou l''autre non retirée)';
  end if;
  if (select count(*) from public.anc_visits where pregnancy_id = v_gk and deleted_at is null) <> 3
     or (select count(*) from public.anc_visits where pregnancy_id = v_gk
          and removed_reason = 'Doublon après fusion') <> 1
     or (select count(*) from public.maternal_interventions
          where pregnancy_id = v_gk and deleted_at is null and type_id = pg_temp.soin('tpi_sp')) <> 1
     or (select count(*) from public.maternal_interventions
          where pregnancy_id = v_gk and deleted_at is null and type_id = pg_temp.soin('moustiquaire')) <> 1
     or (select count(*) from public.maternal_interventions where pregnancy_id = v_gk
          and removed_reason = 'Doublon après fusion') <> 2
     or (select count(*) from public.external_test_results where pregnancy_id = v_gk and deleted_at is null) <> 1
     or (select count(*) from public.anc_counselling_given where pregnancy_id = v_gk) <> 1
     or exists (select 1 from public.anc_visits where pregnancy_id = v_gl)
     or exists (select 1 from public.maternal_interventions where pregnancy_id = v_gl)
     or public.pregnancy_active_conditions(v_gk) <> array['cotrimoxazole']
     or (select count(*) from public.pregnancy_datings where pregnancy_id = v_gk) <> 2
     or (pg_temp.grossesse(v_gk)).dating_review_since is null then
    raise exception 'ÉCHEC : saisies mal rattachées, ou doublons « faits ailleurs » gardés après fusion';
  end if;
  if not exists (select 1 from public.audit_logs
                  where table_name = 'pregnancies' and record_id = v_gl::text and action = 'UPDATE'
                    and new_data -> 'changed_fields' ? 'removed_reason') then
    raise exception 'ÉCHEC : retrait « Doublon après fusion » non journalisé';
  end if;
  -- SP numérotée une seule fois.
  set local role authenticated;
  perform pg_temp.en_tant_que('0b');
  if (select max((i ->> 'dose_number')::integer)
        from jsonb_array_elements(public.get_anc_care(v_gk) -> 'interventions') i
       where i ->> 'dose_label' = 'SP') <> 1 then
    raise exception 'ÉCHEC : SP numérotée deux fois après fusion';
  end if;
  reset role;
  v_gl := v_gk;

  -- Repère « Datation à vérifier (fusion) » : habilités seulement, levé par la sage-femme.
  set local role authenticated;
  perform pg_temp.en_tant_que('0d');
  if public.get_pregnancy(v_gl) ? 'dating_review_since' then
    raise exception 'ÉCHEC : repère de datation lu par l''aide-soignant';
  end if;
  perform pg_temp.refus(format('select public.confirm_pregnancy_dating(%L)', v_gl), '42501');
  perform pg_temp.en_tant_que('0b');
  if not public.get_pregnancy(v_gl) ? 'dating_review_since' then
    raise exception 'ÉCHEC : repère de datation absent pour la sage-femme';
  end if;
  perform public.confirm_pregnancy_dating(v_gl);
  if public.get_pregnancy(v_gl) ? 'dating_review_since' then
    raise exception 'ÉCHEC : repère de datation non levé';
  end if;
  reset role;
  raise notice 'OK : fusion de deux grossesses en cours sans refus : au-delà de la DPA + délai, close à part ; sinon la plus remplie gardée, CPN, soins, conseils, résultats, cotrimoxazole et datations rattachés, « faits ailleurs » en double retirés (SP comptée une fois, une moustiquaire), l''autre retirée « Doublon après fusion » ; repère de datation pour les habilités';
end $$;

-- -----------------------------------------------------------------------------
-- 9. Journal : lignes des situations et lectures sensibles réservées aux habilités
-- -----------------------------------------------------------------------------
set local role authenticated;
do $$
declare
  v_code text;
begin
  -- Owner qui n'exerce pas : aucune ligne des tables médicales ni des lectures.
  perform pg_temp.en_tant_que('0a');
  if exists (select 1 from public.audit_logs
              where org_id = current_setting('test.org')::uuid
                and (table_name in ('pregnancy_conditions', 'maternal_interventions', 'immunizations',
                                    'external_test_results', 'anc_counselling_given')
                     or action = 'READ')) then
    raise exception 'ÉCHEC : journal médical lu par l''owner qui n''exerce pas';
  end if;
  -- Admin qui exerce (habilité aux données sensibles) : les lit.
  perform pg_temp.en_tant_que('0f');
  if not public.patients_can_read_sensitive(current_setting('test.org')::uuid)
     or not exists (select 1 from public.audit_logs where table_name = 'pregnancy_conditions')
     or not exists (select 1 from public.audit_logs where action = 'READ' and table_name = 'pregnancies') then
    raise exception 'ÉCHEC : journal médical illisible pour l''admin qui exerce';
  end if;
  -- Retraits : même réponse, que la ligne existe ou non, pour qui n'a pas le droit.
  perform pg_temp.en_tant_que('09');
  foreach v_code in array array['remove_external_intervention', 'remove_pregnancy_condition',
                                'void_immunization', 'remove_external_test_result'] loop
    perform pg_temp.refus(format('select public.%I(%L, %L)', v_code, gen_random_uuid(), 'Essai'), '42501');
  end loop;
  raise notice 'OK : journal des situations, soins, vaccins, résultats et lectures sensibles lu seulement par l''owner ou l''admin habilité ; retraits refusés de la même façon, ligne existante ou non';
end $$;
reset role;

do $$
declare
  v_ids record;
begin
  -- Lignes existantes, refusées à l'accueil avec la même réponse qu'une ligne inconnue.
  select (select id from public.maternal_interventions where origin = 'elsewhere' and deleted_at is null limit 1) as soin,
         (select id from public.pregnancy_conditions where deleted_at is null limit 1) as situation,
         (select id from public.immunizations where deleted_at is null limit 1) as dose,
         (select id from public.external_test_results where deleted_at is null limit 1) as resultat
    into v_ids;
  set local role authenticated;
  perform pg_temp.en_tant_que('09');
  perform pg_temp.refus(format('select public.remove_external_intervention(%L, %L)', v_ids.soin, 'Essai'), '42501', 'Soin introuvable');
  perform pg_temp.refus(format('select public.remove_external_intervention(%L, %L)', gen_random_uuid(), 'Essai'), '42501', 'Soin introuvable');
  perform pg_temp.refus(format('select public.remove_pregnancy_condition(%L, %L)', v_ids.situation, 'Essai'), '42501', 'Introuvable');
  perform pg_temp.refus(format('select public.remove_pregnancy_condition(%L, %L)', gen_random_uuid(), 'Essai'), '42501', 'Introuvable');
  perform pg_temp.refus(format('select public.void_immunization(%L, %L)', v_ids.dose, 'Essai'), '42501', 'Dose introuvable');
  perform pg_temp.refus(format('select public.void_immunization(%L, %L)', gen_random_uuid(), 'Essai'), '42501', 'Dose introuvable');
  perform pg_temp.refus(format('select public.remove_external_test_result(%L, %L)', v_ids.resultat, 'Essai'), '42501', 'Résultat introuvable');
  perform pg_temp.refus(format('select public.remove_external_test_result(%L, %L)', gen_random_uuid(), 'Essai'), '42501', 'Résultat introuvable');
  reset role;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Fonctions internes jamais exécutables par le client
-- -----------------------------------------------------------------------------
do $$
declare
  v_f    text;
  v_role text;
begin
  foreach v_f in array array[
    'public.anc_status_compute(uuid)',
    'public.pregnancy_row_is_merge_relink(jsonb, jsonb)',
    'public.pregnancy_conditions_guard()',
    'public.pregnancy_active_conditions(uuid)',
    'public.anc_draft_conditions(jsonb)',
    'public.encounter_draft_sensitive(uuid, uuid, jsonb)',
    'public.maternal_interventions_guard()',
    'public.anc_counselling_given_guard()',
    'public.seed_anc_care(uuid)',
    'public.seed_anc_tests(uuid)',
    'public.organizations_seed_anc_care()',
    'public.vaccination_can_read(uuid)',
    'public.vaccination_can_write(uuid)',
    'public.immunizations_guard()',
    'public.vaccine_next_dose(uuid, text)',
    'public.vaccine_status_compute(uuid, text)',
    'public.external_test_results_guard()',
    'public.maternal_interventions_numbered(uuid)',
    'public.maternal_care_status(uuid, text[])',
    'public.maternal_intervention_check(public.maternal_intervention_types, uuid, date, integer, text[])',
    'public.external_test_result_insert(public.pregnancies, uuid, date, text, text, numeric, text, text, uuid, uuid)',
    'public.anc_care_from_encounter(public.encounters, jsonb)',
    'public.encounter_validate_extensions(public.encounters, jsonb)',
    'public.immunization_rank(public.immunizations)',
    'public.patients_merge_relink_anc_care()',
    'public.anc_visits_guard()',
    'public.seed_maternity_settings(uuid)',
    'public.patients_merge_relink_maternity()',
    'public.pregnancy_entry_count(uuid)',
    'public.pregnancies_merge(uuid, uuid)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_f, 'execute') then
        raise exception 'ÉCHEC : % exécutable par %', v_f, v_role;
      end if;
    end loop;
  end loop;
  -- Fonctions du client : jamais anon.
  foreach v_f in array array[
    'public.get_pregnancy(uuid)', 'public.get_encounter_anc_care(uuid)', 'public.get_anc_care(uuid)',
    'public.get_pregnancy_tests(uuid, uuid)', 'public.confirm_pregnancy_dating(uuid)',
    'public.vaccine_status(uuid, text)'] loop
    if has_function_privilege('anon', v_f, 'execute') then
      raise exception 'ÉCHEC : % exécutable par anon', v_f;
    end if;
  end loop;
  raise notice 'OK : 30 fonctions internes inexécutables par anon et authenticated ; fonctions du client fermées à anon';
end $$;

rollback;
