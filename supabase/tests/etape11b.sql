-- =============================================================================
-- Tests — étape 11b (Date de naissance estimée)
-- -----------------------------------------------------------------------------
-- Vérifie : indicateur birth_date_estimated écrit par l'application (accueil), jamais
-- sans date de naissance ; renvoyé par search_patients et find_duplicate_candidates ;
-- fusion : une date exacte remplace une date estimée, jamais l'inverse.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11b.sql
-- Prérequis : migrations des étapes 3 à 11b appliquées.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a11b-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11b-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '09']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11b-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 11b', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org')::uuid, '00000000-0000-4000-a11b-000000000009', 'accueil', true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11b-000000000009", "role": "authenticated"}', true);

do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_date date := ((now() at time zone 'Africa/Dakar')::date - interval '3 months')::date;
  v_id   uuid;
  v_r    record;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date,
                               birth_date_estimated, mother_first_name)
  values (v_org, 'Diallo', 'Awa', 'F', v_date, true, 'Mariama')
  returning id into v_id;
  perform set_config('test.enfant', v_id::text, true);

  select * into v_r from public.search_patients(v_org, 'diallo awa');
  if not v_r.birth_date_estimated or v_r.birth_date <> v_date
     or v_r.birth_year <> extract(year from v_date) then
    raise exception 'ÉCHEC : date estimée non enregistrée ou non renvoyée par la recherche';
  end if;
  raise notice 'OK : l''accueil enregistre une date estimée ; la recherche la renvoie';

  select * into v_r from public.find_duplicate_candidates(v_org, 'Diallo', 'Awa', null, 'Mariama');
  if v_r.reason <> 'meme_mere' or not v_r.birth_date_estimated then
    raise exception 'ÉCHEC : indicateur absent des doublons proposés';
  end if;
  raise notice 'OK : l''indicateur accompagne les doublons proposés';

  begin
    insert into public.patients (org_id, last_name, first_name, sex, declared_age,
                                 birth_date_estimated)
    values (v_org, 'Sy', 'Ali', 'M', 30, true);
    raise exception 'ÉCHEC : date estimée sans date de naissance acceptée';
  exception when check_violation then
    raise notice 'OK : jamais d''indicateur « estimée » sans date de naissance';
  end;

  -- Adulte sans date : l'indicateur reste faux par défaut.
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Ba', 'Oumar', 'M', 40) returning id into v_id;
  if (select birth_date_estimated from public.patients where id = v_id) then
    raise exception 'ÉCHEC : indicateur vrai par défaut';
  end if;
  raise notice 'OK : âge déclaré en années, indicateur faux';
end $$;

-- Fusion : le doublon a la date exacte, le dossier conservé une date estimée.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11b-00000000000a", "role": "authenticated"}', true);
do $$
declare
  v_org   uuid := current_setting('test.org')::uuid;
  v_exact date := ((now() at time zone 'Africa/Dakar')::date - interval '100 days')::date;
  v_doublon uuid;
  v_g     public.patients;
  v_avant date;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date)
  values (v_org, 'Diallo', 'Awa', 'F', v_exact) returning id into v_doublon;

  v_g := public.merge_patients(current_setting('test.enfant')::uuid, v_doublon);
  if v_g.birth_date <> v_exact or v_g.birth_date_estimated then
    raise exception 'ÉCHEC : la date exacte du doublon n''a pas remplacé la date estimée';
  end if;
  raise notice 'OK : fusion : la date exacte remplace la date estimée';

  -- L'inverse : un doublon à date estimée ne remplace pas une date exacte.
  v_avant := v_g.birth_date;
  insert into public.patients (org_id, last_name, first_name, sex, birth_date,
                               birth_date_estimated)
  values (v_org, 'Diallo', 'Awa', 'F', v_exact - 20, true) returning id into v_doublon;
  v_g := public.merge_patients(v_g.id, v_doublon);
  if v_g.birth_date <> v_avant or v_g.birth_date_estimated then
    raise exception 'ÉCHEC : une date estimée a remplacé une date exacte';
  end if;
  raise notice 'OK : fusion : une date estimée ne remplace jamais une date exacte';
end $$;

reset role;

rollback;
