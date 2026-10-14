-- =============================================================================
-- Étape 3 — Socle de la base de données Fajkat
-- -----------------------------------------------------------------------------
-- Contenu :
--   1. Tables de référence : countries, plans, features, plan_features
--   2. Tables du socle     : organizations, profiles, memberships, subscriptions
--   3. Journal d'audit     : audit_logs (ajout seul, jamais modifiable)
--   4. Fonctions d'aide    : is_member, has_role, org_has_feature, current_org_status,
--                            org_features
--   5. Triggers            : set_updated_at, handle_new_user, audit_trigger,
--                            garde-fous des memberships et du journal
--   6. RPC                 : create_organization
--   7. Droits et RLS       : RLS sur toutes les tables, droits accordés colonne par colonne
--   8. Référentiels        : 8 pays, 2 plans, 38 fonctionnalités (indispensables en
--                            production, d'où leur place dans la migration et non dans le seed)
--
-- Principes (CLAUDE.md, section 5) :
--   - toutes les fonctions SECURITY DEFINER fixent search_path = '' et qualifient
--     chaque objet (public.…, auth.…) ;
--   - aucune suppression physique : suppression douce par deleted_at ;
--   - les colonnes sensibles (type, statut, dates d'essai) ne sont modifiables que
--     par le serveur (fonctions SECURITY DEFINER, Edge Functions en service_role).
--
-- supabase/seed.sql est réservé aux données de démonstration.
-- =============================================================================


-- =============================================================================
-- 1. Fonction utilitaire : mise à jour automatique de updated_at
-- =============================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger générique : met updated_at à l''heure courante à chaque modification.';


-- =============================================================================
-- 2. Tables de référence (lecture publique, écriture réservée au serveur)
-- =============================================================================

-- Pays de l'espace UEMOA. Seul le Sénégal est ouvert au départ.
create table public.countries (
  code         text primary key check (code ~ '^[A-Z]{2}$'),
  name         text not null,
  phone_prefix text not null check (phone_prefix ~ '^\+[0-9]{1,4}$'),
  timezone     text not null,
  currency     text not null default 'XOF' check (currency = 'XOF'),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.countries is
  'Pays configurables (indicatif E.164, fuseau horaire). Monnaie XOF partout.';

-- Offres commerciales. Le code du plan est aussi le type de la structure.
-- Montants en FCFA entiers (bigint), jamais de décimales.
create table public.plans (
  code                   text primary key check (code in ('poste_sante', 'clinique')),
  name                   text not null,
  monthly_price          bigint not null check (monthly_price >= 0),
  annual_price           bigint check (annual_price >= 0),
  trial_days             integer not null default 30 check (trial_days >= 0),
  max_users              integer check (max_users > 0),              -- null = illimité
  whatsapp_monthly_quota integer check (whatsapp_monthly_quota >= 0), -- null = non défini
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.plans is
  'Offres Poste de santé et Clinique. Tarifs en FCFA entiers, modifiables sans code.';

-- Fonctionnalités (feature flags).
--   famille : regroupement du catalogue public (src/lib/modules.js) ;
--   module  : dossier du code métier dans src/modules (ex. vaccination -> enfant).
create table public.features (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label       text not null,
  description text,
  famille     text not null
                check (famille in ('parcours_patient', 'soins_plateau', 'gestion_finances')),
  module      text not null check (module ~ '^[a-z][a-z-]*$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.features is
  'Fonctionnalités activables par plan. Codes alignés sur CLAUDE.md (section 6).';

-- Répartition des fonctionnalités par plan.
create table public.plan_features (
  plan_code    text not null references public.plans (code) on update cascade,
  feature_code text not null references public.features (code) on update cascade,
  created_at   timestamptz not null default now(),
  primary key (plan_code, feature_code)
);

create index plan_features_feature_code_idx on public.plan_features (feature_code);

comment on table public.plan_features is
  'Fonctionnalités incluses dans chaque plan.';

create trigger countries_set_updated_at before update on public.countries
  for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger features_set_updated_at before update on public.features
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. Tables du socle
-- =============================================================================

-- Structure de santé (tenant). Son identifiant sert d'org_id dans toutes les tables métier.
-- Le type détermine le plan : passer de Poste à Clinique ne change que cette colonne,
-- aucune donnée n'est déplacée ni perdue.
create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 2 and 200),
  type                 text not null references public.plans (code) on update cascade,
  status               text not null default 'trial'
                         check (status in ('trial', 'active', 'grace', 'read_only', 'suspended')),
  country_code         text not null default 'SN' references public.countries (code),
  region               text,
  health_district      text,
  commune              text,
  address              text,
  phone                text check (phone ~ '^\+[0-9]{8,15}$'),  -- E.164
  email                text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  logo_url             text,
  authorization_number text,
  timezone             text not null default 'Africa/Dakar',
  settings             jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(settings) = 'object'),
  trial_ends_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at           timestamptz
);

create index organizations_created_by_idx on public.organizations (created_by);

comment on table public.organizations is
  'Structures de santé (tenants). Statut et type modifiables uniquement côté serveur.';
comment on column public.organizations.status is
  'trial : essai ; active : abonnement payé ; grace : délai après échéance ; '
  'read_only : consultation seule ; suspended : accès coupé.';

-- Profil public d'un utilisateur, créé automatiquement à l'inscription (handle_new_user).
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '',
  phone               text check (phone ~ '^\+[0-9]{8,15}$'),  -- E.164
  title               text,                 -- ex. « Infirmier chef de poste »
  professional_number text,                 -- numéro d'ordre professionnel
  avatar_url          text,
  preferred_language  text not null default 'fr' check (preferred_language in ('fr', 'wo')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'Profil de l''utilisateur, un par compte (id = auth.users.id).';

-- Appartenance d'un utilisateur à une structure, avec un rôle.
-- Un utilisateur peut appartenir à plusieurs structures.
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in (
               'owner', 'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
               'pharmacien', 'caissier', 'comptable', 'accueil', 'laborantin',
               'agent_communautaire')),
  is_active  boolean not null default true,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

-- Une seule appartenance vivante par (structure, utilisateur).
create unique index memberships_org_user_unique
  on public.memberships (org_id, user_id) where deleted_at is null;
create index memberships_user_id_idx on public.memberships (user_id);

comment on table public.memberships is
  'Membres d''une structure et leur rôle. Désactivation par is_active, retrait par deleted_at.';

-- Abonnement d'une structure. Écrit uniquement côté serveur (essai, paiements).
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id),
  plan_code            text not null references public.plans (code) on update cascade,
  status               text not null default 'trial'
                         check (status in ('trial', 'active', 'grace', 'expired', 'cancelled')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null,
  grace_ends_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at           timestamptz,
  check (current_period_end >= current_period_start),
  check (grace_ends_at is null or grace_ends_at >= current_period_end)
);

-- Un seul abonnement en cours par structure.
create unique index subscriptions_one_current_per_org
  on public.subscriptions (org_id)
  where deleted_at is null and status in ('trial', 'active', 'grace');
create index subscriptions_org_id_idx on public.subscriptions (org_id);

comment on table public.subscriptions is
  'Périodes d''abonnement. Essai créé par create_organization ; paiements aux étapes suivantes.';

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 4. Journal d'audit (ajout seul)
-- =============================================================================

-- Pas de clé étrangère vers organizations : le journal doit survivre à tout.
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  org_id     uuid,
  user_id    uuid,                 -- auth.uid() de l'auteur ; null = action serveur
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  record_id  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);

comment on table public.audit_logs is
  'Journal des modifications des tables sensibles. Jamais modifié ni supprimé.';

-- Interdit toute modification ou suppression, même depuis l'éditeur SQL.
create function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal d''audit ne peut être ni modifié ni supprimé.'
    using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- Fonction d'audit générique, attachable à n'importe quelle table :
--   create trigger <table>_audit after insert or update or delete on public.<table>
--     for each row execute function public.audit_trigger();          -- org_id lu dans org_id
--     for each row execute function public.audit_trigger('id');      -- org_id lu dans id
-- Le premier argument (facultatif) nomme la colonne qui porte l'org_id.
create function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb;
  v_new       jsonb;
  v_org_col   text := coalesce(tg_argv[0], 'org_id');
  v_org_id    uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  -- Une mise à jour qui ne change rien (hors updated_at) n'est pas journalisée.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_org_id := nullif(coalesce(v_new ->> v_org_col, v_old ->> v_org_col), '')::uuid;

  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values (
    v_org_id,
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_old,
    v_new
  );

  return null; -- trigger AFTER : la valeur de retour est ignorée
end;
$$;

comment on function public.audit_trigger() is
  'Trigger d''audit générique. Argument facultatif : nom de la colonne org_id (défaut org_id).';


-- =============================================================================
-- 5. Fonctions d'aide pour les policies RLS
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER : elles lisent memberships et organizations sans repasser par
-- leurs policies (ce qui provoquerait une récursion infinie).
-- =============================================================================

-- L'utilisateur connecté est-il membre actif de la structure ?
create function public.is_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.deleted_at is null
      and o.deleted_at is null
  );
$$;

-- L'utilisateur connecté a-t-il l'un de ces rôles dans la structure ?
create function public.has_role(p_org_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
      and m.is_active
      and m.deleted_at is null
      and o.deleted_at is null
  );
$$;

-- Le plan de la structure (déduit de son type) inclut-il cette fonctionnalité ?
create function public.org_has_feature(p_org_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    join public.plan_features pf on pf.plan_code = o.type
    where o.id = p_org_id
      and o.deleted_at is null
      and pf.feature_code = p_feature
  );
$$;

-- Statut courant de la structure (trial, active, grace, read_only, suspended), null si absente.
create function public.current_org_status(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.status
  from public.organizations o
  where o.id = p_org_id
    and o.deleted_at is null;
$$;

-- Liste des fonctionnalités de la structure, pour le front (un seul appel).
-- Vide si l'utilisateur n'en est pas membre.
create function public.org_features(p_org_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(pf.feature_code order by pf.feature_code), '{}'::text[])
  from public.organizations o
  join public.plan_features pf on pf.plan_code = o.type
  where o.id = p_org_id
    and o.deleted_at is null
    and public.is_member(p_org_id);
$$;


-- =============================================================================
-- 6. Création automatique du profil à l'inscription
-- =============================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone    text;
  v_language text := new.raw_user_meta_data ->> 'preferred_language';
begin
  -- Supabase Auth stocke le téléphone sans « + » : on le remet en E.164.
  -- Un format inattendu est ignoré plutôt que de bloquer l'inscription.
  if new.phone is not null and new.phone <> '' then
    v_phone := '+' || ltrim(new.phone, '+');
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 7. Garde-fous des memberships
-- -----------------------------------------------------------------------------
-- Les policies RLS disent QUI peut écrire (owner, admin). Ce trigger ajoute les
-- règles qu'une policy ne sait pas exprimer :
--   - seul un owner peut nommer, modifier ou retirer un owner ;
--   - invited_by et created_by sont imposés (pas falsifiables par le client) ;
--   - une structure garde toujours au moins un owner actif.
-- Les écritures faites côté serveur (fonctions SECURITY DEFINER comme
-- create_organization, service_role) ne passent pas par les deux premières règles :
-- on les reconnaît à current_user, qui n'est alors ni « authenticated » ni « anon ».
-- =============================================================================

create function public.memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner_touched boolean;
  v_other_owners  integer;
begin
  if current_user in ('authenticated', 'anon') then
    v_owner_touched := new.role = 'owner'
      or (tg_op = 'UPDATE' and old.role = 'owner');

    if v_owner_touched and not public.has_role(new.org_id, array['owner']) then
      raise exception 'Seul le propriétaire de la structure peut nommer ou modifier un propriétaire.'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      new.invited_by := auth.uid();
      new.created_by := auth.uid();
    end if;
  end if;

  -- Le dernier owner actif ne peut être ni rétrogradé, ni désactivé, ni retiré.
  if tg_op = 'UPDATE'
     and old.role = 'owner' and old.is_active and old.deleted_at is null
     and (new.role <> 'owner' or not new.is_active or new.deleted_at is not null)
  then
    select count(*) into v_other_owners
    from public.memberships m
    where m.org_id = old.org_id
      and m.id <> old.id
      and m.role = 'owner'
      and m.is_active
      and m.deleted_at is null;

    if v_other_owners = 0 then
      raise exception 'La structure doit garder au moins un propriétaire actif.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger memberships_guard
  before insert or update on public.memberships
  for each row execute function public.memberships_guard();


-- =============================================================================
-- 8. RPC create_organization : structure + abonnement d'essai + owner, en une transaction
-- =============================================================================

create function public.create_organization(
  p_name                 text,
  p_type                 text,
  p_country_code         text default 'SN',
  p_region               text default null,
  p_health_district      text default null,
  p_commune              text default null,
  p_address              text default null,
  p_phone                text default null,
  p_email                text default null,
  p_authorization_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_plan      public.plans;
  v_country   public.countries;
  v_org_id    uuid;
  v_trial_end timestamptz;
begin
  if v_user_id is null then
    raise exception 'Vous devez être connecté pour créer une structure.'
      using errcode = '28000';
  end if;

  select * into v_plan from public.plans where code = p_type and is_active;
  if not found then
    raise exception 'Offre inconnue ou indisponible : %.', coalesce(p_type, '(vide)')
      using errcode = '22023';
  end if;

  select * into v_country from public.countries where code = p_country_code and is_active;
  if not found then
    raise exception 'Fajkat n''est pas encore ouvert dans ce pays : %.', coalesce(p_country_code, '(vide)')
      using errcode = '22023';
  end if;

  -- Filet de sécurité pour un compte créé avant cette migration (pas de profil).
  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;

  v_trial_end := now() + make_interval(days => v_plan.trial_days);

  insert into public.organizations (
    name, type, status, country_code, region, health_district, commune, address,
    phone, email, authorization_number, timezone, trial_ends_at, created_by
  )
  values (
    btrim(p_name), v_plan.code, 'trial', v_country.code,
    nullif(btrim(p_region), ''), nullif(btrim(p_health_district), ''),
    nullif(btrim(p_commune), ''), nullif(btrim(p_address), ''),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    nullif(btrim(p_authorization_number), ''),
    v_country.timezone, v_trial_end, v_user_id
  )
  returning id into v_org_id;

  insert into public.subscriptions (
    org_id, plan_code, status, current_period_start, current_period_end, created_by
  )
  values (v_org_id, v_plan.code, 'trial', now(), v_trial_end, v_user_id);

  insert into public.memberships (org_id, user_id, role, is_active, invited_by, created_by)
  values (v_org_id, v_user_id, 'owner', true, null, v_user_id);

  return v_org_id;
end;
$$;

comment on function public.create_organization(text, text, text, text, text, text, text, text, text, text) is
  'Crée une structure en essai, son abonnement d''essai et la membership owner du créateur.';


-- =============================================================================
-- 9. Audit des tables sensibles du socle
-- =============================================================================

create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.audit_trigger('id');
create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.audit_trigger();
create trigger subscriptions_audit
  after insert or update or delete on public.subscriptions
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 10. Droits d'accès
-- -----------------------------------------------------------------------------
-- On part de zéro (aucun droit pour anon et authenticated), puis on accorde
-- exactement ce qui est nécessaire, colonne par colonne pour les écritures.
-- Ce qui n'est pas accordé ici n'est faisable que côté serveur.
-- =============================================================================

revoke all on
  public.countries, public.plans, public.features, public.plan_features,
  public.organizations, public.profiles, public.memberships, public.subscriptions,
  public.audit_logs
from anon, authenticated;

-- Référentiels : lecture publique (site vitrine compris).
grant select on public.countries, public.plans, public.features, public.plan_features
  to anon, authenticated;

-- Structures : lecture ; modification des seules informations descriptives.
-- type, status, trial_ends_at, deleted_at restent hors de portée du client.
grant select on public.organizations to authenticated;
grant update (
  name, country_code, region, health_district, commune, address, phone, email,
  logo_url, authorization_number, timezone, settings
) on public.organizations to authenticated;

-- Profils : lecture ; chacun modifie le sien.
grant select on public.profiles to authenticated;
grant update (
  full_name, phone, title, professional_number, avatar_url, preferred_language
) on public.profiles to authenticated;

-- Memberships : ajout et modification du rôle, de l'activité, du retrait.
grant select on public.memberships to authenticated;
grant insert (org_id, user_id, role, is_active) on public.memberships to authenticated;
grant update (role, is_active, deleted_at) on public.memberships to authenticated;

-- Abonnements et journal : lecture seule.
grant select on public.subscriptions to authenticated;
grant select on public.audit_logs to authenticated;

-- Fonctions : fermées à tous, puis ouvertes aux seuls utilisateurs connectés.
revoke execute on function
  public.is_member(uuid),
  public.has_role(uuid, text[]),
  public.org_has_feature(uuid, text),
  public.current_org_status(uuid),
  public.org_features(uuid),
  public.create_organization(text, text, text, text, text, text, text, text, text, text)
from public, anon;

grant execute on function
  public.is_member(uuid),
  public.has_role(uuid, text[]),
  public.org_has_feature(uuid, text),
  public.current_org_status(uuid),
  public.org_features(uuid),
  public.create_organization(text, text, text, text, text, text, text, text, text, text)
to authenticated;

-- Fonctions de trigger : jamais appelables directement.
revoke execute on function
  public.set_updated_at(),
  public.audit_trigger(),
  public.audit_logs_immutable(),
  public.handle_new_user(),
  public.memberships_guard()
from public, anon, authenticated;


-- =============================================================================
-- 11. Row Level Security — activée sur TOUTES les tables
-- -----------------------------------------------------------------------------
-- Aucune policy DELETE : la suppression est douce (deleted_at), jamais physique.
-- Les lignes retirées (deleted_at) restent lisibles par les membres ; le filtrage
-- se fait côté requête. (Les masquer ici ferait échouer la mise à jour qui les retire.)
-- =============================================================================

alter table public.countries     enable row level security;
alter table public.plans         enable row level security;
alter table public.features      enable row level security;
alter table public.plan_features enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs    enable row level security;

-- Référentiels : lecture pour tous.
create policy countries_select_all on public.countries
  for select to anon, authenticated using (true);
create policy plans_select_all on public.plans
  for select to anon, authenticated using (true);
create policy features_select_all on public.features
  for select to anon, authenticated using (true);
create policy plan_features_select_all on public.plan_features
  for select to anon, authenticated using (true);

-- Structures : un utilisateur ne voit que celles dont il est membre actif.
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_member(id));

-- Seuls owner et admin modifient la structure. Pas d'INSERT : passer par create_organization.
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.has_role(id, array['owner', 'admin']))
  with check (public.has_role(id, array['owner', 'admin']));

-- Profils : le sien, et ceux des membres de ses structures.
create policy profiles_select_self_or_colleague on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.memberships m
      where m.user_id = profiles.id
        and m.deleted_at is null
        and public.is_member(m.org_id)
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Memberships : visibles par les membres de la structure (et chacun voit les siennes,
-- même désactivées) ; écrites par owner et admin uniquement.
create policy memberships_select_member on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_member(org_id));

create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']));

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin']));

-- Abonnements : lisibles par owner et admin. Écriture serveur uniquement.
create policy subscriptions_select_admin on public.subscriptions
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));

-- Journal d'audit : lisible par owner et admin. Jamais d'écriture côté client.
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));


-- =============================================================================
-- 12. Données de référence
-- -----------------------------------------------------------------------------
-- Indispensables au fonctionnement, en production comme en développement.
-- « on conflict do nothing » : une valeur déjà présente n'est jamais écrasée.
-- Toute correction ultérieure (tarif, libellé, pays ouvert) passe par une nouvelle
-- migration, jamais par une modification de celle-ci.
-- Libellés repris de src/lib/modules.js, prix de src/lib/offres.js.
-- =============================================================================

-- Pays de l'espace UEMOA. Seul le Sénégal est ouvert au départ.
insert into public.countries (code, name, phone_prefix, timezone, currency, is_active) values
  ('SN', 'Sénégal',        '+221', 'Africa/Dakar',       'XOF', true),
  ('CI', 'Côte d''Ivoire', '+225', 'Africa/Abidjan',     'XOF', false),
  ('ML', 'Mali',           '+223', 'Africa/Bamako',      'XOF', false),
  ('BF', 'Burkina Faso',   '+226', 'Africa/Ouagadougou', 'XOF', false),
  ('NE', 'Niger',          '+227', 'Africa/Niamey',      'XOF', false),
  ('TG', 'Togo',           '+228', 'Africa/Lome',        'XOF', false),
  ('BJ', 'Bénin',          '+229', 'Africa/Porto-Novo',  'XOF', false),
  ('GW', 'Guinée-Bissau',  '+245', 'Africa/Bissau',      'XOF', false)
on conflict (code) do nothing;

-- Plans : essai de 30 jours, utilisateurs illimités, quota WhatsApp et prix annuel
-- à définir (null).
insert into public.plans
  (code, name, monthly_price, annual_price, trial_days, max_users, whatsapp_monthly_quota, is_active)
values
  ('poste_sante', 'Poste de santé',  5500, null, 30, null, null, true),
  ('clinique',    'Clinique',       10500, null, 30, null, null, true)
on conflict (code) do nothing;

-- Fonctionnalités : les 38 codes de CLAUDE.md (section 6).
-- Colonnes : code, libellé, description, famille, module (dossier de src/modules).
insert into public.features (code, label, description, famille, module) values
  ('patients', 'Patients et ménages',
   'Un dossier par personne, même quand toute la famille partage un numéro. Recherche par nom, téléphone, quartier et prénom de la mère, « âge déclaré » accepté.',
   'parcours_patient', 'patients'),
  ('file_attente', 'File d’attente',
   'Ordre d’arrivée et priorité aux femmes enceintes, aux enfants de moins de 5 ans et aux personnes âgées. Ticket de passage imprimé en 80 mm.',
   'parcours_patient', 'accueil'),
  ('tickets_consultation', 'Tickets de consultation',
   'Le ticket vendu à l’accueil, numéroté et rattaché à la caisse, selon les tarifs fixés par le comité de santé.',
   'parcours_patient', 'accueil'),
  ('rendez_vous', 'Rendez-vous',
   'Prochaine CPN, prochain vaccin, contrôle : chaque rendez-vous est noté dans le dossier et visible le jour venu.',
   'parcours_patient', 'rendez-vous'),
  ('agenda_multi_praticiens', 'Agenda par praticien',
   'Un agenda par praticien, des créneaux par spécialité, et l’accueil qui voit les disponibilités d’un coup d’œil.',
   'parcours_patient', 'rendez-vous'),
  ('references', 'Références et contre-références',
   'La fiche de référence vers le centre de santé ou l’hôpital, et le retour d’information quand le patient revient.',
   'parcours_patient', 'consultations'),
  ('whatsapp_liens', 'Rappels par WhatsApp',
   'Le message de rappel est préparé, en français ou en wolof ; il part depuis le téléphone de la structure, au patient ou à sa famille.',
   'parcours_patient', 'whatsapp'),
  ('whatsapp_api', 'Envois WhatsApp automatiques',
   'Les rappels de rendez-vous et de vaccins partent seuls, la veille, sans action de l’équipe.',
   'parcours_patient', 'whatsapp'),
  ('whatsapp_numero_propre', 'WhatsApp au numéro de la clinique',
   'Les messages aux patients partent du numéro et au nom de la clinique, avec son logo.',
   'parcours_patient', 'whatsapp'),
  ('communautaire', 'Activités communautaires',
   'Visites à domicile, causeries et relais communautaires : les activités hors du poste sont notées et rattachées aux ménages.',
   'parcours_patient', 'communautaire'),
  ('consultations', 'Consultations et soins',
   'Motif, examen, diagnostic et traitement en quelques champs, avec l’historique du patient sous les yeux.',
   'soins_plateau', 'consultations'),
  ('maternite', 'Grossesse et parcours mère-enfant',
   'Consultations prénatales, accouchement, suivi post-natal et planification familiale.',
   'soins_plateau', 'maternite'),
  ('vaccination', 'Vaccination',
   'Calendrier vaccinal configurable : quand le calendrier national change, il se met à jour sans nouvelle version du logiciel.',
   'soins_plateau', 'enfant'),
  ('nutrition_enfant', 'Croissance et nutrition de l’enfant',
   'Poids, taille et périmètre brachial à chaque visite, avec la courbe de croissance et le signalement de la malnutrition.',
   'soins_plateau', 'enfant'),
  ('surveillance_epidemio', 'Surveillance épidémiologique',
   'Les maladies à déclaration obligatoire repérées dès la consultation, et le décompte hebdomadaire préparé.',
   'soins_plateau', 'rapports'),
  ('hospitalisation', 'Hospitalisation',
   'Plan des lits, admissions, feuille de soins infirmiers et sortie, avec la facture du séjour qui se prépare au fil des jours.',
   'soins_plateau', 'hospitalisation'),
  ('laboratoire', 'Laboratoire',
   'Demande d’examen depuis la consultation, saisie et validation des résultats, retour automatique dans le dossier.',
   'soins_plateau', 'laboratoire'),
  ('imagerie', 'Imagerie',
   'Demandes d’échographie ou de radiographie, comptes rendus et images jointes au dossier du patient.',
   'soins_plateau', 'laboratoire'),
  ('urgences', 'Urgences',
   'Admission rapide, même sans identité complète, tri par niveau de gravité et suivi jusqu’à l’orientation du patient.',
   'soins_plateau', 'urgences'),
  ('bloc_operatoire', 'Bloc opératoire',
   'Programme opératoire, équipe, consommables utilisés et compte rendu d’intervention.',
   'soins_plateau', 'hospitalisation'),
  ('pharmacie', 'Dépôt de médicaments et dispensation',
   'Dispensation reliée à l’ordonnance, chaque sortie est tracée.',
   'soins_plateau', 'pharmacie'),
  ('stock', 'Stock, lots et péremptions',
   'Entrées par lot, seuils de réapprovisionnement et dates de péremption signalées avant qu’il ne soit trop tard.',
   'gestion_finances', 'stock'),
  ('inventaire_auto', 'Inventaire guidé',
   'Le stock théorique est proposé ligne par ligne : il reste à compter, et les écarts sont expliqués.',
   'gestion_finances', 'stock'),
  ('caisse', 'Caisse, recettes et dépenses',
   'Espèces, Wave, Orange Money ou Free Money, et une clôture de caisse avec billetage en fin de journée.',
   'gestion_finances', 'caisse'),
  ('tiers_payants', 'Tiers payants',
   'SEN-CSU, mutuelles, IPM et assurances : la part prise en charge et la part du patient calculées à l’encaissement.',
   'gestion_finances', 'caisse'),
  ('devis', 'Devis',
   'Un devis pour une intervention ou un séjour, remis au patient ou à son assurance, puis transformé en facture.',
   'gestion_finances', 'caisse'),
  ('factures_assurances', 'Factures aux assurances',
   'Bordereaux par assureur et par période, suivi des règlements et des rejets.',
   'gestion_finances', 'caisse'),
  ('honoraires', 'Honoraires des praticiens',
   'La part de chaque praticien calculée sur les actes réalisés, selon les règles fixées par la clinique.',
   'gestion_finances', 'comptabilite'),
  ('comptabilite', 'Comptabilité de gestion',
   'Recettes, dépenses et états de gestion par période.',
   'gestion_finances', 'comptabilite'),
  ('comptabilite_syscohada', 'Comptabilité SYSCOHADA',
   'Écritures générées à partir de l’activité, plan comptable SYSCOHADA et export pour l’expert-comptable.',
   'gestion_finances', 'comptabilite'),
  ('personnel', 'Personnel et plannings',
   'Gardes, présences et répartition des tâches de l’équipe.',
   'gestion_finances', 'personnel'),
  ('documents', 'Documents imprimables',
   'Ordonnances, certificats et reçus à l’en-tête de la structure, en A4, A5 ou ticket 80 mm.',
   'gestion_finances', 'documents'),
  ('signature_cachet', 'Signature et cachet',
   'La signature et le cachet du praticien apposés sur les documents, avec un code de vérification.',
   'gestion_finances', 'documents'),
  ('rapports', 'Rapports d’activité',
   'Les chiffres du mois préparés à partir des données saisies au quotidien.',
   'gestion_finances', 'rapports'),
  ('rapports_snis', 'Rapports SNIS',
   'Les données mensuelles demandées par le district, préparées à partir des consultations saisies.',
   'gestion_finances', 'rapports'),
  ('gestion_cds', 'Gestion du comité de santé',
   'Réunions, décisions, tarifs et comptes du comité de développement sanitaire, présentés clairement.',
   'gestion_finances', 'admin'),
  ('multi_sites', 'Plusieurs sites',
   'Plusieurs adresses sous une même clinique : chaque site a son stock et sa caisse, la direction voit l’ensemble.',
   'gestion_finances', 'admin'),
  ('hors_ligne', 'Travail hors connexion',
   'Les écrans essentiels restent utilisables pendant une coupure ; les saisies partent dès le retour du réseau.',
   'gestion_finances', 'admin')
on conflict (code) do nothing;

-- Répartition par plan : 22 fonctionnalités communes, 4 propres au Poste de santé,
-- 12 propres à la Clinique (Poste : 26, Clinique : 34).
insert into public.plan_features (plan_code, feature_code) values
  ('poste_sante', 'patients'),
  ('clinique', 'patients'),
  ('poste_sante', 'file_attente'),
  ('clinique', 'file_attente'),
  ('poste_sante', 'tickets_consultation'),
  ('poste_sante', 'rendez_vous'),
  ('clinique', 'rendez_vous'),
  ('clinique', 'agenda_multi_praticiens'),
  ('poste_sante', 'references'),
  ('clinique', 'references'),
  ('poste_sante', 'whatsapp_liens'),
  ('clinique', 'whatsapp_liens'),
  ('poste_sante', 'whatsapp_api'),
  ('clinique', 'whatsapp_api'),
  ('clinique', 'whatsapp_numero_propre'),
  ('poste_sante', 'communautaire'),
  ('poste_sante', 'consultations'),
  ('clinique', 'consultations'),
  ('poste_sante', 'maternite'),
  ('clinique', 'maternite'),
  ('poste_sante', 'vaccination'),
  ('clinique', 'vaccination'),
  ('poste_sante', 'nutrition_enfant'),
  ('clinique', 'nutrition_enfant'),
  ('poste_sante', 'surveillance_epidemio'),
  ('clinique', 'surveillance_epidemio'),
  ('clinique', 'hospitalisation'),
  ('clinique', 'laboratoire'),
  ('clinique', 'imagerie'),
  ('clinique', 'urgences'),
  ('clinique', 'bloc_operatoire'),
  ('poste_sante', 'pharmacie'),
  ('clinique', 'pharmacie'),
  ('poste_sante', 'stock'),
  ('clinique', 'stock'),
  ('poste_sante', 'inventaire_auto'),
  ('clinique', 'inventaire_auto'),
  ('poste_sante', 'caisse'),
  ('clinique', 'caisse'),
  ('poste_sante', 'tiers_payants'),
  ('clinique', 'tiers_payants'),
  ('clinique', 'devis'),
  ('clinique', 'factures_assurances'),
  ('clinique', 'honoraires'),
  ('poste_sante', 'comptabilite'),
  ('clinique', 'comptabilite'),
  ('clinique', 'comptabilite_syscohada'),
  ('poste_sante', 'personnel'),
  ('clinique', 'personnel'),
  ('poste_sante', 'documents'),
  ('clinique', 'documents'),
  ('poste_sante', 'signature_cachet'),
  ('clinique', 'signature_cachet'),
  ('poste_sante', 'rapports'),
  ('clinique', 'rapports'),
  ('poste_sante', 'rapports_snis'),
  ('poste_sante', 'gestion_cds'),
  ('clinique', 'multi_sites'),
  ('poste_sante', 'hors_ligne'),
  ('clinique', 'hors_ligne')
on conflict (plan_code, feature_code) do nothing;
