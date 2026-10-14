-- =============================================================================
-- Tests RLS — étape 3 (socle)
-- -----------------------------------------------------------------------------
-- Prouve qu'un utilisateur A ne voit ni la structure de B ni ses membres, et
-- vérifie les principaux garde-fous du socle.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape03.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migration de l'étape 3 appliquée (elle contient les données de référence).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation (en tant que postgres) : deux comptes fictifs A et B
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated',
   'test-a@fajkat.invalid', '{"full_name": "Aïssatou Test A"}', now(), now()),
  ('00000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated',
   'test-b@fajkat.invalid', '{"full_name": "Babacar Test B"}', now(), now());

do $$
begin
  if (select count(*) from public.profiles
      where id in ('00000000-0000-4000-a000-00000000000a',
                   '00000000-0000-4000-a000-00000000000b')) <> 2 then
    raise exception 'ÉCHEC : handle_new_user n''a pas créé les deux profils';
  end if;
  if (select full_name from public.profiles
      where id = '00000000-0000-4000-a000-00000000000a') <> 'Aïssatou Test A' then
    raise exception 'ÉCHEC : full_name non repris des métadonnées';
  end if;
  raise notice 'OK : profils créés à l''inscription';
end $$;

-- Les identifiants des structures créées sont gardés dans des réglages locaux.
set local role authenticated;

-- B crée sa clinique.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);

-- A crée son poste de santé.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

-- -----------------------------------------------------------------------------
-- Vérifications en tant que A
-- -----------------------------------------------------------------------------
do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_org_b uuid := current_setting('test.org_b')::uuid;
  v_n     integer;
begin
  -- create_organization : structure en essai, abonnement d'essai, owner.
  if (select status from public.organizations where id = v_org_a) <> 'trial' then
    raise exception 'ÉCHEC : la structure de A n''est pas en essai';
  end if;
  if (select count(*) from public.subscriptions
      where org_id = v_org_a and status = 'trial') <> 1 then
    raise exception 'ÉCHEC : abonnement d''essai absent';
  end if;
  if (select role from public.memberships where org_id = v_org_a) <> 'owner' then
    raise exception 'ÉCHEC : A n''est pas owner de sa structure';
  end if;
  raise notice 'OK : create_organization crée structure, essai et owner';

  -- A ne voit que sa structure.
  select count(*) into v_n from public.organizations;
  if v_n <> 1 then
    raise exception 'ÉCHEC : A voit % structure(s) au lieu de 1', v_n;
  end if;
  if exists (select 1 from public.organizations where id = v_org_b) then
    raise exception 'ÉCHEC : A voit la structure de B';
  end if;
  raise notice 'OK : A ne voit pas la structure de B';

  -- A ne voit pas les membres de B.
  if exists (select 1 from public.memberships where org_id = v_org_b) then
    raise exception 'ÉCHEC : A voit les membres de B';
  end if;
  if exists (select 1 from public.profiles
             where id = '00000000-0000-4000-a000-00000000000b') then
    raise exception 'ÉCHEC : A voit le profil de B';
  end if;
  raise notice 'OK : A ne voit ni les memberships ni le profil de B';

  -- Abonnement, journal et fonctionnalités de B : invisibles.
  if exists (select 1 from public.subscriptions where org_id = v_org_b) then
    raise exception 'ÉCHEC : A voit l''abonnement de B';
  end if;
  if exists (select 1 from public.audit_logs where org_id = v_org_b) then
    raise exception 'ÉCHEC : A voit le journal d''audit de B';
  end if;
  if cardinality(public.org_features(v_org_b)) <> 0 then
    raise exception 'ÉCHEC : A obtient les fonctionnalités de B';
  end if;
  if public.is_member(v_org_b) or public.has_role(v_org_b, array['owner']) then
    raise exception 'ÉCHEC : is_member / has_role vrais pour B';
  end if;
  raise notice 'OK : abonnement, audit et fonctionnalités de B invisibles';

  -- A ne peut pas modifier la structure de B (0 ligne touchée).
  update public.organizations set name = 'Piratée' where id = v_org_b;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : A a modifié la structure de B';
  end if;
  raise notice 'OK : A ne peut pas modifier la structure de B';

  -- A ne peut pas s'ajouter dans la structure de B.
  begin
    insert into public.memberships (org_id, user_id, role)
    values (v_org_b, '00000000-0000-4000-a000-00000000000a', 'admin');
    raise exception 'ÉCHEC : A s''est ajouté dans la structure de B';
  exception when insufficient_privilege then
    raise notice 'OK : A ne peut pas s''ajouter dans la structure de B';
  end;

  -- Fonctionnalités de sa propre structure : 26 pour un poste de santé.
  if cardinality(public.org_features(v_org_a)) <> 26 then
    raise exception 'ÉCHEC : % fonctionnalités pour le poste au lieu de 26',
      cardinality(public.org_features(v_org_a));
  end if;
  if not public.org_has_feature(v_org_a, 'communautaire')
     or public.org_has_feature(v_org_a, 'hospitalisation') then
    raise exception 'ÉCHEC : org_has_feature ne respecte pas le plan';
  end if;
  raise notice 'OK : fonctionnalités du poste conformes au plan';

  -- Même owner, A ne peut pas changer lui-même le statut de sa structure.
  begin
    update public.organizations set status = 'active' where id = v_org_a;
    raise exception 'ÉCHEC : A a changé le statut de sa structure';
  exception when insufficient_privilege then
    raise notice 'OK : le statut n''est modifiable que côté serveur';
  end;

  -- Le journal d'audit est lisible par l'owner, mais jamais modifiable.
  if not exists (select 1 from public.audit_logs where org_id = v_org_a) then
    raise exception 'ÉCHEC : journal d''audit vide pour la structure de A';
  end if;
  begin
    delete from public.audit_logs where org_id = v_org_a;
    raise exception 'ÉCHEC : A a supprimé des lignes du journal';
  exception when insufficient_privilege then
    raise notice 'OK : journal d''audit lisible par l''owner et non modifiable';
  end;

  -- Le dernier owner ne peut pas se rétrograder.
  begin
    update public.memberships set role = 'admin'
    where org_id = v_org_a and user_id = '00000000-0000-4000-a000-00000000000a';
    raise exception 'ÉCHEC : le dernier owner a pu se rétrograder';
  exception when check_violation then
    raise notice 'OK : la structure garde au moins un owner';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Vérifications en visiteur anonyme
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

do $$
begin
  if (select count(*) from public.plans) <> 2 then
    raise exception 'ÉCHEC : les plans ne sont pas lisibles publiquement';
  end if;
  -- Référentiels livrés par la migration (sans seed).
  if (select count(*) from public.countries) <> 8
     or (select count(*) from public.countries where is_active) <> 1
     or (select count(*) from public.features) <> 38
     or (select count(*) from public.plan_features) <> 60
     or (select count(distinct famille) from public.features) <> 3
     or (select module from public.features where code = 'vaccination') <> 'enfant'
     or (select count(*) from public.features
         where code in ('file_attente', 'tickets_consultation') and module = 'accueil') <> 2 then
    raise exception 'ÉCHEC : référentiels incomplets (pays, features, famille ou module)';
  end if;
  raise notice 'OK : référentiels complets (8 pays, 2 plans, 38 features, 60 liaisons)';
  begin
    perform 1 from public.organizations;
    raise exception 'ÉCHEC : un visiteur anonyme lit les structures';
  exception when insufficient_privilege then
    raise notice 'OK : plans publics, structures fermées aux anonymes';
  end;
end $$;

reset role;

-- Rien n'est conservé : comptes, structures et journal de test disparaissent.
rollback;
