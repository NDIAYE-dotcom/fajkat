-- =============================================================================
-- Tests — étape 14, partie D (ordonnance)
-- -----------------------------------------------------------------------------
-- Vérifie : formes des médicaments lisibles (comptées à l'unité ou en conditionnement) ;
-- ordonnance recopiée à la validation (demi-comprimé, quantité, consignes, ordre des
-- lignes) ; suggestions de noms (sans accents ni majuscules, au milieu du nom, un résultat
-- par nom et dosage, le plus prescrit d'abord, rien sous 2 caractères, rien d'une autre
-- structure) ; suggestions et contenu de l'ordonnance refusés à l'accueil, au caissier,
-- au comptable, à l'aide-soignant (suggestions) et à l'owner qui n'exerce pas ; aucune
-- lecture directe des tables ; fonction refusée à anon.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14e.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a14e-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14e-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '09', '06', '05', '0e']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14e-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 14E', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14e-00000000000b", "role": "authenticated"}', true);
select set_config('test.autre',
  public.create_organization('Poste de santé 14E bis', 'poste_sante', 'SN', 'Kolda')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0c infirmier, 0d aide-soignant, 09 accueil, 06 caissier,
-- 05 comptable ; 0e infirmier de l'autre structure.
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a14e-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('0d', 'aide_soignant'), ('09', 'accueil'),
               ('06', 'caissier'), ('05', 'comptable')) v(c, r);
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.autre')::uuid, '00000000-0000-4000-a14e-00000000000e', 'infirmier', true);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a14e-0000000000' || p_code,
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
-- Consultation hors passage, avec une ordonnance, validée.
create function pg_temp.consulter(p_org uuid, p_items jsonb)
returns uuid language plpgsql as $$
declare
  v_p uuid;
  v   jsonb;
  s   jsonb;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (p_org, 'Diop', 'Awa', 'F', 31) returning id into v_p;
  v := public.start_encounter(v_p, null);
  s := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
         jsonb_build_object('reason', 'Fièvre',
                            'prescription', jsonb_build_object('note', 'Revenir si la fièvre persiste',
                                                               'items', p_items)));
  perform public.validate_encounter((v ->> 'id')::uuid, (s ->> 'version')::integer);
  return (v ->> 'id')::uuid;
end;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text),
  pg_temp.consulter(uuid, jsonb) to authenticated;
grant execute on function pg_temp.refus(text, text, text) to anon;

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Formes des médicaments
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
begin
  if (select count(*) from public.drug_forms where is_active) < 8 then
    raise exception 'ÉCHEC : formes des médicaments absentes';
  end if;
  if not (select counted from public.drug_forms where code = 'comprime')
     or (select counted from public.drug_forms where code = 'sirop')
     or (select pack_unit from public.drug_forms where code = 'sirop') <> 'flacon' then
    raise exception 'ÉCHEC : formes comptées ou conditionnement';
  end if;
  if (select count(*) from public.drug_forms
       where code in ('collyre', 'spray', 'solution_inj', 'patch', 'implant', 'autre')) <> 6
     or (select counted from public.drug_forms where code = 'autre') then
    raise exception 'ÉCHEC : formes ajoutées (collyre… autre)';
  end if;
  raise notice 'OK : formes des médicaments lisibles';
end $$;

-- -----------------------------------------------------------------------------
-- Ordonnances validées
-- -----------------------------------------------------------------------------
do $$
declare
  v_c1 uuid;
  v_e  jsonb;
  v_i  jsonb;
begin
  v_c1 := pg_temp.consulter(current_setting('test.org')::uuid, jsonb_build_array(
    jsonb_build_object('product_name', 'Paracétamol', 'dosage', '500 mg', 'form', 'Comprimé',
      'route_code', 'orale', 'dose_morning', 1, 'dose_noon', 0, 'dose_evening', 1,
      'dose_night', 0, 'dose_unit', 'comprimé', 'duration_days', 3, 'quantity', 6,
      'quantity_unit', 'comprimés', 'instructions', 'Après le repas', 'saisies', '{}'::jsonb),
    jsonb_build_object('product_name', 'Amoxicilline', 'dosage', '500 mg', 'form', 'Gélule',
      'route_code', 'orale', 'dose_morning', 0.5, 'dose_evening', '0,5', 'duration_days', 7,
      'quantity', 7)));
  perform set_config('test.c1', v_c1::text, true);
  perform pg_temp.consulter(current_setting('test.org')::uuid, jsonb_build_array(
    jsonb_build_object('product_name', 'PARACETAMOL', 'dosage', '500 MG', 'form', 'Comprimé'),
    jsonb_build_object('product_name', 'Paracétamol', 'dosage', '1 g', 'form', 'Comprimé'),
    jsonb_build_object('product_name', 'Sirop contre la toux', 'form', 'Sirop',
                       'dose_morning', 1, 'quantity', 1, 'quantity_unit', 'flacon')));

  v_e := public.get_encounter(v_c1);
  if jsonb_array_length(v_e -> 'prescriptions') <> 1 then
    raise exception 'ÉCHEC : ordonnance non recopiée';
  end if;
  v_i := v_e #> '{prescriptions,0,items}';
  if v_i #>> '{0,product_name}' <> 'Paracétamol' or (v_i #>> '{1,dose_morning}')::numeric <> 0.5
     or (v_i #>> '{1,dose_evening}')::numeric <> 0.5 or (v_i #>> '{0,quantity}')::int <> 6
     or v_i #>> '{0,instructions}' <> 'Après le repas'
     or v_e #>> '{prescriptions,0,note}' <> 'Revenir si la fièvre persiste'
     or v_e #>> '{prescriptions,0,prescriber_name}' <> 'Test 0c' then
    raise exception 'ÉCHEC : lignes de l''ordonnance %', v_i;
  end if;
  raise notice 'OK : ordonnance recopiée à la validation (demi-comprimé, quantité, consignes)';
end $$;

select pg_temp.refus($$select public.add_prescription(current_setting('test.c1')::uuid, null,
  '[{"product_name": "Paracétamol", "dose_morning": "1/2"}]')$$, '22023', 'tapez un nombre');
do $$ begin raise notice 'OK : posologie illisible refusée par la base'; end $$;

-- Autre structure : un médicament qui ne doit jamais apparaître dans la première.
select pg_temp.en_tant_que('0e');
select pg_temp.consulter(current_setting('test.autre')::uuid,
  '[{"product_name": "Paracétamol codéiné", "dosage": "500 mg"}]');

-- -----------------------------------------------------------------------------
-- Suggestions de noms
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_n integer;
  v_premier record;
begin
  select count(*) into v_n
    from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'parac');
  if v_n <> 2 then
    raise exception 'ÉCHEC : un résultat par nom et dosage attendu (2), obtenu %', v_n;
  end if;
  select * into v_premier
    from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'PARACÉ') limit 1;
  if v_premier.uses <> 2 or v_premier.dosage not ilike '500 mg' or v_premier.form <> 'Comprimé'
     or v_premier.product_id is not null or v_premier.stock is not null then
    raise exception 'ÉCHEC : le plus prescrit d''abord, sans accents : %', v_premier;
  end if;
  if exists (select 1 from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'parac')
              where product_name ilike '%codéiné%') then
    raise exception 'ÉCHEC : médicament d''une autre structure suggéré';
  end if;
  if (select count(*) from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'toux')) <> 1 then
    raise exception 'ÉCHEC : recherche au milieu du nom';
  end if;
  if exists (select 1 from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'p')) then
    raise exception 'ÉCHEC : suggestion sous 2 caractères';
  end if;
  -- Les noms qui commencent par la saisie passent avant ceux qui la contiennent.
  select * into v_premier
    from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'si') limit 1;
  if v_premier.product_name <> 'Sirop contre la toux' then
    raise exception 'ÉCHEC : début du nom d''abord : %', v_premier;
  end if;
  raise notice 'OK : suggestions (accents, milieu du nom, nom et dosage, structure, 2 caractères)';
end $$;

-- Ligne de plus de 24 mois : plus suggérée (date vieillie hors des verrous, pour le test).
do $$
begin
  if not exists (select 1 from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'amox')) then
    raise exception 'ÉCHEC : ligne récente non suggérée';
  end if;
end $$;
reset role;
set local session_replication_role = replica;
update public.prescription_items set created_at = now() - interval '25 months'
 where org_id = current_setting('test.org')::uuid and product_name = 'Amoxicilline';
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
begin
  if exists (select 1 from public.prescription_name_suggestions(current_setting('test.org')::uuid, 'amox')) then
    raise exception 'ÉCHEC : ligne de plus de 24 mois suggérée';
  end if;
  raise notice 'OK : lignes de plus de 24 mois ignorées';
end $$;

-- -----------------------------------------------------------------------------
-- Confidentialité
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
begin
  foreach v_code in array array['09', '06', '05', '0a', '0d'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format($f$select * from public.prescription_name_suggestions(%L, 'parac')$f$,
                                 current_setting('test.org')), '42501', 'réservée aux soignants');
  end loop;
  foreach v_code in array array['09', '06', '05', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select public.get_encounter(%L)', current_setting('test.c1')),
                          '42501');
    perform pg_temp.refus('select * from public.prescription_items', '42501');
    perform pg_temp.refus('select * from public.prescriptions', '42501');
  end loop;
  -- Aide-soignant : lit la consultation (et l'ordonnance), ne rédige pas.
  perform pg_temp.en_tant_que('0d');
  if jsonb_array_length(public.get_encounter(current_setting('test.c1')::uuid) -> 'prescriptions') <> 1 then
    raise exception 'ÉCHEC : aide-soignant, ordonnance non lue';
  end if;
  perform pg_temp.refus(format($f$select public.add_prescription(%L, null, '[{"product_name": "Fer"}]')$f$,
                               current_setting('test.c1')), '42501');
  raise notice 'OK : ordonnance et suggestions refusées aux rôles non médicaux';
end $$;

-- -----------------------------------------------------------------------------
-- Libellés wolof : organizations.settings.prescription_labels (owner et admin écrivent,
-- les soignants lisent)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
select public.update_org_settings(current_setting('test.org')::uuid,
  '{"prescription_labels": {"wo": {"matin": "Suba", "midi": "Bëccëg", "soir": "Ngoon", "nuit": "Guddi bi"}}}');
select pg_temp.en_tant_que('0c');
do $$
begin
  if (select settings #>> '{prescription_labels,wo,nuit}' from public.organizations
       where id = current_setting('test.org')::uuid) is distinct from 'Guddi bi' then
    raise exception 'ÉCHEC : libellés wolof non lus par l''infirmier';
  end if;
  raise notice 'OK : libellés wolof en base, lus par les soignants';
end $$;
do $$
declare
  v_code text;
begin
  foreach v_code in array array['0c', '09', '06'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format($f$select public.update_org_settings(%L,
      '{"prescription_labels": {"wo": {"nuit": "X"}}}')$f$, current_setting('test.org')), '42501');
  end loop;
  raise notice 'OK : libellés wolof modifiables par owner et admin seulement';
end $$;

reset role;
set local role anon;
select pg_temp.refus($$select * from public.prescription_name_suggestions(gen_random_uuid(), 'parac')$$,
                     '42501');
do $$ begin raise notice 'OK : suggestions refusées à anon'; end $$;

rollback;
