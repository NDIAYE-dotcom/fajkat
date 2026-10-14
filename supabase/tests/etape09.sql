-- =============================================================================
-- Tests — étape 9 (Personnel : membres et invitations)
-- -----------------------------------------------------------------------------
-- Vérifie : invitations réservées à owner et admin, jeton jamais lisible, page
-- publique sans fuite, acceptation unique (expiration, annulation, nouveau lien),
-- max_users, garde-fous des membres (pas d'ajout direct, pas de modification de
-- son propre accès), reprise des invitations de l'assistant, et création d'un compte
-- par lien : invitation acceptée dans la même transaction, ou compte non créé.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape09.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3, 6, 7 et 9 appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation
--   A : owner du poste de santé ; B : owner d'une clinique ;
--   C : infirmier chez A ; D : compte existant, sans structure.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a900-00000000000a', 'authenticated', 'authenticated',
   'e9-a@fajkat.invalid', '{"full_name": "Aminata Test A"}', now(), now()),
  ('00000000-0000-4000-a900-00000000000b', 'authenticated', 'authenticated',
   'e9-b@fajkat.invalid', '{"full_name": "Bineta Test B"}', now(), now()),
  ('00000000-0000-4000-a900-00000000000c', 'authenticated', 'authenticated',
   'e9-c@fajkat.invalid', '{"full_name": "Cheikh Test C"}', now(), now()),
  ('00000000-0000-4000-a900-00000000000d', 'authenticated', 'authenticated',
   'e9-d@fajkat.invalid', '{"full_name": "Daouda Test D"}', now(), now());

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org_a')::uuid, '00000000-0000-4000-a900-00000000000c',
        'infirmier', true);

-- -----------------------------------------------------------------------------
-- A (owner) : inviter, lire, annuler, renouveler
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_inv   record;
  v_old   text;
begin
  select * into v_inv from public.create_invitation(
    v_org_a, 'sage_femme', 'Fatou Test', '+221771112233', null, 'whatsapp');
  if v_inv.token !~ '^[0-9a-f]{64}$' or v_inv.expires_at < now() + interval '6 days 23 hours' then
    raise exception 'ÉCHEC : jeton ou expiration de l''invitation incorrects';
  end if;
  perform set_config('test.token_d', v_inv.token, true);
  perform set_config('test.inv_d', v_inv.invitation_id::text, true);
  raise notice 'OK : invitation créée (jeton de 64 caractères, valable 7 jours)';

  if (select count(*) from public.invitations where org_id = v_org_a) <> 1 then
    raise exception 'ÉCHEC : A ne lit pas ses invitations';
  end if;
  begin
    perform token_hash from public.invitations;
    raise exception 'ÉCHEC : token_hash lisible depuis le client';
  exception when insufficient_privilege then
    raise notice 'OK : le hachage du jeton n''est jamais lisible';
  end;

  -- Le jeton en clair n'est stocké nulle part, pas même dans le journal.
  if exists (select 1 from public.audit_logs
             where table_name = 'invitations' and new_data::text like '%' || v_inv.token || '%') then
    raise exception 'ÉCHEC : jeton en clair dans le journal d''audit';
  end if;
  raise notice 'OK : jeton en clair absent du journal';

  -- Un propriétaire ne s'invite pas.
  begin
    perform public.create_invitation(v_org_a, 'owner', 'Faux Owner', '+221770000000');
    raise exception 'ÉCHEC : invitation au rôle owner acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : le rôle owner ne s''invite pas';
  end;

  -- Annuler puis renouveler une autre invitation.
  select * into v_inv from public.create_invitation(
    v_org_a, 'accueil', 'Ndèye Test', null, 'ndeye@fajkat.invalid', 'email');
  perform set_config('test.token_revoked', v_inv.token, true);
  perform public.revoke_invitation(v_inv.invitation_id);
  begin
    perform public.renew_invitation(v_inv.invitation_id);
    raise exception 'ÉCHEC : une invitation annulée a été renouvelée';
  exception when invalid_parameter_value then
    raise notice 'OK : invitation annulée, plus renouvelable';
  end;

  select * into v_inv from public.create_invitation(
    v_org_a, 'caissier', 'Moussa Test', '+221775556677', null, 'lien');
  v_old := v_inv.token;
  select * into v_inv from public.renew_invitation(v_inv.invitation_id, 'whatsapp');
  if v_inv.token = v_old then
    raise exception 'ÉCHEC : le renouvellement garde le même jeton';
  end if;
  perform set_config('test.token_old', v_old, true);
  perform set_config('test.token_renewed', v_inv.token, true);
  raise notice 'OK : nouveau lien, l''ancien est remplacé';
end $$;

-- -----------------------------------------------------------------------------
-- C (infirmier) et B (autre structure) : aucun accès aux invitations de A
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
begin
  if exists (select 1 from public.invitations) then
    raise exception 'ÉCHEC : un infirmier lit les invitations';
  end if;
  begin
    perform public.create_invitation(v_org_a, 'accueil', 'Intrus', '+221770000001');
    raise exception 'ÉCHEC : un infirmier a créé une invitation';
  exception when insufficient_privilege then
    raise notice 'OK : un infirmier ne lit ni ne crée d''invitation';
  end;
  update public.memberships set role = 'admin'
   where user_id = '00000000-0000-4000-a900-00000000000c';
  if (select role from public.memberships
      where user_id = '00000000-0000-4000-a900-00000000000c') <> 'infirmier' then
    raise exception 'ÉCHEC : un infirmier s''est promu administrateur';
  end if;
  raise notice 'OK : un infirmier ne change pas son propre rôle';
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000b", "role": "authenticated"}', true);

do $$
begin
  if exists (select 1 from public.invitations
             where org_id = current_setting('test.org_a')::uuid) then
    raise exception 'ÉCHEC : B lit les invitations de A';
  end if;
  begin
    perform public.revoke_invitation(current_setting('test.inv_d')::uuid);
    raise exception 'ÉCHEC : B a annulé une invitation de A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne voit ni n''annule les invitations de A';
  end;
  begin
    insert into public.memberships (org_id, user_id, role)
    values (current_setting('test.org_b')::uuid, '00000000-0000-4000-a900-00000000000d', 'medecin');
    raise exception 'ÉCHEC : ajout direct d''un membre accepté';
  exception when insufficient_privilege then
    raise notice 'OK : aucun ajout direct de membre, même par un owner';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Visiteur anonyme : page publique seulement
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

do $$
declare
  v record;
begin
  select * into v from public.get_invitation_public(current_setting('test.token_d'));
  if v.status <> 'valid' or v.org_name <> 'Poste de santé de A' or v.role <> 'sage_femme' then
    raise exception 'ÉCHEC : page publique incorrecte (%)', v.status;
  end if;
  select * into v from public.get_invitation_public(repeat('0', 64));
  if v.status <> 'unknown' or v.org_name is not null then
    raise exception 'ÉCHEC : un jeton inconnu révèle des informations';
  end if;
  select * into v from public.get_invitation_public(current_setting('test.token_revoked'));
  if v.status <> 'revoked' then
    raise exception 'ÉCHEC : invitation annulée vue comme %', v.status;
  end if;
  select * into v from public.get_invitation_public(current_setting('test.token_old'));
  if v.status <> 'unknown' then
    raise exception 'ÉCHEC : l''ancien lien fonctionne encore après renouvellement';
  end if;
  raise notice 'OK : page publique (valide, inconnu, annulé, ancien lien)';

  begin
    perform public.accept_invitation(current_setting('test.token_d'));
    raise exception 'ÉCHEC : un anonyme a accepté une invitation';
  exception when insufficient_privilege then
    raise notice 'OK : accept_invitation fermée aux anonymes';
  end;
  begin
    perform 1 from public.invitations;
    raise exception 'ÉCHEC : un anonyme lit les invitations';
  exception when insufficient_privilege then
    raise notice 'OK : invitations fermées aux anonymes';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- D (compte existant) : rejoint une seule fois
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000d", "role": "authenticated"}', true);

do $$
declare
  v_org uuid;
begin
  begin
    perform public.accept_invitation(current_setting('test.token_revoked'));
    raise exception 'ÉCHEC : invitation annulée acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : invitation annulée refusée';
  end;

  v_org := public.accept_invitation(current_setting('test.token_d'));
  if v_org <> current_setting('test.org_a')::uuid
     or not public.has_role(v_org, array['sage_femme']) then
    raise exception 'ÉCHEC : D n''a pas rejoint A avec le rôle prévu';
  end if;
  raise notice 'OK : D rejoint A comme sage-femme';

  begin
    perform public.accept_invitation(current_setting('test.token_d'));
    raise exception 'ÉCHEC : un lien a servi deux fois';
  exception when invalid_parameter_value then
    raise notice 'OK : lien à usage unique';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- A : arrivée tracée, désactivation, garde-fous, max_users
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
begin
  if (select invited_by from public.memberships
      where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000d')
     is distinct from '00000000-0000-4000-a900-00000000000a'::uuid then
    raise exception 'ÉCHEC : « invité par » non renseigné';
  end if;
  if (select status from public.invitations where id = current_setting('test.inv_d')::uuid)
     <> 'accepted' then
    raise exception 'ÉCHEC : invitation non marquée acceptée';
  end if;
  raise notice 'OK : l''owner voit qui a invité D et quand';

  begin
    update public.memberships set is_active = false
     where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000a';
    raise exception 'ÉCHEC : A s''est désactivé lui-même';
  exception when invalid_parameter_value or check_violation then
    raise notice 'OK : personne ne se désactive soi-même';
  end;

  update public.memberships set is_active = false
   where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000d';
  raise notice 'OK : D désactivé (jamais supprimé)';

  -- Offre limitée à 3 utilisateurs : A, C actifs + 1 invitation valide = 3.
  reset role;
  update public.plans set max_users = 3 where code = 'poste_sante';
  set local role authenticated;

  begin
    perform public.create_invitation(v_org_a, 'accueil', 'De trop', '+221770000002');
    raise exception 'ÉCHEC : max_users dépassé par une invitation';
  exception when invalid_parameter_value then
    raise notice 'OK : max_users compte membres actifs et invitations valides';
  end;

  -- La réactivation ne compte que les membres actifs (A, C + D = 3) : elle passe.
  update public.memberships set is_active = true
   where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000d';
  -- Offre complète : la page publique le dit avant toute création de compte.
  if (select status from public.get_invitation_public(current_setting('test.token_renewed')))
     <> 'full' then
    raise exception 'ÉCHEC : offre complète non signalée sur la page publique';
  end if;
  raise notice 'OK : offre complète signalée sur la page publique';
  -- Offre ramenée à 2 : D, désactivé, ne peut plus être réactivé.
  reset role;
  update public.plans set max_users = 2 where code = 'poste_sante';
  set local role authenticated;
  begin
    update public.memberships set is_active = false
     where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000d';
    update public.memberships set is_active = true
     where org_id = v_org_a and user_id = '00000000-0000-4000-a900-00000000000d';
    raise exception 'ÉCHEC : réactivation au-delà de max_users';
  exception when invalid_parameter_value then
    raise notice 'OK : max_users respecté à la réactivation';
  end;
  reset role;
  update public.plans set max_users = null where code = 'poste_sante';
  set local role authenticated;
end $$;

-- -----------------------------------------------------------------------------
-- Un admin ne modifie pas son propre accès (C promu admin pour ce test)
-- -----------------------------------------------------------------------------
reset role;
update public.memberships set role = 'admin'
 where org_id = current_setting('test.org_a')::uuid
   and user_id = '00000000-0000-4000-a900-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000c", "role": "authenticated"}', true);

do $$
begin
  begin
    update public.memberships set is_active = false
     where org_id = current_setting('test.org_a')::uuid
       and user_id = '00000000-0000-4000-a900-00000000000c';
    raise exception 'ÉCHEC : un admin s''est désactivé lui-même';
  exception when invalid_parameter_value then
    raise notice 'OK : un admin ne modifie pas son propre accès';
  end;
  begin
    update public.memberships set role = 'medecin'
     where org_id = current_setting('test.org_a')::uuid
       and user_id = '00000000-0000-4000-a900-00000000000a';
    raise exception 'ÉCHEC : un admin a modifié le propriétaire';
  exception when insufficient_privilege then
    raise notice 'OK : un admin ne touche pas au propriétaire';
  end;
end $$;

reset role;
update public.memberships set role = 'infirmier'
 where org_id = current_setting('test.org_a')::uuid
   and user_id = '00000000-0000-4000-a900-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000a", "role": "authenticated"}', true);

-- -----------------------------------------------------------------------------
-- Invitation expirée, et membre désactivé qui tente de revenir par un lien
-- -----------------------------------------------------------------------------
do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_inv   record;
begin
  select * into v_inv from public.create_invitation(
    v_org_a, 'medecin', 'Daouda Test D', null, 'e9-d@fajkat.invalid', 'email');
  perform set_config('test.token_d2', v_inv.token, true);
  perform set_config('test.inv_d2', v_inv.invitation_id::text, true);
end $$;

reset role;
update public.invitations set expires_at = now() - interval '1 minute'
 where id = current_setting('test.inv_d2')::uuid;
-- D est de nouveau désactivé chez A.
update public.memberships set is_active = false
 where org_id = current_setting('test.org_a')::uuid
   and user_id = '00000000-0000-4000-a900-00000000000d';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000d", "role": "authenticated"}', true);

do $$
begin
  begin
    perform public.accept_invitation(current_setting('test.token_d2'));
    raise exception 'ÉCHEC : invitation expirée acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : invitation expirée refusée';
  end;
end $$;

reset role;
update public.invitations set expires_at = now() + interval '1 day'
 where id = current_setting('test.inv_d2')::uuid;
set local role authenticated;

do $$
begin
  begin
    perform public.accept_invitation(current_setting('test.token_d2'));
    raise exception 'ÉCHEC : un membre désactivé est revenu par un lien';
  exception when invalid_parameter_value then
    raise notice 'OK : un membre désactivé ne revient pas par un lien';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Invitations notées dans l'assistant : envoi en un clic
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a900-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_inv   record;
  v_first uuid;
begin
  perform public.save_pending_invitations(v_org_a, jsonb_build_array(jsonb_build_object(
    'id', '00000000-0000-4000-b900-000000000001', 'full_name', 'Aïssatou Test E',
    'phone', '+221778889900', 'role', 'aide_soignant')));

  select * into v_inv from public.create_invitation(
    v_org_a, p_pending_id => '00000000-0000-4000-b900-000000000001');
  v_first := v_inv.invitation_id;
  if (select status from public.pending_invitations
      where id = '00000000-0000-4000-b900-000000000001') <> 'sent'
     or (select role from public.invitations where id = v_first) <> 'aide_soignant' then
    raise exception 'ÉCHEC : invitation de l''assistant mal reprise';
  end if;

  -- Renvoi : l'ancien lien est annulé, un seul reste valable.
  select * into v_inv from public.create_invitation(
    v_org_a, p_pending_id => '00000000-0000-4000-b900-000000000001');
  if (select status from public.invitations where id = v_first) <> 'revoked' then
    raise exception 'ÉCHEC : deux liens valables pour la même personne';
  end if;
  perform set_config('test.token_e', v_inv.token, true);
  raise notice 'OK : invitation de l''assistant envoyée en un clic, renvoi sans doublon';
end $$;

-- -----------------------------------------------------------------------------
-- Compte créé par lien (Edge Function accept-invitation) : tout ou rien
-- -----------------------------------------------------------------------------
reset role;

do $$
declare
  v_meta jsonb;
begin
  -- Jeton invalide : le compte n'est pas créé.
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a900-0000000000f0', 'authenticated', 'authenticated',
            'e9-f0@fajkat.invalid',
            jsonb_build_object('full_name', 'Faux', 'invitation_token', repeat('0', 64)),
            now(), now());
    raise exception 'ÉCHEC : compte créé avec un jeton invalide';
  exception when invalid_parameter_value then
    null;
  end;
  if exists (select 1 from auth.users where id = '00000000-0000-4000-a900-0000000000f0')
     or exists (select 1 from public.profiles where id = '00000000-0000-4000-a900-0000000000f0') then
    raise exception 'ÉCHEC : compte ou profil restant après un refus';
  end if;
  raise notice 'OK : jeton invalide, aucun compte créé';

  -- Jeton valide : compte, profil et appartenance dans la même transaction.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-4000-a900-00000000000e', 'authenticated', 'authenticated',
          'e9-e@fajkat.invalid',
          jsonb_build_object('full_name', 'Aïssatou Test E', 'phone', '+221778889900',
                             'invitation_token', current_setting('test.token_e')),
          now(), now());

  select raw_user_meta_data into v_meta from auth.users
   where id = '00000000-0000-4000-a900-00000000000e';
  if v_meta ? 'invitation_token' then
    raise exception 'ÉCHEC : jeton conservé dans les métadonnées du compte';
  end if;
  if not exists (select 1 from public.memberships
                 where user_id = '00000000-0000-4000-a900-00000000000e'
                   and org_id = current_setting('test.org_a')::uuid
                   and role = 'aide_soignant' and is_active) then
    raise exception 'ÉCHEC : le compte créé par lien n''a pas rejoint la structure';
  end if;
  if (select status from public.pending_invitations
      where id = '00000000-0000-4000-b900-000000000001') <> 'accepted' then
    raise exception 'ÉCHEC : invitation de l''assistant non marquée acceptée';
  end if;
  raise notice 'OK : compte créé par lien, structure rejointe, jeton effacé';
end $$;

reset role;

-- Rien n'est conservé : comptes, structures et journal de test disparaissent.
rollback;
