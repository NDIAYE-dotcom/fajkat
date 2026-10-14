-- =============================================================================
-- Étape 6 — Authentification et inscription
-- -----------------------------------------------------------------------------
-- 1. handle_new_user reprend aussi le téléphone saisi à l'inscription par e-mail
--    (métadonnée « phone »), et pas seulement celui de l'authentification par SMS.
-- 2. finalize_pending_organization() : quand l'e-mail doit être confirmé avant la
--    première connexion, les informations de la structure sont gardées dans les
--    métadonnées du compte (« pending_organization ») ; cette fonction crée la
--    structure à la première connexion, sur n'importe quel appareil.
-- =============================================================================


-- =============================================================================
-- 1. Profil créé à l'inscription : téléphone de l'auth OU des métadonnées
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone    text;
  v_language text := new.raw_user_meta_data ->> 'preferred_language';
begin
  -- Supabase Auth stocke le téléphone sans « + » ; la métadonnée arrive en E.164.
  -- Un format inattendu est ignoré plutôt que de bloquer l'inscription.
  v_phone := coalesce(nullif(new.phone, ''), nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''));
  if v_phone is not null then
    v_phone := '+' || ltrim(v_phone, '+');
    if v_phone !~ '^\+[0-9]{8,15}$' then
      v_phone := null;
    end if;
  end if;

  insert into public.profiles (id, full_name, phone, preferred_language)
  values (
    new.id,
    coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_phone,
    case when v_language in ('fr', 'wo') then v_language else 'fr' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- =============================================================================
-- 2. Création différée de la structure
-- -----------------------------------------------------------------------------
-- Idempotente : un verrou par utilisateur empêche deux onglets ouverts en même
-- temps de créer deux structures, et un utilisateur déjà membre d'une structure
-- active n'en reçoit pas une seconde. Dans tous les cas où rien ne bloque, la
-- demande est effacée des métadonnées. Si create_organization refuse (offre
-- inconnue, nom trop court…), l'erreur remonte et la demande reste en place :
-- l'utilisateur la corrige sur /inscription sans tout ressaisir.
-- Renvoie l'id de la structure créée, ou null s'il n'y avait rien à créer.
-- =============================================================================

create function public.finalize_pending_organization()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_pending jsonb;
  v_org_id  uuid;
begin
  if v_user_id is null then
    raise exception 'Vous devez être connecté pour créer une structure.'
      using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('finalize_pending_organization:' || v_user_id::text, 0)
  );

  select u.raw_user_meta_data -> 'pending_organization'
    into v_pending
    from auth.users u
   where u.id = v_user_id;

  if v_pending is null or jsonb_typeof(v_pending) <> 'object' then
    return null;
  end if;

  if not exists (
    select 1
      from public.memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = v_user_id
       and m.is_active
       and m.deleted_at is null
       and o.deleted_at is null
  ) then
    v_org_id := public.create_organization(
      p_name            => v_pending ->> 'name',
      p_type            => v_pending ->> 'type',
      p_country_code    => coalesce(nullif(v_pending ->> 'country_code', ''), 'SN'),
      p_region          => v_pending ->> 'region',
      p_health_district => v_pending ->> 'health_district',
      p_commune         => v_pending ->> 'commune'
    );
  end if;

  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'pending_organization'
   where id = v_user_id;

  return v_org_id;
end;
$$;

comment on function public.finalize_pending_organization() is
  'Crée, à la première connexion, la structure saisie à l''inscription (métadonnée pending_organization), une seule fois.';

revoke execute on function public.finalize_pending_organization() from public, anon;
grant execute on function public.finalize_pending_organization() to authenticated;
