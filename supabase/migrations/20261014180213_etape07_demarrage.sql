-- =============================================================================
-- Étape 7 — Assistant de démarrage
-- -----------------------------------------------------------------------------
-- Contenu :
--   1. service_templates   : services proposés à la création, par type de structure
--                            (référentiel, AUCUN tarif : chaque structure fixe les siens)
--   2. services            : services et tarifs de la structure (FCFA entiers)
--   3. payers              : tiers payants acceptés (SEN-CSU, mutuelles, IPM, assurances)
--   4. pending_invitations : premiers membres notés « en attente » (invitations : étape 9)
--   5. RPC                 : update_org_settings, save_services, save_payers,
--                            save_pending_invitations (SECURITY INVOKER : RLS et droits
--                            colonne par colonne s'appliquent comme pour une requête directe)
--   6. Droits et RLS       : les membres lisent ; owner et admin écrivent ; aucun DELETE
--   7. Storage             : bucket public « logos », écriture réservée à owner et admin
--   8. Référentiel         : services proposés pour le Poste de santé et la Clinique
--
-- La progression de l'assistant est gardée dans organizations.settings :
--   settings.onboarding    = { etapes: { identite: 'faite' | 'passee', … },
--                              equipe_seul, aucun_tiers_payant, vu_le, termine_le }
--   settings.opening_hours = { lundi: { ouvert, debut, fin }, … }
-- =============================================================================


-- =============================================================================
-- 1. Référentiel : services proposés par type de structure
-- =============================================================================

create table public.service_templates (
  plan_code  text not null references public.plans (code) on update cascade,
  code       text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  category   text not null check (category in (
               'consultation', 'maternite', 'soins', 'hospitalisation', 'examens',
               'documents', 'autre')),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, code)
);

comment on table public.service_templates is
  'Services proposés dans l''assistant de démarrage, par type. Aucun tarif : il appartient à chaque structure.';

create trigger service_templates_set_updated_at before update on public.service_templates
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. Services et tarifs de la structure
-- =============================================================================

create table public.services (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  template_code text,                                   -- null : service ajouté à la main
  label         text not null check (char_length(btrim(label)) between 2 and 120),
  category      text not null default 'autre' check (category in (
                  'consultation', 'maternite', 'soins', 'hospitalisation', 'examens',
                  'documents', 'autre')),
  price         bigint check (price >= 0),              -- FCFA entiers ; null = à saisir
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz
);

-- Un même libellé une seule fois par structure (hors services retirés).
create unique index services_org_label_unique
  on public.services (org_id, lower(btrim(label))) where deleted_at is null;
create index services_org_id_idx on public.services (org_id);

comment on table public.services is
  'Services de la structure et leur tarif en FCFA entiers (null tant qu''il n''est pas saisi).';


-- =============================================================================
-- 3. Tiers payants acceptés
-- =============================================================================

create table public.payers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  kind          text not null check (kind in ('sen_csu', 'mutuelle', 'ipm', 'assurance')),
  name          text not null check (char_length(btrim(name)) between 2 and 160),
  -- Part prise en charge par défaut, en pourcentage entier, selon la convention de la
  -- structure avec l'organisme. null = non renseignée (aucune valeur supposée).
  coverage_rate integer check (coverage_rate between 0 and 100),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz
);

create unique index payers_org_kind_name_unique
  on public.payers (org_id, kind, lower(btrim(name))) where deleted_at is null;
create index payers_org_id_idx on public.payers (org_id);

comment on table public.payers is
  'Tiers payants acceptés par la structure, avec un taux de prise en charge par défaut modifiable.';


-- =============================================================================
-- 4. Premiers membres, en attente d'invitation
-- =============================================================================

create table public.pending_invitations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  full_name  text not null check (char_length(btrim(full_name)) between 2 and 160),
  phone      text check (phone ~ '^\+[0-9]{8,15}$'),  -- E.164
  email      text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Mêmes rôles que memberships, sauf owner : un propriétaire n'est jamais invité ainsi.
  role       text not null check (role in (
               'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
               'pharmacien', 'caissier', 'comptable', 'accueil', 'laborantin',
               'agent_communautaire')),
  -- pending : noté dans l'assistant ; les autres statuts serviront à l'étape 9 (serveur).
  status     text not null default 'pending'
               check (status in ('pending', 'sent', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  check (phone is not null or email is not null)
);

create index pending_invitations_org_id_idx on public.pending_invitations (org_id);

comment on table public.pending_invitations is
  'Membres notés pendant l''assistant de démarrage. Les invitations réelles partent à l''étape 9.';


-- =============================================================================
-- 5. Triggers : updated_at et audit
-- =============================================================================

create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger payers_set_updated_at before update on public.payers
  for each row execute function public.set_updated_at();
create trigger pending_invitations_set_updated_at before update on public.pending_invitations
  for each row execute function public.set_updated_at();

create trigger services_audit
  after insert or update or delete on public.services
  for each row execute function public.audit_trigger();
create trigger payers_audit
  after insert or update or delete on public.payers
  for each row execute function public.audit_trigger();
create trigger pending_invitations_audit
  after insert or update or delete on public.pending_invitations
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 6. RPC
-- -----------------------------------------------------------------------------
-- Toutes en SECURITY INVOKER : elles ne donnent aucun droit de plus qu'une requête
-- directe (RLS et droits colonne par colonne). Elles servent à :
--   - fusionner settings sans écraser les clés écrites par un autre écran ;
--   - enregistrer une liste en une transaction, de façon rejouable : les identifiants
--     sont créés par le navigateur, un second envoi après une coupure ne crée pas de
--     doublon.
-- p_rows : [{ id, …, removed }] ; removed = true -> retrait doux (deleted_at).
-- =============================================================================

-- Fusionne p_patch dans settings (premier niveau). Renvoie les réglages à jour.
create function public.update_org_settings(p_org_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Réglages invalides.' using errcode = '22023';
  end if;

  update public.organizations
     set settings = settings || p_patch
   where id = p_org_id
  returning settings into v_settings;

  if not found then
    raise exception 'Vous n''avez pas les droits nécessaires pour modifier cette structure.'
      using errcode = '42501';
  end if;

  return v_settings;
end;
$$;

create function public.save_services(p_org_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Retraits d'abord : un libellé retiré puis rajouté ne heurte pas l'index unique.
  update public.services s
     set deleted_at = now()
    from jsonb_to_recordset(p_rows) as r (id uuid, removed boolean)
   where s.id = r.id
     and s.org_id = p_org_id
     and r.removed
     and s.deleted_at is null;

  insert into public.services (id, org_id, template_code, label, category, price, is_active, sort_order)
  select r.id, p_org_id, r.template_code, btrim(r.label), coalesce(r.category, 'autre'),
         r.price, coalesce(r.is_active, true), coalesce(r.sort_order, 0)
    from jsonb_to_recordset(p_rows) as r (
           id uuid, template_code text, label text, category text, price bigint,
           is_active boolean, sort_order integer, removed boolean)
   where not coalesce(r.removed, false)
  on conflict (id) do update
     set label      = excluded.label,
         category   = excluded.category,
         price      = excluded.price,
         is_active  = excluded.is_active,
         sort_order = excluded.sort_order
   where services.org_id = p_org_id
     and services.deleted_at is null;
end;
$$;

create function public.save_payers(p_org_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.payers p
     set deleted_at = now()
    from jsonb_to_recordset(p_rows) as r (id uuid, removed boolean)
   where p.id = r.id
     and p.org_id = p_org_id
     and r.removed
     and p.deleted_at is null;

  insert into public.payers (id, org_id, kind, name, coverage_rate, is_active)
  select r.id, p_org_id, r.kind, btrim(r.name), r.coverage_rate, coalesce(r.is_active, true)
    from jsonb_to_recordset(p_rows) as r (
           id uuid, kind text, name text, coverage_rate integer, is_active boolean,
           removed boolean)
   where not coalesce(r.removed, false)
  on conflict (id) do update
     set name          = excluded.name,
         coverage_rate = excluded.coverage_rate,
         is_active     = excluded.is_active
   where payers.org_id = p_org_id
     and payers.deleted_at is null;
end;
$$;

create function public.save_pending_invitations(p_org_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.pending_invitations i
     set deleted_at = now()
    from jsonb_to_recordset(p_rows) as r (id uuid, removed boolean)
   where i.id = r.id
     and i.org_id = p_org_id
     and r.removed
     and i.deleted_at is null;

  insert into public.pending_invitations (id, org_id, full_name, phone, email, role)
  select r.id, p_org_id, btrim(r.full_name), nullif(btrim(r.phone), ''),
         nullif(lower(btrim(r.email)), ''), r.role
    from jsonb_to_recordset(p_rows) as r (
           id uuid, full_name text, phone text, email text, role text, removed boolean)
   where not coalesce(r.removed, false)
  on conflict (id) do update
     set full_name = excluded.full_name,
         phone     = excluded.phone,
         email     = excluded.email,
         role      = excluded.role
   where pending_invitations.org_id = p_org_id
     and pending_invitations.deleted_at is null
     and pending_invitations.status = 'pending';
end;
$$;

comment on function public.update_org_settings(uuid, jsonb) is
  'Fusionne des clés dans organizations.settings (owner et admin, par la RLS).';
comment on function public.save_services(uuid, jsonb) is
  'Enregistre la liste des services d''une structure en une transaction, de façon rejouable.';
comment on function public.save_payers(uuid, jsonb) is
  'Enregistre la liste des tiers payants d''une structure en une transaction, de façon rejouable.';
comment on function public.save_pending_invitations(uuid, jsonb) is
  'Enregistre les membres en attente d''invitation, en une transaction, de façon rejouable.';


-- =============================================================================
-- 7. Droits d'accès
-- =============================================================================

revoke all on
  public.service_templates, public.services, public.payers, public.pending_invitations
from anon, authenticated;

grant select on public.service_templates to authenticated;

-- org_id, created_by, created_at ne sont jamais modifiables après la création.
grant select on public.services to authenticated;
grant insert (id, org_id, template_code, label, category, price, is_active, sort_order)
  on public.services to authenticated;
grant update (label, category, price, is_active, sort_order, deleted_at)
  on public.services to authenticated;

grant select on public.payers to authenticated;
grant insert (id, org_id, kind, name, coverage_rate, is_active)
  on public.payers to authenticated;
grant update (name, coverage_rate, is_active, deleted_at)
  on public.payers to authenticated;

-- status reste réservé au serveur (envoi des invitations, étape 9).
grant select on public.pending_invitations to authenticated;
grant insert (id, org_id, full_name, phone, email, role)
  on public.pending_invitations to authenticated;
grant update (full_name, phone, email, role, deleted_at)
  on public.pending_invitations to authenticated;

revoke execute on function
  public.update_org_settings(uuid, jsonb),
  public.save_services(uuid, jsonb),
  public.save_payers(uuid, jsonb),
  public.save_pending_invitations(uuid, jsonb)
from public, anon;
grant execute on function
  public.update_org_settings(uuid, jsonb),
  public.save_services(uuid, jsonb),
  public.save_payers(uuid, jsonb),
  public.save_pending_invitations(uuid, jsonb)
to authenticated;


-- =============================================================================
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
-- Aucune policy DELETE : retrait doux par deleted_at.
-- =============================================================================

alter table public.service_templates   enable row level security;
alter table public.services            enable row level security;
alter table public.payers              enable row level security;
alter table public.pending_invitations enable row level security;

create policy service_templates_select_all on public.service_templates
  for select to authenticated using (true);

create policy services_select_member on public.services
  for select to authenticated
  using (public.is_member(org_id));
create policy services_insert_admin on public.services
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']));
create policy services_update_admin on public.services
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin']));

create policy payers_select_member on public.payers
  for select to authenticated
  using (public.is_member(org_id));
create policy payers_insert_admin on public.payers
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']));
create policy payers_update_admin on public.payers
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin']));

create policy pending_invitations_select_member on public.pending_invitations
  for select to authenticated
  using (public.is_member(org_id));
create policy pending_invitations_insert_admin on public.pending_invitations
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin']));
create policy pending_invitations_update_admin on public.pending_invitations
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin']));


-- =============================================================================
-- 9. Storage : bucket public « logos »
-- -----------------------------------------------------------------------------
-- Chemin : {org_id}/logo-{horodatage}.webp. Un nouveau nom à chaque envoi : le cache
-- du CDN ne sert jamais l'ancien logo. Lecture publique par l'URL (bucket public) ;
-- dépôt réservé à owner et admin de la structure du premier dossier.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Premier dossier du chemin, s'il est un uuid ; sinon null (aucune policy ne passe).
create function public.storage_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1)
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke execute on function public.storage_org_id(text) from public, anon;
grant execute on function public.storage_org_id(text) to authenticated;

create policy logos_select_member on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and public.is_member(public.storage_org_id(name)));

create policy logos_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.has_role(public.storage_org_id(name), array['owner', 'admin'])
  );


-- =============================================================================
-- 10. Référentiel des services proposés (libellés seulement, jamais de tarif)
-- -----------------------------------------------------------------------------
-- Toute correction ultérieure passe par une nouvelle migration.
-- =============================================================================

insert into public.service_templates (plan_code, code, label, category, sort_order) values
  ('poste_sante', 'consultation_adulte',     'Consultation adulte',            'consultation',    10),
  ('poste_sante', 'consultation_enfant',     'Consultation enfant',            'consultation',    20),
  ('poste_sante', 'cpn',                     'Consultation prénatale (CPN)',   'maternite',       30),
  ('poste_sante', 'accouchement',            'Accouchement',                   'maternite',       40),
  ('poste_sante', 'consultation_postnatale', 'Consultation postnatale',        'maternite',       50),
  ('poste_sante', 'planification_familiale', 'Planification familiale',        'maternite',       60),
  ('poste_sante', 'pansement',               'Pansement',                      'soins',           70),
  ('poste_sante', 'injection',               'Injection',                      'soins',           80),
  ('poste_sante', 'perfusion',               'Pose de perfusion',              'soins',           90),
  ('poste_sante', 'suture',                  'Suture',                         'soins',          100),
  ('poste_sante', 'mise_en_observation',     'Mise en observation',            'hospitalisation', 110),
  ('poste_sante', 'carnet_sante',            'Carnet de santé',                'documents',      120),
  ('poste_sante', 'certificat_medical',      'Certificat médical',             'documents',      130),

  ('clinique', 'consultation_generale',      'Consultation générale',          'consultation',    10),
  ('clinique', 'consultation_specialisee',   'Consultation spécialisée',       'consultation',    20),
  ('clinique', 'consultation_controle',      'Consultation de contrôle',       'consultation',    30),
  ('clinique', 'consultation_urgence',       'Consultation d’urgence',         'consultation',    40),
  ('clinique', 'cpn',                        'Consultation prénatale (CPN)',   'maternite',       50),
  ('clinique', 'accouchement',               'Accouchement',                   'maternite',       60),
  ('clinique', 'nuitee',                     'Nuitée d’hospitalisation',       'hospitalisation', 70),
  ('clinique', 'echographie',                'Échographie',                    'examens',         80),
  ('clinique', 'radiographie',               'Radiographie',                   'examens',         90),
  ('clinique', 'ecg',                        'Électrocardiogramme (ECG)',      'examens',        100),
  ('clinique', 'prelevement',                'Prélèvement pour analyses',      'examens',        110),
  ('clinique', 'pansement',                  'Pansement',                      'soins',          120),
  ('clinique', 'injection',                  'Injection',                      'soins',          130),
  ('clinique', 'certificat_medical',         'Certificat médical',             'documents',      140)
on conflict (plan_code, code) do nothing;
