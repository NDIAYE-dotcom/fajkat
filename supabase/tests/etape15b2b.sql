-- =============================================================================
-- Tests — étape 15, partie B2 (correctif) : un soin bloqué ne part jamais sur l'ordonnance
-- -----------------------------------------------------------------------------
-- Vérifie : CPN d'une patiente « Sous cotrimoxazole » refusée si son ordonnance garde la
-- ligne de SP (clé fixe, même renommée ; ou nom du produit écrit à la main, sans
-- majuscules, accents, tirets ni « + ») ; consultation ordinaire (fièvre) refusée de même ;
-- acceptée sans cette ligne, ou si la situation est décochée avec un motif ; ligne de SP
-- ajoutée à une consultation validée refusée tant que la situation est en cours, pour un
-- habilité seulement (non-habilité : ni refus ni message) ; lignes figées ;
-- aide-soignant : une CPN en brouillon avec la case cochée ne s'ouvre pas ; fonctions
-- internes fermées au client.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape15b2b.sql, ou
-- tel quel dans le SQL Editor.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a15d-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e15d-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0d']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a15d-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé de Goudomp', 'poste_sante', 'SN', 'Goudomp')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b sage-femme, 0d aide-soignant.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a15d-0000000000' || c)::uuid, r, true, false
  from (values ('0b', 'sage_femme'), ('0d', 'aide_soignant')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a15d-0000000000' || p_code,
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
-- Consultation en brouillon de la sage-femme (CPN par défaut) ; renvoie { id, version }.
create function pg_temp.brouillon(p_patient uuid, p_draft jsonb, p_type text default 'cpn')
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform pg_temp.en_tant_que('0b');
  v := public.start_encounter(p_patient, null, pg_temp.type_cs(p_type));
  return jsonb_build_object('id', v ->> 'id', 'version',
    (public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
       jsonb_build_object('reason', 'CPN') || p_draft) ->> 'version')::integer);
end;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text),
  pg_temp.type_cs(text), pg_temp.brouillon(uuid, jsonb, text) to authenticated;

-- Fatou : 20 SA, sous cotrimoxazole depuis une première CPN.
do $$
declare
  v_p uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'B2B', 'Fatou', 'F', 29) returning id into v_p;
  perform set_config('test.fatou', v_p::text, true);
  perform set_config('test.ddr', (public.org_local_date(current_setting('test.org')::uuid) - 140)::text, true);
end $$;

set local role authenticated;
select pg_temp.en_tant_que('0b');
select public.open_pregnancy(current_setting('test.fatou')::uuid, 'lmp',
  current_setting('test.ddr')::date, null, null, null, 1, 0, 0);

do $$
declare
  b      jsonb;
  v_nom  text;
  v_type text;
  ligne jsonb := jsonb_build_object('product_name', 'Sulfadoxine-pyriméthamine', 'dosage', '500 mg + 25 mg',
                                    'dose_morning', 3, 'duration_days', 1);
begin
  b := pg_temp.brouillon(current_setting('test.fatou')::uuid,
         jsonb_build_object('maternite', jsonb_build_object('conditions', jsonb_build_array('cotrimoxazole'))));
  perform public.validate_encounter((b ->> 'id')::uuid, (b ->> 'version')::integer);

  -- Clé fixe de « Ajouter à l'ordonnance », même si le produit a été renommé.
  b := pg_temp.brouillon(current_setting('test.fatou')::uuid, jsonb_build_object(
         'prescription', jsonb_build_object('note', '', 'items', jsonb_build_array(
           ligne || jsonb_build_object('cle', 'maternite-tpi_sp', 'product_name', 'Antipaludique')))));
  perform set_config('test.brouillon', b::text, true);
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', b ->> 'id', b ->> 'version'),
                        '22023', 'Retirez « Antipaludique » de l''ordonnance');

  -- Ligne écrite à la main : nom reconnu sans majuscules, accents, tirets ni « + », en CPN
  -- comme dans une consultation ordinaire (fièvre).
  perform public.discard_encounter_draft((b ->> 'id')::uuid, (b ->> 'version')::integer);
  foreach v_nom in array array['Sulfadoxine pyrimethamine', 'SULFADOXINE-PYRIMÉTHAMINE',
                               'sulfadoxine + pyriméthamine', '  sulfadoxine–pyrimethamine '] loop
    foreach v_type in array array['cpn', 'consultation'] loop
      b := pg_temp.brouillon(current_setting('test.fatou')::uuid, jsonb_build_object(
             'prescription', jsonb_build_object('note', '', 'items', jsonb_build_array(
               ligne || jsonb_build_object('cle', 'x', 'product_name', v_nom)))), v_type);
      perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', b ->> 'id', b ->> 'version'),
                            '22023', 'Pas de SP pour une patiente sous cotrimoxazole');
      perform public.discard_encounter_draft((b ->> 'id')::uuid, (b ->> 'version')::integer);
    end loop;
  end loop;
  -- Consultation ordinaire : une case « conditions » vide dans son brouillon ne compte pas.
  b := pg_temp.brouillon(current_setting('test.fatou')::uuid, jsonb_build_object(
         'maternite', jsonb_build_object('conditions', '[]'::jsonb),
         'prescription', jsonb_build_object('note', '', 'items', jsonb_build_array(ligne))),
         'consultation');
  perform pg_temp.refus(format('select public.validate_encounter(%L, %s)', b ->> 'id', b ->> 'version'),
                        '22023', 'Pas de SP');
  perform public.discard_encounter_draft((b ->> 'id')::uuid, (b ->> 'version')::integer);

  -- Autre médicament : accepté.
  b := pg_temp.brouillon(current_setting('test.fatou')::uuid, jsonb_build_object(
         'prescription', jsonb_build_object('note', '', 'items', jsonb_build_array(
           jsonb_build_object('cle', 'maternite-fer_acide_folique', 'product_name', 'Fer + acide folique',
                              'dose_morning', 1, 'duration_days', 30)))));
  perform public.validate_encounter((b ->> 'id')::uuid, (b ->> 'version')::integer);
  perform set_config('test.validee', b ->> 'id', true);

  -- Ligne de SP ajoutée après coup à une consultation validée : refusée.
  perform pg_temp.refus(format('select public.add_prescription(%L, null, %L::jsonb)',
    b ->> 'id', jsonb_build_array(ligne)::text), '22023', 'Pas de SP');
  raise notice 'OK : sous cotrimoxazole, ordonnance avec la SP refusée (clé fixe même renommée ; nom écrit à la main avec ou sans tiret, accent, majuscules ou « + » ; CPN et consultation ordinaire ; ajout après validation) ; autre médicament accepté';
end $$;

reset role;

-- Déclencheur des lignes ajoutées après validation : non-habilité (aide-soignant) jamais
-- refusé ni prévenu ; habilité refusé. Lignes enregistrées figées.
do $$
declare
  v_ord uuid;
begin
  select id into v_ord from public.prescriptions where encounter_id = current_setting('test.validee')::uuid;
  perform set_config('fajkat.open_prescription', v_ord::text, true);
  perform pg_temp.en_tant_que('0d');
  insert into public.prescription_items (org_id, prescription_id, product_name, sort_order)
  values (current_setting('test.org')::uuid, v_ord, 'Sulfadoxine-pyriméthamine', 9);
  perform pg_temp.en_tant_que('0b');
  perform pg_temp.refus(format($q$insert into public.prescription_items (org_id, prescription_id, product_name, sort_order)
    values (%L, %L, 'sulfadoxine + pyrimethamine', 10)$q$, current_setting('test.org'), v_ord), '22023', 'Pas de SP');
  perform set_config('fajkat.open_prescription', '', true);
  perform pg_temp.refus(format($q$update public.prescription_items set product_name = 'Sulfadoxine-pyriméthamine'
    where prescription_id = %L$q$, v_ord), '42501', 'figée');
  raise notice 'OK : ligne ajoutée après validation : aide-soignant ni refusé ni prévenu, sage-femme refusée ; lignes d''ordonnance figées (aucun changement de nom possible)';
end $$;

set local role authenticated;

do $$
declare
  b jsonb;
begin
  -- Aide-soignant : une CPN en brouillon avec la case cochée ne s'ouvre pas.
  b := pg_temp.brouillon(current_setting('test.fatou')::uuid,
         jsonb_build_object('maternite', jsonb_build_object('conditions', jsonb_build_array('cotrimoxazole'))));
  perform pg_temp.en_tant_que('0d');
  perform pg_temp.refus(format('select public.get_encounter(%L)', b ->> 'id'), '42501', 'introuvable');
  perform pg_temp.en_tant_que('0b');

  -- Situation décochée avec un motif : la SP redevient possible dans cette même CPN.
  b := jsonb_build_object('id', b ->> 'id', 'version',
    (public.save_encounter_draft((b ->> 'id')::uuid, (b ->> 'version')::integer, jsonb_build_object(
       'reason', 'CPN',
       'maternite', jsonb_build_object('conditions', '[]'::jsonb,
         'condition_end_reasons', jsonb_build_object('cotrimoxazole', 'Traitement arrêté')),
       'prescription', jsonb_build_object('note', '', 'items', jsonb_build_array(
         jsonb_build_object('cle', 'maternite-tpi_sp', 'product_name', 'Sulfadoxine-pyriméthamine',
                            'dose_morning', 3, 'duration_days', 1))))) ->> 'version')::integer);
  perform public.validate_encounter((b ->> 'id')::uuid, (b ->> 'version')::integer);
  raise notice 'OK : aide-soignant refusé sur une CPN en brouillon « Sous cotrimoxazole » ; situation décochée avec un motif : SP acceptée';
end $$;
reset role;

do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'public.blocked_care_prescription(uuid, text[], text, text)',
    'public.drug_name_normalize(text)',
    'public.anc_prescription_check(public.encounters, jsonb, boolean)',
    'public.prescription_items_blocked_care()',
    'public.encounter_validate_extensions(public.encounters, jsonb)'] loop
    if has_function_privilege('anon', v_f, 'execute')
       or has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'ÉCHEC : % exécutable par le client', v_f;
    end if;
  end loop;
  raise notice 'OK : fonctions internes du correctif fermées au client';
end $$;

rollback;
