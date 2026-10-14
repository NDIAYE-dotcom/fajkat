-- =============================================================================
-- Étape 9 — Module Personnel : membres et invitations
-- -----------------------------------------------------------------------------
-- 1. invitations          : lien à usage unique, valable 7 jours, jeton stocké haché
--                           (SHA-256) ; le jeton en clair n'est renvoyé qu'une fois.
-- 2. Places               : plans.max_users (null = illimité) compte les membres actifs
--                           et les invitations encore valides.
-- 3. Garde-fous membres   : places contrôlées à l'ajout et à la réactivation ; personne
--                           ne change son propre rôle ni ne se désactive soi-même.
--                           Les memberships ne s'ajoutent plus en direct depuis le client :
--                           seulement par create_organization ou par une invitation.
-- 4. RPC                  : create_invitation, renew_invitation, revoke_invitation,
--                           get_invitation_public (sans connexion), accept_invitation,
--                           org_seats.
-- 5. Compte créé par lien : handle_new_user accepte l'invitation dans la MÊME transaction
--                           que la création du compte (Edge Function accept-invitation) :
--                           si l'invitation est refusée, le compte n'est pas créé.
--
-- Les refus métier lèvent le code 22023 avec un message en français, affiché tel quel.
-- =============================================================================


-- =============================================================================
-- 1. Table invitations
-- =============================================================================

create table public.invitations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id),
  -- Mêmes rôles que memberships, sauf owner : un propriétaire n'est jamais invité.
  role                  text not null check (role in (
                          'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
                          'pharmacien', 'caissier', 'comptable', 'accueil', 'laborantin',
                          'agent_communautaire')),
  full_name             text not null check (char_length(btrim(full_name)) between 2 and 160),
  phone                 text check (phone ~ '^\+[0-9]{8,15}$'),  -- E.164
  email                 text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Canal choisi à l'envoi : lien WhatsApp, lien copié, e-mail.
  channel               text not null default 'whatsapp'
                          check (channel in ('whatsapp', 'lien', 'email')),
  -- SHA-256 du jeton (hex). Le jeton en clair n'est jamais stocké.
  token_hash            text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at            timestamptz not null,
  status                text not null default 'pending'
                          check (status in ('pending', 'accepted', 'revoked')),
  accepted_by           uuid references public.profiles (id) on delete set null,
  accepted_at           timestamptz,
  pending_invitation_id uuid references public.pending_invitations (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  check ((status = 'accepted') = (accepted_at is not null))
);

create index invitations_org_id_idx on public.invitations (org_id);
create index invitations_pending_invitation_id_idx on public.invitations (pending_invitation_id);

comment on table public.invitations is
  'Invitations à rejoindre une structure : lien à usage unique, 7 jours, jeton haché.';

create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();
-- Le journal garde token_hash : sans le jeton en clair, il ne permet pas de rejoindre.
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 2. Jetons et places
-- =============================================================================

-- 64 caractères hexadécimaux tirés du générateur aléatoire sûr de Postgres (244 bits).
create function public.invitation_new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create function public.invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Verrou par structure : ajouts de membres et invitations passent un par un,
-- pour que deux envois simultanés ne dépassent pas max_users.
create function public.org_seats_lock(p_org_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('org_seats:' || p_org_id::text, 0));
$$;

create function public.org_max_users(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select p.max_users
    from public.organizations o
    join public.plans p on p.code = o.type
   where o.id = p_org_id;
$$;

create function public.org_active_members(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.memberships m
   where m.org_id = p_org_id and m.is_active and m.deleted_at is null;
$$;

create function public.org_valid_invitations(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.invitations i
   where i.org_id = p_org_id
     and i.status = 'pending'
     and i.expires_at > now()
     and i.deleted_at is null;
$$;

-- Lève une erreur si p_extra places de plus dépassent l'offre.
create function public.org_assert_seats(p_org_id uuid, p_used integer, p_extra integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_max integer := public.org_max_users(p_org_id);
begin
  if v_max is not null and p_used + p_extra > v_max then
    raise exception 'Votre offre permet % utilisateurs au plus. Désactivez un membre ou annulez une invitation pour libérer une place.', v_max
      using errcode = '22023';
  end if;
end;
$$;

-- Compteur affiché dans le module Personnel.
create function public.org_seats(p_org_id uuid)
returns table (max_users integer, active_members integer, valid_invitations integer)
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_max_users(p_org_id),
         public.org_active_members(p_org_id),
         public.org_valid_invitations(p_org_id)
   where public.is_member(p_org_id);
$$;


-- =============================================================================
-- 3. Garde-fous des memberships (en plus de memberships_guard, étape 3)
-- -----------------------------------------------------------------------------
-- Nom choisi pour passer APRÈS memberships_guard (ordre alphabétique des triggers).
-- =============================================================================

-- Place libre pour un membre qui devient actif (ajout ou réactivation). SECURITY DEFINER :
-- compte tous les membres, quelles que soient les policies de l'appelant.
create function public.memberships_assert_seat(p_org_id uuid, p_membership_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.org_seats_lock(p_org_id);
  perform public.org_assert_seats(
    p_org_id,
    (select count(*)::integer from public.memberships m
      where m.org_id = p_org_id and m.is_active and m.deleted_at is null
        and m.id <> p_membership_id),
    1);
end;
$$;

-- SECURITY INVOKER : current_user distingue l'application (authenticated) du serveur.
create function public.memberships_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_becomes_active boolean;
begin
  -- Depuis l'application, personne ne modifie sa propre appartenance : un responsable
  -- ne peut ni se rétrograder ni se couper l'accès par erreur.
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon')
     and old.user_id = auth.uid()
     and (new.role <> old.role or new.is_active <> old.is_active
          or new.deleted_at is distinct from old.deleted_at)
  then
    raise exception 'Vous ne pouvez pas modifier votre propre accès. Demandez à un autre responsable.'
      using errcode = '22023';
  end if;

  v_becomes_active := new.is_active and new.deleted_at is null
    and (tg_op = 'INSERT' or not old.is_active or old.deleted_at is not null);

  if v_becomes_active then
    perform public.memberships_assert_seat(new.org_id, new.id);
  end if;

  return new;
end;
$$;

create trigger memberships_limits
  before insert or update on public.memberships
  for each row execute function public.memberships_limits();


-- =============================================================================
-- 4. RPC des invitations
-- =============================================================================

-- Vérifications communes à l'envoi : droits et statut de la structure.
create function public.invitation_assert_can_send(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté.' using errcode = '28000';
  end if;
  if not public.has_role(p_org_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs invitent des membres.'
      using errcode = '42501';
  end if;
  if public.current_org_status(p_org_id) in ('read_only', 'suspended') then
    raise exception 'L''abonnement de la structure ne permet pas d''inviter de nouveaux membres pour le moment.'
      using errcode = '22023';
  end if;
end;
$$;

-- Crée une invitation et renvoie le jeton en clair (une seule fois).
-- p_pending_id : reprend une ligne notée dans l'assistant de démarrage ; ses informations
-- servent alors de valeurs par défaut, et une invitation encore ouverte pour elle est
-- remplacée (un seul lien valable par personne).
create function public.create_invitation(
  p_org_id     uuid,
  p_role       text default null,
  p_full_name  text default null,
  p_phone      text default null,
  p_email      text default null,
  p_channel    text default 'whatsapp',
  p_pending_id uuid default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pending public.pending_invitations;
  v_token   text := public.invitation_new_token();
  v_id      uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  perform public.invitation_assert_can_send(p_org_id);
  perform public.org_seats_lock(p_org_id);

  if p_pending_id is not null then
    select * into v_pending
      from public.pending_invitations pi
     where pi.id = p_pending_id and pi.org_id = p_org_id and pi.deleted_at is null
       and pi.status in ('pending', 'sent');
    if not found then
      raise exception 'Cette personne n''est plus dans la liste des invitations à envoyer.'
        using errcode = '22023';
    end if;

    update public.invitations i
       set status = 'revoked'
     where i.pending_invitation_id = p_pending_id and i.status = 'pending';
  end if;

  if char_length(btrim(coalesce(nullif(btrim(p_full_name), ''), v_pending.full_name, ''))) < 2 then
    raise exception 'Indiquez le nom de la personne invitée.' using errcode = '22023';
  end if;

  if coalesce(p_role, v_pending.role) = 'owner' then
    raise exception 'Un propriétaire ne s''invite pas : invitez la personne comme administrateur.'
      using errcode = '22023';
  end if;

  perform public.org_assert_seats(
    p_org_id,
    public.org_active_members(p_org_id) + public.org_valid_invitations(p_org_id),
    1);

  insert into public.invitations
    (org_id, role, full_name, phone, email, channel, token_hash, expires_at,
     pending_invitation_id, created_by)
  values (
    p_org_id,
    coalesce(p_role, v_pending.role),
    btrim(coalesce(nullif(btrim(p_full_name), ''), v_pending.full_name)),
    coalesce(nullif(btrim(p_phone), ''), v_pending.phone),
    lower(coalesce(nullif(btrim(p_email), ''), v_pending.email)),
    coalesce(p_channel, 'whatsapp'),
    public.invitation_token_hash(v_token),
    v_expires,
    p_pending_id,
    auth.uid()
  )
  returning id into v_id;

  if p_pending_id is not null then
    update public.pending_invitations pi set status = 'sent' where pi.id = p_pending_id;
  end if;

  return query select v_id, v_token, v_expires;
end;
$$;

-- Nouveau lien pour une invitation non acceptée (lien perdu ou expiré) : l'ancien
-- lien cesse aussitôt de fonctionner.
create function public.renew_invitation(p_invitation_id uuid, p_channel text default null)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv     public.invitations;
  v_token   text := public.invitation_new_token();
  v_expires timestamptz := now() + interval '7 days';
begin
  select * into v_inv from public.invitations i
   where i.id = p_invitation_id and i.deleted_at is null;
  if not found then
    raise exception 'Invitation introuvable.' using errcode = '22023';
  end if;

  perform public.invitation_assert_can_send(v_inv.org_id);
  perform public.org_seats_lock(v_inv.org_id);

  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation a déjà été acceptée ou annulée.' using errcode = '22023';
  end if;

  -- Une invitation expirée ne comptait plus : elle reprend une place.
  if v_inv.expires_at <= now() then
    perform public.org_assert_seats(
      v_inv.org_id,
      public.org_active_members(v_inv.org_id) + public.org_valid_invitations(v_inv.org_id),
      1);
  end if;

  update public.invitations i
     set token_hash = public.invitation_token_hash(v_token),
         expires_at = v_expires,
         channel    = coalesce(p_channel, i.channel)
   where i.id = p_invitation_id;

  return query select p_invitation_id, v_token, v_expires;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations i
   where i.id = p_invitation_id and i.deleted_at is null;
  if not found then
    raise exception 'Invitation introuvable.' using errcode = '22023';
  end if;

  perform public.invitation_assert_can_send(v_inv.org_id);

  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation a déjà été acceptée ou annulée.' using errcode = '22023';
  end if;

  update public.invitations i set status = 'revoked' where i.id = p_invitation_id;
  if v_inv.pending_invitation_id is not null then
    update public.pending_invitations pi set status = 'cancelled'
     where pi.id = v_inv.pending_invitation_id;
  end if;
end;
$$;

-- Page publique /invitation/:jeton : ce que la personne doit savoir avant de rejoindre.
-- status : valid | expired | used | revoked | unavailable | full | unknown.
-- Rien d'autre n'est révélé sans le jeton exact.
create function public.get_invitation_public(p_token text)
returns table (
  status     text,
  org_name   text,
  org_type   text,
  role       text,
  full_name  text,
  email      text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_org public.organizations;
begin
  select * into v_inv from public.invitations i
   where i.token_hash = public.invitation_token_hash(p_token) and i.deleted_at is null;
  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text, null::text,
                        null::text, null::timestamptz;
    return;
  end if;

  select * into v_org from public.organizations o where o.id = v_inv.org_id;

  return query select
    case
      when v_inv.status = 'accepted' then 'used'
      when v_inv.status = 'revoked' then 'revoked'
      when v_org.deleted_at is not null or v_org.status = 'suspended' then 'unavailable'
      when v_inv.expires_at <= now() then 'expired'
      when public.org_max_users(v_inv.org_id) is not null
           and public.org_active_members(v_inv.org_id) >= public.org_max_users(v_inv.org_id)
        then 'full'
      else 'valid'
    end,
    v_org.name, v_org.type, v_inv.role, v_inv.full_name, v_inv.email, v_inv.expires_at;
end;
$$;

-- Acceptation, commune aux deux chemins (compte existant, compte créé par lien).
-- Jamais appelable directement : seulement par accept_invitation et handle_new_user.
create function public.invitation_accept_for_user(p_token text, p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_org public.organizations;
  v_mem public.memberships;
begin
  select * into v_inv from public.invitations i
   where i.token_hash = public.invitation_token_hash(p_token) and i.deleted_at is null
   for update;
  if not found or v_inv.status = 'revoked' then
    raise exception 'Ce lien d''invitation n''est pas valable. Demandez un nouveau lien au responsable de la structure.'
      using errcode = '22023';
  end if;
  if v_inv.status = 'accepted' then
    raise exception 'Ce lien d''invitation a déjà servi. Demandez un nouveau lien au responsable de la structure.'
      using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Ce lien d''invitation a expiré. Demandez un nouveau lien au responsable de la structure.'
      using errcode = '22023';
  end if;

  select * into v_org from public.organizations o where o.id = v_inv.org_id;
  if v_org.deleted_at is not null or v_org.status = 'suspended' then
    raise exception 'Cette structure n''est pas accessible pour le moment.' using errcode = '22023';
  end if;

  select * into v_mem from public.memberships m
   where m.org_id = v_inv.org_id and m.user_id = p_user_id and m.deleted_at is null;
  if found and v_mem.is_active then
    raise exception 'Vous êtes déjà membre de cette structure.' using errcode = '22023';
  end if;
  if found then
    -- Un accès coupé se rétablit par le responsable, pas par un lien.
    raise exception 'Votre accès à cette structure a été désactivé. Adressez-vous à son responsable.'
      using errcode = '22023';
  end if;

  -- L'invitation occupait déjà une place : le trigger memberships_limits revérifie
  -- simplement qu'il en reste une pour le nouveau membre.
  insert into public.memberships (org_id, user_id, role, is_active, invited_by, created_by)
  values (v_inv.org_id, p_user_id, v_inv.role, true, v_inv.created_by, p_user_id);

  update public.invitations i
     set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
   where i.id = v_inv.id;

  if v_inv.pending_invitation_id is not null then
    update public.pending_invitations pi set status = 'accepted'
     where pi.id = v_inv.pending_invitation_id;
  end if;

  return v_inv.org_id;
end;
$$;

-- Personne déjà connectée (compte existant). Renvoie l'id de la structure rejointe.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour rejoindre la structure.' using errcode = '28000';
  end if;
  return public.invitation_accept_for_user(p_token, auth.uid());
end;
$$;


-- =============================================================================
-- 5. Compte créé depuis un lien d'invitation
-- -----------------------------------------------------------------------------
-- L'Edge Function accept-invitation crée le compte (auth.admin.createUser) avec le
-- jeton dans les métadonnées (« invitation_token »). Ce trigger accepte l'invitation
-- dans la même transaction que l'insertion dans auth.users : un refus annule la
-- création du compte. Le jeton est aussitôt retiré des métadonnées (jamais conservé).
-- Seul le détenteur du jeton peut s'en servir : il donne exactement le droit que
-- donnerait le lien lui-même.
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
  v_token    text := nullif(new.raw_user_meta_data ->> 'invitation_token', '');
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

  if new.raw_user_meta_data ? 'invitation_token' then
    perform public.invitation_accept_for_user(v_token, new.id);
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'invitation_token'
     where id = new.id;
  end if;

  return new;
end;
$$;


-- =============================================================================
-- 6. Droits d'accès
-- =============================================================================

revoke all on public.invitations from anon, authenticated;

-- token_hash n'est jamais lisible depuis le client. Aucune écriture directe : tout
-- passe par les RPC ci-dessus.
grant select (
  id, org_id, role, full_name, phone, email, channel, expires_at, status, accepted_by,
  accepted_at, pending_invitation_id, created_at, updated_at, created_by, deleted_at
) on public.invitations to authenticated;

-- Les membres arrivent par create_organization ou par invitation, plus jamais par un
-- INSERT direct (qui permettait d'ajouter un compte sans son accord).
revoke insert on public.memberships from authenticated;

revoke execute on function
  public.invitation_new_token(),
  public.invitation_token_hash(text),
  public.org_seats_lock(uuid),
  public.org_max_users(uuid),
  public.org_active_members(uuid),
  public.org_valid_invitations(uuid),
  public.org_assert_seats(uuid, integer, integer),
  public.org_seats(uuid),
  public.memberships_limits(),
  public.memberships_assert_seat(uuid, uuid),
  public.invitation_assert_can_send(uuid),
  public.create_invitation(uuid, text, text, text, text, text, uuid),
  public.renew_invitation(uuid, text),
  public.revoke_invitation(uuid),
  public.get_invitation_public(text),
  public.invitation_accept_for_user(text, uuid),
  public.accept_invitation(text)
from public, anon, authenticated;

-- memberships_assert_seat : appelée par le trigger memberships_limits, qui s'exécute
-- avec les droits de l'utilisateur (elle ne fait que vérifier, jamais écrire).
grant execute on function
  public.org_seats(uuid),
  public.memberships_assert_seat(uuid, uuid),
  public.create_invitation(uuid, text, text, text, text, text, uuid),
  public.renew_invitation(uuid, text),
  public.revoke_invitation(uuid),
  public.accept_invitation(text)
to authenticated;

-- Page publique : lisible avant connexion.
grant execute on function public.get_invitation_public(text) to anon, authenticated;


-- =============================================================================
-- 7. Row Level Security
-- =============================================================================

alter table public.invitations enable row level security;

create policy invitations_select_admin on public.invitations
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));
