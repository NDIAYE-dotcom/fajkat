-- =============================================================================
-- Tests RLS — étape 7 (assistant de démarrage)
-- -----------------------------------------------------------------------------
-- Prouve l'isolement entre deux structures pour services, payers,
-- pending_invitations, organizations.settings et le bucket « logos », et qu'un
-- membre simple lit sans pouvoir écrire.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape07.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3, 6 et 7 appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation : A (poste de santé), B (clinique), C (infirmier chez A)
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a700-00000000000a', 'authenticated', 'authenticated',
   'e7-a@fajkat.invalid', '{"full_name": "Aminata Test A"}', now(), now()),
  ('00000000-0000-4000-a700-00000000000b', 'authenticated', 'authenticated',
   'e7-b@fajkat.invalid', '{"full_name": "Bineta Test B"}', now(), now()),
  ('00000000-0000-4000-a700-00000000000c', 'authenticated', 'authenticated',
   'e7-c@fajkat.invalid', '{"full_name": "Cheikh Test C"}', now(), now());

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a700-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a700-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org_a')::uuid, '00000000-0000-4000-a700-00000000000c',
        'infirmier', true);

-- Identifiants fixes des lignes créées par A.
select set_config('test.service_a', '00000000-0000-4000-b700-000000000001', true);
select set_config('test.payer_a',   '00000000-0000-4000-b700-000000000002', true);
select set_config('test.invit_a',   '00000000-0000-4000-b700-000000000003', true);

-- -----------------------------------------------------------------------------
-- A (owner) : écritures autorisées dans sa structure
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a700-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a    uuid := current_setting('test.org_a')::uuid;
  v_settings jsonb;
  v_n        integer;
begin
  -- Référentiel lisible, sans aucun tarif.
  if (select count(*) from public.service_templates where plan_code = 'poste_sante') = 0 then
    raise exception 'ÉCHEC : aucun service proposé pour le poste de santé';
  end if;
  raise notice 'OK : services proposés lisibles';

  -- Services : tarif vide accepté, envoi rejouable sans doublon.
  perform public.save_services(v_org_a, jsonb_build_array(
    jsonb_build_object('id', current_setting('test.service_a'), 'template_code', 'cpn',
                       'label', 'Consultation prénatale (CPN)', 'category', 'maternite',
                       'price', null),
    jsonb_build_object('id', '00000000-0000-4000-b700-000000000011',
                       'label', 'Pansement', 'category', 'soins', 'price', 1000)));
  perform public.save_services(v_org_a, jsonb_build_array(
    jsonb_build_object('id', current_setting('test.service_a'), 'template_code', 'cpn',
                       'label', 'Consultation prénatale (CPN)', 'category', 'maternite',
                       'price', null)));
  select count(*) into v_n from public.services where org_id = v_org_a;
  if v_n <> 2 then
    raise exception 'ÉCHEC : % service(s) au lieu de 2 après un envoi rejoué', v_n;
  end if;
  raise notice 'OK : services enregistrés, envoi rejouable sans doublon';

  begin
    perform public.save_services(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'label', 'Négatif', 'price', -5)));
    raise exception 'ÉCHEC : tarif négatif accepté';
  exception when check_violation then
    raise notice 'OK : tarif négatif refusé';
  end;

  -- Retrait doux.
  perform public.save_services(v_org_a, jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-4000-b700-000000000011', 'removed', true)));
  if (select deleted_at from public.services
      where id = '00000000-0000-4000-b700-000000000011') is null then
    raise exception 'ÉCHEC : service non retiré';
  end if;
  raise notice 'OK : retrait doux d''un service';

  -- Aucune suppression physique.
  begin
    delete from public.services where org_id = v_org_a;
    raise exception 'ÉCHEC : suppression physique autorisée';
  exception when insufficient_privilege then
    raise notice 'OK : suppression physique refusée';
  end;

  -- Tiers payant : taux vide accepté, taux hors bornes refusé.
  perform public.save_payers(v_org_a, jsonb_build_array(
    jsonb_build_object('id', current_setting('test.payer_a'), 'kind', 'sen_csu',
                       'name', 'SEN-CSU', 'coverage_rate', null)));
  begin
    perform public.save_payers(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'kind', 'ipm', 'name', 'IPM X',
                         'coverage_rate', 120)));
    raise exception 'ÉCHEC : taux de 120 %% accepté';
  exception when check_violation then
    raise notice 'OK : tiers payant enregistré, taux hors bornes refusé';
  end;

  -- Invitations : contact obligatoire, jamais le rôle owner.
  perform public.save_pending_invitations(v_org_a, jsonb_build_array(
    jsonb_build_object('id', current_setting('test.invit_a'), 'full_name', 'Fatou Sow',
                       'phone', '+221771234567', 'role', 'sage_femme')));
  begin
    perform public.save_pending_invitations(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'full_name', 'Moussa Fall',
                         'phone', '+221770000000', 'role', 'owner')));
    raise exception 'ÉCHEC : invitation au rôle owner acceptée';
  exception when check_violation then
    raise notice 'OK : rôle owner refusé dans les invitations';
  end;
  begin
    perform public.save_pending_invitations(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'full_name', 'Sans Contact',
                         'role', 'accueil')));
    raise exception 'ÉCHEC : invitation sans téléphone ni e-mail acceptée';
  exception when check_violation then
    raise notice 'OK : invitation sans contact refusée';
  end;

  -- Réglages : fusion sans écraser les autres clés.
  perform public.update_org_settings(v_org_a, '{"onboarding": {"etapes": {"identite": "faite"}}}');
  v_settings := public.update_org_settings(v_org_a, '{"opening_hours": {"lundi": {"ouvert": true}}}');
  if not (v_settings ? 'onboarding' and v_settings ? 'opening_hours') then
    raise exception 'ÉCHEC : update_org_settings a écrasé une clé : %', v_settings;
  end if;
  raise notice 'OK : réglages fusionnés';

  -- Logo : dépôt dans son dossier.
  insert into storage.objects (bucket_id, name)
  values ('logos', v_org_a::text || '/logo-test.webp');
  raise notice 'OK : A dépose un logo dans son dossier';
end $$;

-- -----------------------------------------------------------------------------
-- B (owner d'une autre structure) : rien de A n'est visible ni modifiable
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a700-00000000000b", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_org_b uuid := current_setting('test.org_b')::uuid;
  v_n     integer;
begin
  if exists (select 1 from public.services where org_id = v_org_a)
     or exists (select 1 from public.payers where org_id = v_org_a)
     or exists (select 1 from public.pending_invitations where org_id = v_org_a) then
    raise exception 'ÉCHEC : B voit des données de A';
  end if;
  raise notice 'OK : B ne voit ni les services, ni les tiers payants, ni les invitations de A';

  update public.services set price = 1 where org_id = v_org_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : B a modifié un service de A';
  end if;
  update public.payers set coverage_rate = 1 where org_id = v_org_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : B a modifié un tiers payant de A';
  end if;
  raise notice 'OK : B ne modifie rien chez A (0 ligne)';

  begin
    perform public.save_services(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'label', 'Intrus', 'price', 1)));
    raise exception 'ÉCHEC : B a ajouté un service chez A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne peut pas ajouter de service chez A';
  end;

  begin
    perform public.save_pending_invitations(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'full_name', 'Intrus',
                         'email', 'intrus@fajkat.invalid', 'role', 'admin')));
    raise exception 'ÉCHEC : B a ajouté une invitation chez A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne peut pas ajouter d''invitation chez A';
  end;

  -- Réutiliser l'identifiant d'un service de A, depuis sa propre structure : refusé ou sans effet.
  begin
    perform public.save_services(v_org_b, jsonb_build_array(
      jsonb_build_object('id', current_setting('test.service_a'), 'label', 'Détourné',
                         'price', 1)));
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.update_org_settings(v_org_a, '{"onboarding": {}}');
    raise exception 'ÉCHEC : B a modifié les réglages de A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne modifie pas les réglages de A';
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('logos', v_org_a::text || '/logo-intrus.webp');
    raise exception 'ÉCHEC : B a déposé un logo chez A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne dépose pas de logo chez A';
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('logos', 'pas-un-uuid/logo.webp');
    raise exception 'ÉCHEC : logo accepté hors d''un dossier de structure';
  exception when insufficient_privilege then
    raise notice 'OK : logo refusé hors d''un dossier de structure';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- C (infirmier chez A) : lit, n'écrit pas
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a700-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_n     integer;
begin
  if (select label from public.services where id = current_setting('test.service_a')::uuid)
     is distinct from 'Consultation prénatale (CPN)' then
    raise exception 'ÉCHEC : C ne lit pas le service de A, ou B l''a modifié';
  end if;
  if not exists (select 1 from public.payers where org_id = v_org_a)
     or not exists (select 1 from public.pending_invitations where org_id = v_org_a) then
    raise exception 'ÉCHEC : C ne lit pas les tiers payants ou les invitations de A';
  end if;
  raise notice 'OK : un membre simple lit les données de sa structure (intactes)';

  update public.services set price = 1 where org_id = v_org_a;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : un infirmier a modifié un tarif';
  end if;

  begin
    perform public.save_payers(v_org_a, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'kind', 'mutuelle', 'name', 'Mutuelle X')));
    raise exception 'ÉCHEC : un infirmier a ajouté un tiers payant';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.update_org_settings(v_org_a, '{"onboarding": {}}');
    raise exception 'ÉCHEC : un infirmier a modifié les réglages';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('logos', v_org_a::text || '/logo-c.webp');
    raise exception 'ÉCHEC : un infirmier a déposé un logo';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK : un membre simple ne modifie ni services, ni tiers payants, ni réglages, ni logo';
end $$;

-- -----------------------------------------------------------------------------
-- Visiteur anonyme : aucun accès
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

do $$
begin
  begin
    perform 1 from public.services;
    raise exception 'ÉCHEC : un visiteur anonyme lit les services';
  exception when insufficient_privilege then
    raise notice 'OK : services fermés aux anonymes';
  end;
end $$;

reset role;

-- Rien n'est conservé.
rollback;
