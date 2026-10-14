-- =============================================================================
-- Tests — étape 6 (authentification et inscription)
-- -----------------------------------------------------------------------------
-- Vérifie la reprise du téléphone à l'inscription et la création différée de la
-- structure (finalize_pending_organization) : une seule fois, jamais pour un
-- utilisateur déjà membre, jamais pour un visiteur anonyme.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape06.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
-- Prérequis : migrations des étapes 3 et 6 appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation (en tant que postgres)
--   C : inscrit par e-mail, structure en attente, téléphone en métadonnée.
--   D : téléphone mal formé, déjà owner d'une structure, demande en attente.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated',
   'test-c@fajkat.invalid',
   '{"full_name": "Coumba Test C", "phone": "+221771234567",
     "pending_organization": {"name": "Poste de santé de C", "type": "poste_sante",
       "country_code": "SN", "region": "Kolda", "health_district": "Kolda",
       "commune": "Dioulacolon"}}',
   now(), now()),
  ('00000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated',
   'test-d@fajkat.invalid',
   '{"full_name": "Demba Test D", "phone": "77 12"}',
   now(), now());

do $$
begin
  if (select phone from public.profiles
      where id = '00000000-0000-4000-a000-00000000000c') is distinct from '+221771234567' then
    raise exception 'ÉCHEC : téléphone de l''inscription non repris dans le profil';
  end if;
  if (select phone from public.profiles
      where id = '00000000-0000-4000-a000-00000000000d') is not null then
    raise exception 'ÉCHEC : un téléphone mal formé a été enregistré';
  end if;
  raise notice 'OK : téléphone repris (et ignoré s''il est mal formé)';
end $$;

-- -----------------------------------------------------------------------------
-- C : première connexion
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000c", "role": "authenticated"}', true);
select set_config('test.org_c', public.finalize_pending_organization()::text, true);

do $$
declare
  v_org_c uuid := nullif(current_setting('test.org_c'), '')::uuid;
begin
  if v_org_c is null then
    raise exception 'ÉCHEC : la structure en attente n''a pas été créée';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = v_org_c and name = 'Poste de santé de C' and type = 'poste_sante'
      and region = 'Kolda' and health_district = 'Kolda' and commune = 'Dioulacolon'
      and status = 'trial'
  ) then
    raise exception 'ÉCHEC : informations de la structure non reprises';
  end if;
  if (select role from public.memberships where org_id = v_org_c) <> 'owner' then
    raise exception 'ÉCHEC : C n''est pas owner de sa structure';
  end if;
  raise notice 'OK : structure créée à la première connexion, C owner';

  -- Deuxième appel (autre onglet, autre appareil) : rien de plus.
  if public.finalize_pending_organization() is not null then
    raise exception 'ÉCHEC : un second appel a renvoyé une structure';
  end if;
  if (select count(*) from public.memberships
      where user_id = '00000000-0000-4000-a000-00000000000c') <> 1 then
    raise exception 'ÉCHEC : C appartient à plus d''une structure';
  end if;
  raise notice 'OK : création unique, même appelée deux fois';
end $$;

reset role;

do $$
begin
  if (select raw_user_meta_data ? 'pending_organization' from auth.users
      where id = '00000000-0000-4000-a000-00000000000c') then
    raise exception 'ÉCHEC : la demande n''a pas été effacée des métadonnées';
  end if;
  if (select raw_user_meta_data ->> 'full_name' from auth.users
      where id = '00000000-0000-4000-a000-00000000000c') <> 'Coumba Test C' then
    raise exception 'ÉCHEC : les autres métadonnées ont été perdues';
  end if;
  raise notice 'OK : demande effacée, autres métadonnées conservées';
end $$;

-- -----------------------------------------------------------------------------
-- D : déjà owner d'une structure, puis une demande arrive dans ses métadonnées
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000d", "role": "authenticated"}', true);
select public.create_organization('Clinique de D', 'clinique', 'SN', 'Dakar');

reset role;
update auth.users
   set raw_user_meta_data = raw_user_meta_data
     || '{"pending_organization": {"name": "Doublon", "type": "poste_sante"}}'
 where id = '00000000-0000-4000-a000-00000000000d';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-00000000000d", "role": "authenticated"}', true);

do $$
begin
  if public.finalize_pending_organization() is not null then
    raise exception 'ÉCHEC : une seconde structure a été créée pour D';
  end if;
  if (select count(*) from public.memberships
      where user_id = '00000000-0000-4000-a000-00000000000d') <> 1 then
    raise exception 'ÉCHEC : D appartient à plus d''une structure';
  end if;
  raise notice 'OK : aucune structure en double pour un utilisateur déjà membre';
end $$;

-- -----------------------------------------------------------------------------
-- Visiteur anonyme : appel refusé
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

do $$
begin
  begin
    perform public.finalize_pending_organization();
    raise exception 'ÉCHEC : un visiteur anonyme a appelé finalize_pending_organization';
  exception when insufficient_privilege then
    raise notice 'OK : finalize_pending_organization fermée aux anonymes';
  end;
end $$;

reset role;

-- Rien n'est conservé.
rollback;
