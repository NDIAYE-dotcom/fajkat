-- =============================================================================
-- Étape 11 — Registre des patients (feature « patients »)
-- -----------------------------------------------------------------------------
-- 1. Extensions et aides : pg_trgm + unaccent (schéma extensions), normalisation des
--    textes, droits (identité, écriture, médical, sensible), indicateur
--    memberships.is_clinician (owner ou admin qui exerce une profession soignante).
-- 2. households          : ménages (famille, numéro partagé).
-- 3. patients            : IDENTITÉ seulement. Numéro de dossier automatique par structure
--                          et par année (PS-2026-000123 / CL-2026-000123). Date de naissance
--                          exacte OU âge déclaré (année estimée).
-- 4. patient_medical     : groupe sanguin, allergies, antécédents, is_sensitive. Aucune
--                          lecture directe : RPC get_patient_medical (soignants), qui
--                          journalise chaque lecture d'antécédents sensibles.
-- 5. patient_coverages   : régimes et tiers payants (payers de l'étape 7).
-- 6. Recherche tolérante (search_patients), doublons (find_duplicate_candidates),
--    fusion (merge_patients, owner et admin, journalisée, sans suppression physique),
--    import (import_patients, owner et admin, erreurs ligne par ligne).
-- 7. Storage : bucket privé « patients » ({org_id}/{patient_id}/{fichier}).
--
-- Qui fait quoi :
--   identité (lecture)  : owner, admin, médecin, sage-femme, infirmier, aide-soignant,
--                         accueil, caissier, pharmacien, laborantin ;
--   identité (écriture) : les mêmes sauf pharmacien et laborantin ;
--   médical             : médecin, sage-femme, infirmier, aide-soignant, et owner ou admin
--                         avec is_clinician ;
--   antécédents sensibles : médecin, sage-femme, infirmier, et owner ou admin avec
--                         is_clinician.
-- Comptable et agent communautaire : aucun accès au registre.
--
-- Les refus métier lèvent le code 22023 avec un message en français, affiché tel quel.
-- =============================================================================


-- =============================================================================
-- 1. Extensions et aides
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Minuscules, sans accents ni apostrophes, espaces réduits : « N’Diaye  Fatou » -> « ndiaye fatou ».
-- unaccent n'est pas déclarée IMMUTABLE (dictionnaire modifiable) : le dictionnaire est
-- nommé explicitement, la fonction peut donc l'être.
create function public.patient_normalize(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(
             lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))),
             '[''’`]', '', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Owner ou admin qui exerce une profession soignante (ICP propriétaire d'un poste,
-- médecin propriétaire d'une clinique). Activé par un owner (set_member_clinician).
alter table public.memberships
  add column is_clinician boolean not null default false;

comment on column public.memberships.is_clinician is
  'Owner ou admin exerçant une profession soignante : accès aux données médicales.';

create function public.is_clinician_manager(p_org_id uuid)
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
       and m.role in ('owner', 'admin')
       and m.is_clinician
       and m.is_active
       and m.deleted_at is null
       and o.deleted_at is null
  );
$$;

create function public.patients_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'patients')
     and public.has_role(p_org_id, array[
           'owner', 'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
           'accueil', 'caissier', 'pharmacien', 'laborantin']);
$$;

-- Abonnement actif : la lecture seule et la suspension bloquent toute écriture.
create function public.patients_org_writable(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_org_status(p_org_id), 'suspended')
         not in ('read_only', 'suspended');
$$;

-- Le caissier crée et corrige l'identité : dans un poste, c'est souvent lui qui accueille.
create function public.patients_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'patients')
     and public.patients_org_writable(p_org_id)
     and public.has_role(p_org_id, array[
           'owner', 'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
           'accueil', 'caissier']);
$$;

create function public.patients_can_read_medical(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'patients')
     and (public.has_role(p_org_id, array['medecin', 'sage_femme', 'infirmier', 'aide_soignant'])
          or public.is_clinician_manager(p_org_id));
$$;

create function public.patients_can_read_sensitive(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'patients')
     and (public.has_role(p_org_id, array['medecin', 'sage_femme', 'infirmier'])
          or public.is_clinician_manager(p_org_id));
$$;

-- Droits de l'utilisateur connecté, pour le front (affichage seulement : la base décide).
create function public.patient_permissions(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'read',      public.patients_can_read(p_org_id),
    'write',     public.patients_can_write(p_org_id),
    'medical',   public.patients_can_read_medical(p_org_id),
    'sensitive', public.patients_can_read_sensitive(p_org_id),
    'merge',     public.has_role(p_org_id, array['owner', 'admin'])
                 and public.patients_can_write(p_org_id),
    'import',    public.has_role(p_org_id, array['owner', 'admin'])
                 and public.patients_can_write(p_org_id));
$$;

-- Activation de l'indicateur « exerce une profession soignante » : par un owner, pour
-- lui-même ou pour un owner ou un admin. Journalisé par memberships_audit.
create function public.set_member_clinician(p_membership_id uuid, p_value boolean)
returns public.memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne public.memberships;
begin
  select * into v_ligne from public.memberships
   where id = p_membership_id and deleted_at is null
     for update;
  if not found then
    raise exception 'Ce membre est introuvable.' using errcode = '22023';
  end if;
  if not public.has_role(v_ligne.org_id, array['owner']) then
    raise exception 'Seul le propriétaire de la structure peut modifier cet accès.'
      using errcode = '42501';
  end if;
  if not public.patients_org_writable(v_ligne.org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if v_ligne.role not in ('owner', 'admin') then
    raise exception 'Ce réglage concerne seulement le propriétaire et les administrateurs : les rôles soignants ont déjà accès aux données médicales.'
      using errcode = '22023';
  end if;

  update public.memberships set is_clinician = coalesce(p_value, false)
   where id = p_membership_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;


-- =============================================================================
-- 2. Ménages
-- =============================================================================

create table public.households (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  phone         text check (phone ~ '^\+[0-9]{8,15}$'),
  neighborhood  text check (char_length(neighborhood) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id)
);

create index households_org_idx on public.households (org_id);

comment on table public.households is
  'Ménages : regroupe une famille, souvent derrière un même numéro de téléphone.';

create trigger households_set_updated_at before update on public.households
  for each row execute function public.set_updated_at();
create trigger households_audit
  after insert or update or delete on public.households
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 3. Patients (identité)
-- =============================================================================

create table public.patients (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations (id),
  -- Attribué par le serveur à la création, jamais modifié.
  file_number                 text not null,
  -- Numéro de l'ancien registre papier ou logiciel (import), cherchable.
  legacy_file_number          text check (char_length(legacy_file_number) <= 40),
  last_name                   text not null,
  first_name                  text not null,
  sex                         text not null,
  -- Date exacte, ou âge déclaré : l'année de naissance est alors estimée.
  birth_date                  date,
  declared_age                smallint,
  age_declared_on             date,
  birth_year                  smallint,
  phone                       text,
  -- À qui appartient le téléphone : un numéro sert souvent à toute la famille.
  phone_owner                 text,
  phone_secondary             text,
  neighborhood                text check (char_length(neighborhood) <= 120),
  commune                     text check (char_length(commune) <= 120),
  occupation                  text check (char_length(occupation) <= 120),
  marital_status              text,
  mother_first_name           text check (char_length(mother_first_name) <= 80),
  mother_last_name            text check (char_length(mother_last_name) <= 80),
  emergency_contact_name      text check (char_length(emergency_contact_name) <= 160),
  emergency_contact_phone     text,
  emergency_contact_relation  text check (char_length(emergency_contact_relation) <= 60),
  preferred_language          text not null default 'fr',
  -- null : pas encore demandé ; la date est fixée par le serveur à chaque réponse.
  whatsapp_consent            boolean,
  whatsapp_consent_at         timestamptz,
  photo_path                  text,
  household_id                uuid,
  -- Doublon fusionné : pointe vers le dossier conservé (et deleted_at est rempli).
  merged_into_id              uuid,
  -- Maintenus par le trigger patients_prepare (recherche).
  search_text                 text not null default '',
  name_text                   text not null default '',
  phone_digits                text not null default '',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at                  timestamptz,

  constraint patients_org_file_number_unique unique (org_id, file_number),
  constraint patients_id_org_unique unique (id, org_id),
  constraint patients_last_name_check check (char_length(btrim(last_name)) between 1 and 80),
  constraint patients_first_name_check check (char_length(btrim(first_name)) between 1 and 80),
  constraint patients_sex_check check (sex in ('F', 'M')),
  constraint patients_declared_age_check check (declared_age between 0 and 130),
  constraint patients_birth_check check (birth_date is not null or birth_year is not null),
  constraint patients_birth_date_check check (birth_date >= date '1890-01-01'),
  constraint patients_phone_check check (phone ~ '^\+[0-9]{8,15}$'),
  constraint patients_phone_secondary_check check (phone_secondary ~ '^\+[0-9]{8,15}$'),
  constraint patients_emergency_phone_check
    check (emergency_contact_phone ~ '^\+[0-9]{8,15}$'),
  constraint patients_phone_owner_check
    check (phone_owner in ('patient', 'mere', 'pere', 'conjoint', 'autre')),
  constraint patients_marital_status_check
    check (marital_status in ('celibataire', 'marie', 'divorce', 'veuf', 'autre')),
  constraint patients_language_check
    check (preferred_language in ('fr', 'wo', 'ff', 'srr', 'dyo', 'mnk', 'snk', 'autre')),
  constraint patients_consent_check
    check (whatsapp_consent is null or whatsapp_consent_at is not null),
  constraint patients_photo_path_check
    check (photo_path like org_id::text || '/' || id::text || '/%'),
  constraint patients_merge_check check (merged_into_id is null or deleted_at is not null),
  foreign key (household_id, org_id) references public.households (id, org_id),
  foreign key (merged_into_id, org_id) references public.patients (id, org_id)
);

create index patients_org_created_idx on public.patients (org_id, created_at desc);
create index patients_household_idx on public.patients (household_id) where household_id is not null;
create index patients_search_trgm_idx
  on public.patients using gin (search_text extensions.gin_trgm_ops);
create index patients_phone_trgm_idx
  on public.patients using gin (phone_digits extensions.gin_trgm_ops);
create index patients_name_trgm_idx
  on public.patients using gin (name_text extensions.gin_trgm_ops);

comment on table public.patients is
  'Registre des patients : identité seulement. Le médical vit dans patient_medical.';

-- Compteur des numéros de dossier, par structure et par année.
create table public.patient_counters (
  org_id      uuid not null references public.organizations (id),
  year        smallint not null,
  last_value  integer not null default 0,
  primary key (org_id, year)
);

comment on table public.patient_counters is
  'Dernier numéro de dossier attribué, par structure et par année. Serveur uniquement.';

-- PS-2026-000123 (poste de santé) ou CL-2026-000123 (clinique). L'année et le préfixe
-- sont ceux du jour de la création : après un passage Poste -> Clinique, les anciens
-- numéros restent inchangés.
create function public.next_patient_file_number(p_org_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   public.organizations;
  v_annee smallint;
  v_n     integer;
begin
  select * into v_org from public.organizations where id = p_org_id;
  v_annee := extract(year from now() at time zone v_org.timezone)::smallint;

  insert into public.patient_counters as c (org_id, year, last_value)
  values (p_org_id, v_annee, 1)
  on conflict (org_id, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_n;

  return case when v_org.type = 'clinique' then 'CL' else 'PS' end
         || '-' || v_annee || '-' || lpad(v_n::text, greatest(6, length(v_n::text)), '0');
end;
$$;

-- Numéro, année de naissance, consentement horodaté, champs de recherche.
create function public.patients_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  select (now() at time zone o.timezone)::date into v_today
    from public.organizations o where o.id = new.org_id;

  if tg_op = 'INSERT' then
    new.file_number := public.next_patient_file_number(new.org_id);
  else
    new.file_number := old.file_number;
    new.org_id := old.org_id;
  end if;

  new.last_name := btrim(new.last_name);
  new.first_name := btrim(new.first_name);

  if new.birth_date is not null then
    if new.birth_date > v_today then
      raise exception 'La date de naissance ne peut pas être dans le futur.' using errcode = '22023';
    end if;
    new.birth_year := extract(year from new.birth_date)::smallint;
    new.declared_age := null;
    new.age_declared_on := null;
  elsif new.declared_age is not null then
    -- L'âge est déclaré « aujourd'hui » : l'année estimée ne bouge plus ensuite.
    if tg_op = 'INSERT' or new.declared_age is distinct from old.declared_age
       or old.age_declared_on is null then
      new.age_declared_on := v_today;
    else
      new.age_declared_on := old.age_declared_on;
    end if;
    new.birth_year := (extract(year from new.age_declared_on) - new.declared_age)::smallint;
  else
    new.birth_year := null;
  end if;

  if new.phone is null then
    new.phone_owner := null;
  end if;

  if tg_op = 'INSERT' then
    new.whatsapp_consent_at := case when new.whatsapp_consent is null then null else now() end;
  elsif new.whatsapp_consent is distinct from old.whatsapp_consent then
    new.whatsapp_consent_at := case when new.whatsapp_consent is null then null else now() end;
  else
    new.whatsapp_consent_at := old.whatsapp_consent_at;
  end if;

  new.name_text := public.patient_normalize(new.last_name || ' ' || new.first_name);
  new.search_text := public.patient_normalize(concat_ws(' ',
    new.last_name, new.first_name, new.file_number, new.legacy_file_number,
    new.mother_first_name, new.mother_last_name, new.neighborhood));
  new.phone_digits := concat_ws(' ',
    regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'),
    regexp_replace(coalesce(new.phone_secondary, ''), '\D', '', 'g'));
  return new;
end;
$$;

create trigger patients_prepare
  before insert or update on public.patients
  for each row execute function public.patients_prepare();
create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger patients_audit
  after insert or update or delete on public.patients
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 4. Données médicales (séparées de l'identité)
-- =============================================================================

create table public.patient_medical (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id),
  patient_id       uuid not null,
  blood_group      text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies        text check (char_length(allergies) <= 1000),
  medical_history  text check (char_length(medical_history) <= 4000),
  -- Antécédents sensibles (VIH / PTME, santé mentale…) : lus seulement par les rôles
  -- habilités, chaque lecture journalisée dans patient_access_logs.
  is_sensitive     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at       timestamptz,
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);

create unique index patient_medical_patient_unique
  on public.patient_medical (patient_id) where deleted_at is null;

comment on table public.patient_medical is
  'Données médicales de base. Lues par get_patient_medical, écrites par save_patient_medical.';

create trigger patient_medical_set_updated_at before update on public.patient_medical
  for each row execute function public.set_updated_at();

-- Journal sans valeurs médicales : audit_logs est lisible par owner et admin, qui ne sont
-- pas forcément soignants. On garde l'auteur, la date et les champs modifiés.
create function public.patient_medical_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_champs text[];
begin
  select coalesce(array_agg(k order by k), '{}') into v_champs
    from jsonb_object_keys(coalesce(v_new, v_old)) k
   where k not in ('updated_at', 'created_at')
     and (v_old is null or v_new is null or v_old -> k is distinct from v_new -> k);
  if tg_op = 'UPDATE' and cardinality(v_champs) = 0 then
    return null;
  end if;

  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values (coalesce(new.org_id, old.org_id), auth.uid(), tg_op, 'patient_medical',
          coalesce(new.id, old.id)::text, null,
          jsonb_build_object('patient_id', coalesce(new.patient_id, old.patient_id),
                             'changed_fields', to_jsonb(v_champs),
                             'is_sensitive', coalesce(new.is_sensitive, old.is_sensitive)));
  return null;
end;
$$;

create trigger patient_medical_audit
  after insert or update or delete on public.patient_medical
  for each row execute function public.patient_medical_audit();

-- Lectures des antécédents sensibles : qui, quand, quel patient. En ajout seul.
create table public.patient_access_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id),
  patient_id  uuid not null,
  user_id     uuid,
  access_type text not null check (access_type in ('medical_sensitive')),
  created_at  timestamptz not null default now()
);

create index patient_access_logs_org_idx on public.patient_access_logs (org_id, created_at desc);
create index patient_access_logs_patient_idx on public.patient_access_logs (patient_id);

comment on table public.patient_access_logs is
  'Journal des lectures de données sensibles. Jamais modifié ni supprimé.';

create trigger patient_access_logs_immutable
  before update or delete on public.patient_access_logs
  for each row execute function public.audit_logs_immutable();

-- Lecture : soignants. Antécédents sensibles masqués (history_hidden) pour l'aide-soignant ;
-- sinon lus et journalisés. Aucune ligne si rien n'a été saisi.
create function public.get_patient_medical(p_patient_id uuid)
returns table (
  patient_id uuid, blood_group text, allergies text, medical_history text,
  is_sensitive boolean, history_hidden boolean, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_ligne public.patient_medical;
  v_sens  boolean;
begin
  select p.org_id into v_org from public.patients p where p.id = p_patient_id;
  if v_org is null or not public.patients_can_read_medical(v_org) then
    raise exception 'Les données médicales sont réservées aux soignants.' using errcode = '42501';
  end if;

  select * into v_ligne from public.patient_medical m
   where m.patient_id = p_patient_id and m.deleted_at is null;
  if not found then
    return;
  end if;

  v_sens := public.patients_can_read_sensitive(v_org);
  if v_ligne.is_sensitive and v_sens and v_ligne.medical_history is not null then
    insert into public.patient_access_logs (org_id, patient_id, user_id, access_type)
    values (v_org, p_patient_id, auth.uid(), 'medical_sensitive');
  end if;

  return query select
    v_ligne.patient_id, v_ligne.blood_group, v_ligne.allergies,
    case when v_ligne.is_sensitive and not v_sens then null else v_ligne.medical_history end,
    v_ligne.is_sensitive,
    v_ligne.is_sensitive and not v_sens,
    v_ligne.updated_at;
end;
$$;

-- Écriture : soignants. Sans habilitation « sensible », on ne touche ni au drapeau ni aux
-- antécédents d'une fiche sensible (on peut encore corriger groupe sanguin et allergies).
create function public.save_patient_medical(
  p_patient_id uuid, p_blood_group text, p_allergies text, p_medical_history text,
  p_is_sensitive boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_ligne public.patient_medical;
  v_sens  boolean;
begin
  select p.org_id into v_org from public.patients p
   where p.id = p_patient_id and p.deleted_at is null;
  if v_org is null or not public.patients_can_read_medical(v_org) then
    raise exception 'Les données médicales sont réservées aux soignants.' using errcode = '42501';
  end if;
  if not public.patients_org_writable(v_org) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  v_sens := public.patients_can_read_sensitive(v_org);

  select * into v_ligne from public.patient_medical m
   where m.patient_id = p_patient_id and m.deleted_at is null
     for update;

  if not found then
    insert into public.patient_medical (org_id, patient_id, blood_group, allergies,
                                        medical_history, is_sensitive)
    values (v_org, p_patient_id, nullif(btrim(p_blood_group), ''),
            nullif(btrim(coalesce(p_allergies, '')), ''),
            nullif(btrim(coalesce(p_medical_history, '')), ''),
            v_sens and coalesce(p_is_sensitive, false));
    return;
  end if;

  update public.patient_medical m
     set blood_group = nullif(btrim(p_blood_group), ''),
         allergies = nullif(btrim(coalesce(p_allergies, '')), ''),
         medical_history = case
           when v_ligne.is_sensitive and not v_sens then m.medical_history
           else nullif(btrim(coalesce(p_medical_history, '')), '') end,
         is_sensitive = case when v_sens then coalesce(p_is_sensitive, false)
                             else m.is_sensitive end
   where m.id = v_ligne.id;
end;
$$;


-- =============================================================================
-- 5. Couvertures (régimes, tiers payants)
-- =============================================================================

create unique index payers_id_org_unique on public.payers (id, org_id);

create table public.patient_coverages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  patient_id     uuid not null,
  scheme         text not null check (scheme in (
                   'sen_csu', 'mutuelle', 'ipm', 'assurance', 'indigent', 'aucun')),
  payer_id       uuid,
  member_number  text check (char_length(member_number) <= 60),
  -- Part prise en charge, en pourcentage entier. Reprise du tiers payant si non saisie.
  coverage_rate  integer check (coverage_rate between 0 and 100),
  valid_from     date,
  valid_to       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (payer_id, org_id) references public.payers (id, org_id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check (payer_id is null or scheme in ('sen_csu', 'mutuelle', 'ipm', 'assurance'))
);

create index patient_coverages_patient_idx on public.patient_coverages (patient_id);

comment on table public.patient_coverages is
  'Prises en charge du patient : régime, tiers payant, numéro d''assuré, taux, validité.';

-- Le tiers payant choisi doit être du même régime ; taux repris de sa convention.
create function public.patient_coverages_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payer public.payers;
begin
  if new.payer_id is not null then
    select * into v_payer from public.payers where id = new.payer_id;
    if v_payer.kind <> new.scheme then
      raise exception 'Ce tiers payant ne correspond pas au régime choisi.' using errcode = '22023';
    end if;
    if new.coverage_rate is null then
      new.coverage_rate := v_payer.coverage_rate;
    end if;
  end if;
  return new;
end;
$$;

create trigger patient_coverages_prepare
  before insert or update on public.patient_coverages
  for each row execute function public.patient_coverages_prepare();
create trigger patient_coverages_set_updated_at before update on public.patient_coverages
  for each row execute function public.set_updated_at();
create trigger patient_coverages_audit
  after insert or update or delete on public.patient_coverages
  for each row execute function public.audit_trigger();


-- =============================================================================
-- 6. Recherche, doublons, fusion, import
-- =============================================================================

-- Recherche du registre, paginée côté serveur. Sans accents ni apostrophes, mots dans
-- n'importe quel ordre (nom et prénom inversés), petites fautes tolérées ; un numéro
-- (au moins 3 chiffres) cherche dans les téléphones et les numéros de dossier.
-- Requête vide : derniers patients créés. total_count : nombre total de résultats.
-- SECURITY DEFINER (fonctions de pg_trgm dans le schéma extensions) : l'accès est
-- vérifié par patients_can_read et tout est filtré sur p_org_id.
create function public.search_patients(
  p_org_id uuid, p_query text default '', p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, file_number text, legacy_file_number text, last_name text, first_name text,
  sex text, birth_date date, birth_year smallint, declared_age smallint, phone text,
  phone_owner text, neighborhood text, mother_first_name text, household_id uuid,
  photo_path text, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q       text := public.patient_normalize(p_query);
  v_chiffres text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_numero  boolean;
  v_mots    text[];
begin
  if not public.patients_can_read(p_org_id) then
    raise exception 'Vous n''avez pas accès au registre des patients.' using errcode = '42501';
  end if;
  v_numero := coalesce(p_query, '') ~ '^[[:space:]0-9+().-]+$' and length(v_chiffres) >= 3;
  v_mots := array_remove(regexp_split_to_array(v_q, ' '), '');

  return query
  select p.id, p.file_number, p.legacy_file_number, p.last_name, p.first_name, p.sex,
         p.birth_date, p.birth_year, p.declared_age, p.phone, p.phone_owner,
         p.neighborhood, p.mother_first_name, p.household_id, p.photo_path, p.created_at,
         count(*) over ()
    from public.patients p
   where p.org_id = p_org_id
     and p.deleted_at is null
     and (
       v_q = ''
       or (v_numero and (p.phone_digits like '%' || v_chiffres || '%'
                         or regexp_replace(p.file_number, '\D', '', 'g') like '%' || v_chiffres || '%'
                         or p.search_text like '%' || v_q || '%'))
       or (not v_numero and not exists (
             select 1 from unnest(v_mots) as m(mot)
              where not (p.search_text like '%' || m.mot || '%'
                         -- Faute de frappe tolérée sur les mots, jamais sur un numéro.
                         or (length(m.mot) >= 4 and m.mot !~ '[0-9]'
                             and m.mot operator(extensions.<%) p.search_text)))))
   order by
     (lower(p.file_number) = v_q or lower(coalesce(p.legacy_file_number, '')) = v_q) desc,
     case when v_q = '' then 0 else extensions.similarity(p.name_text, v_q) end desc,
     p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Patients proches d'une saisie en cours (« C'est peut-être ce patient ») :
--   meme_telephone : même téléphone et nom proche (un numéro partagé par une famille
--                    ne suffit pas : il faut aussi un nom proche) ;
--   meme_mere      : même nom, même prénom proche et même prénom de la mère ;
--   meme_nom_age   : même nom et prénom, année de naissance à un an près.
-- SECURITY DEFINER, mêmes garanties que search_patients.
create function public.find_duplicate_candidates(
  p_org_id uuid, p_last_name text, p_first_name text, p_phone text default null,
  p_mother_first_name text default null, p_birth_year integer default null,
  p_exclude_id uuid default null)
returns table (
  id uuid, file_number text, last_name text, first_name text, sex text, birth_date date,
  birth_year smallint, phone text, neighborhood text, mother_first_name text,
  reason text, score real)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nom    text := public.patient_normalize(p_last_name);
  v_prenom text := public.patient_normalize(p_first_name);
  v_complet text := public.patient_normalize(coalesce(p_last_name, '') || ' ' || coalesce(p_first_name, ''));
  v_mere   text := public.patient_normalize(p_mother_first_name);
  v_tel    text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
begin
  if not public.patients_can_read(p_org_id) then
    raise exception 'Vous n''avez pas accès au registre des patients.' using errcode = '42501';
  end if;
  if v_nom = '' or v_prenom = '' then
    return;
  end if;

  return query
  select c.id, c.file_number, c.last_name, c.first_name, c.sex, c.birth_date, c.birth_year,
         c.phone, c.neighborhood, c.mother_first_name, c.reason, c.score
    from (
      select p.*,
             extensions.similarity(p.name_text, v_complet) as score,
             case
               when length(v_tel) = 9
                    and (right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_tel
                         or right(regexp_replace(coalesce(p.phone_secondary, ''), '\D', '', 'g'), 9) = v_tel)
                    and extensions.similarity(p.name_text, v_complet) >= 0.5
                 then 'meme_telephone'
               when v_mere <> ''
                    and extensions.similarity(public.patient_normalize(p.last_name), v_nom) >= 0.6
                    and extensions.similarity(public.patient_normalize(p.first_name), v_prenom) >= 0.5
                    and extensions.similarity(public.patient_normalize(p.mother_first_name), v_mere) >= 0.6
                 then 'meme_mere'
               when p_birth_year is not null and p.birth_year is not null
                    and abs(p.birth_year - p_birth_year) <= 1
                    and extensions.similarity(p.name_text, v_complet) >= 0.7
                 then 'meme_nom_age'
             end as reason
        from public.patients p
       where p.org_id = p_org_id
         and p.deleted_at is null
         and p.id is distinct from p_exclude_id
         and (p.name_text operator(extensions.%) v_complet
              or (length(v_tel) = 9 and p.phone_digits like '%' || v_tel || '%'))
    ) c
   where c.reason is not null
   order by c.score desc
   limit 5;
end;
$$;

-- Fusion d'un doublon dans le dossier conservé : owner et admin. Couvertures, fiche
-- médicale et ménage passent au dossier conservé ; ses champs vides sont complétés par
-- ceux du doublon. Le doublon est marqué fusionné (merged_into_id, deleted_at), jamais
-- supprimé. Chaque module futur qui référence patients doit être ajouté ici.
create table public.patient_merges (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  kept_patient_id    uuid not null,
  merged_patient_id  uuid not null,
  reason             text check (char_length(reason) <= 300),
  -- Identité du doublon au moment de la fusion.
  merged_snapshot    jsonb not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  foreign key (kept_patient_id, org_id) references public.patients (id, org_id),
  foreign key (merged_patient_id, org_id) references public.patients (id, org_id)
);

create index patient_merges_org_idx on public.patient_merges (org_id, created_at desc);

comment on table public.patient_merges is
  'Fusions de doublons : dossier conservé, dossier fusionné, identité du doublon, auteur.';

create trigger patient_merges_immutable
  before update or delete on public.patient_merges
  for each row execute function public.audit_logs_immutable();
create trigger patient_merges_audit
  after insert on public.patient_merges
  for each row execute function public.audit_trigger();

create function public.merge_patients(p_keep_id uuid, p_duplicate_id uuid, p_reason text default null)
returns public.patients
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_garde   public.patients;
  v_doublon public.patients;
  v_med_g   public.patient_medical;
  v_med_d   public.patient_medical;
begin
  if p_keep_id = p_duplicate_id then
    raise exception 'Choisissez deux dossiers différents.' using errcode = '22023';
  end if;

  -- Verrouillage dans un ordre stable : deux fusions croisées ne se bloquent pas.
  perform 1 from public.patients where id in (p_keep_id, p_duplicate_id) order by id for update;
  select * into v_garde from public.patients where id = p_keep_id and deleted_at is null;
  select * into v_doublon from public.patients where id = p_duplicate_id and deleted_at is null;
  if v_garde.id is null or v_doublon.id is null or v_garde.org_id <> v_doublon.org_id then
    raise exception 'Ces dossiers sont introuvables ou déjà fusionnés.' using errcode = '22023';
  end if;
  if not public.has_role(v_garde.org_id, array['owner', 'admin'])
     or not public.patients_can_write(v_garde.org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs fusionnent des dossiers.'
      using errcode = '42501';
  end if;

  insert into public.patient_merges (org_id, kept_patient_id, merged_patient_id, reason,
                                     merged_snapshot)
  values (v_garde.org_id, v_garde.id, v_doublon.id, nullif(btrim(coalesce(p_reason, '')), ''),
          to_jsonb(v_doublon) - 'search_text' - 'name_text' - 'phone_digits');

  -- Identité : les champs vides du dossier conservé sont complétés.
  update public.patients g set
    legacy_file_number = coalesce(g.legacy_file_number, v_doublon.legacy_file_number),
    birth_date = coalesce(g.birth_date, v_doublon.birth_date),
    declared_age = case when g.birth_date is null and v_doublon.birth_date is not null
                        then null else g.declared_age end,
    phone = coalesce(g.phone, v_doublon.phone),
    phone_owner = case when g.phone is null then v_doublon.phone_owner else g.phone_owner end,
    phone_secondary = coalesce(g.phone_secondary, v_doublon.phone_secondary,
                               case when g.phone is not null and v_doublon.phone <> g.phone
                                    then v_doublon.phone end),
    neighborhood = coalesce(g.neighborhood, v_doublon.neighborhood),
    commune = coalesce(g.commune, v_doublon.commune),
    occupation = coalesce(g.occupation, v_doublon.occupation),
    marital_status = coalesce(g.marital_status, v_doublon.marital_status),
    mother_first_name = coalesce(g.mother_first_name, v_doublon.mother_first_name),
    mother_last_name = coalesce(g.mother_last_name, v_doublon.mother_last_name),
    emergency_contact_name = coalesce(g.emergency_contact_name, v_doublon.emergency_contact_name),
    emergency_contact_phone = coalesce(g.emergency_contact_phone, v_doublon.emergency_contact_phone),
    emergency_contact_relation = coalesce(g.emergency_contact_relation,
                                          v_doublon.emergency_contact_relation),
    whatsapp_consent = coalesce(g.whatsapp_consent, v_doublon.whatsapp_consent),
    household_id = coalesce(g.household_id, v_doublon.household_id)
  where g.id = v_garde.id;

  -- Couvertures.
  update public.patient_coverages set patient_id = v_garde.id
   where patient_id = v_doublon.id and deleted_at is null;

  -- Fiche médicale : rattachée, ou réunie (textes mis bout à bout, rien n'est perdu).
  select * into v_med_g from public.patient_medical
   where patient_id = v_garde.id and deleted_at is null;
  select * into v_med_d from public.patient_medical
   where patient_id = v_doublon.id and deleted_at is null;
  if v_med_d.id is not null and v_med_g.id is null then
    update public.patient_medical set patient_id = v_garde.id where id = v_med_d.id;
  elsif v_med_d.id is not null then
    update public.patient_medical m set
      blood_group = coalesce(m.blood_group, v_med_d.blood_group),
      allergies = nullif(concat_ws(E'\n', m.allergies,
                    case when v_med_d.allergies is distinct from m.allergies
                         then v_med_d.allergies end), ''),
      medical_history = nullif(concat_ws(E'\n', m.medical_history,
                          case when v_med_d.medical_history is distinct from m.medical_history
                               then v_med_d.medical_history end), ''),
      is_sensitive = m.is_sensitive or v_med_d.is_sensitive
     where m.id = v_med_g.id;
    update public.patient_medical set deleted_at = now() where id = v_med_d.id;
  end if;

  update public.patients
     set merged_into_id = v_garde.id, deleted_at = now()
   where id = v_doublon.id;

  select * into v_garde from public.patients where id = p_keep_id;
  return v_garde;
end;
$$;

-- Messages en français pour les refus d'insertion (import).
create function public.patient_error_message(p_constraint text, p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_constraint
    when 'patients_last_name_check' then 'Nom manquant ou trop long.'
    when 'patients_first_name_check' then 'Prénom manquant ou trop long.'
    when 'patients_sex_check' then 'Sexe à indiquer : F ou M.'
    when 'patients_birth_check' then 'Indiquez la date de naissance ou l''âge déclaré.'
    when 'patients_declared_age_check' then 'Âge déclaré invalide (0 à 130 ans).'
    when 'patients_birth_date_check' then 'Date de naissance invalide.'
    when 'patients_phone_check' then 'Téléphone invalide (format +221771234567).'
    when 'patients_phone_secondary_check' then 'Téléphone secondaire invalide.'
    when 'patients_emergency_phone_check' then 'Téléphone de la personne à prévenir invalide.'
    when 'patients_phone_owner_check' then 'Titulaire du téléphone invalide.'
    when 'patients_marital_status_check' then 'Situation matrimoniale invalide.'
    when 'patients_language_check' then 'Langue préférée invalide.'
    else coalesce(p_message, 'Ligne refusée.')
  end;
$$;

-- Date d'un fichier importé : AAAA-MM-JJ ou JJ/MM/AAAA, jamais au format américain.
create function public.patient_parse_date(p_text text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_text, ''));
begin
  if v = '' then
    return null;
  elsif v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return v::date;
  elsif v ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then
    return make_date(split_part(v, '/', 3)::integer, split_part(v, '/', 2)::integer,
                     split_part(v, '/', 1)::integer);
  end if;
  raise exception 'Date illisible : %', v using errcode = '22007';
end;
$$;

-- Import d'un ancien registre : owner et admin, 500 lignes au plus par appel. Chaque
-- ligne est enregistrée seule : une erreur n'empêche pas les autres.
-- p_rows : [{ "line": 2, "last_name": "…", "first_name": "…", "sex": "F", … }]
-- Renvoie une ligne par entrée : patient créé (id, numéro) ou message d'erreur.
create function public.import_patients(p_org_id uuid, p_rows jsonb)
returns table (line integer, patient_id uuid, file_number text, error text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ligne   jsonb;
  v_id      uuid;
  v_numero  text;
  v_contrainte text;
  v_message text;
begin
  if not public.has_role(p_org_id, array['owner', 'admin'])
     or not public.patients_can_write(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Envoyez au plus 500 lignes à la fois.' using errcode = '22023';
  end if;

  for v_ligne in select * from jsonb_array_elements(p_rows) loop
    line := (v_ligne ->> 'line')::integer;
    begin
      insert into public.patients (
        org_id, legacy_file_number, last_name, first_name, sex, birth_date, declared_age,
        phone, phone_owner, phone_secondary, neighborhood, commune, occupation,
        marital_status, mother_first_name, mother_last_name, emergency_contact_name,
        emergency_contact_phone, emergency_contact_relation, preferred_language)
      values (
        p_org_id,
        nullif(btrim(v_ligne ->> 'legacy_file_number'), ''),
        coalesce(v_ligne ->> 'last_name', ''),
        coalesce(v_ligne ->> 'first_name', ''),
        upper(btrim(coalesce(v_ligne ->> 'sex', ''))),
        public.patient_parse_date(v_ligne ->> 'birth_date'),
        nullif(btrim(v_ligne ->> 'declared_age'), '')::smallint,
        nullif(btrim(v_ligne ->> 'phone'), ''),
        nullif(btrim(v_ligne ->> 'phone_owner'), ''),
        nullif(btrim(v_ligne ->> 'phone_secondary'), ''),
        nullif(btrim(v_ligne ->> 'neighborhood'), ''),
        nullif(btrim(v_ligne ->> 'commune'), ''),
        nullif(btrim(v_ligne ->> 'occupation'), ''),
        nullif(btrim(v_ligne ->> 'marital_status'), ''),
        nullif(btrim(v_ligne ->> 'mother_first_name'), ''),
        nullif(btrim(v_ligne ->> 'mother_last_name'), ''),
        nullif(btrim(v_ligne ->> 'emergency_contact_name'), ''),
        nullif(btrim(v_ligne ->> 'emergency_contact_phone'), ''),
        nullif(btrim(v_ligne ->> 'emergency_contact_relation'), ''),
        coalesce(nullif(btrim(v_ligne ->> 'preferred_language'), ''), 'fr'))
      returning patients.id, patients.file_number into v_id, v_numero;
      patient_id := v_id;
      file_number := v_numero;
      error := null;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        patient_id := null; file_number := null;
        error := 'Date de naissance illisible (format AAAA-MM-JJ ou JJ/MM/AAAA).';
      when invalid_text_representation or numeric_value_out_of_range then
        patient_id := null; file_number := null;
        error := 'Âge déclaré illisible : indiquez un nombre d''années.';
      when check_violation or not_null_violation or invalid_parameter_value then
        get stacked diagnostics v_contrainte = constraint_name, v_message = message_text;
        patient_id := null; file_number := null;
        error := public.patient_error_message(v_contrainte, v_message);
    end;
    return next;
  end loop;
end;
$$;


-- =============================================================================
-- 7. Storage : bucket privé « patients »
-- -----------------------------------------------------------------------------
-- {org_id}/{patient_id}/{fichier} : photo d'identité. Lecture par URL signée.
-- Ni remplacement ni suppression : une nouvelle photo a un nouveau nom.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patients', 'patients', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy patients_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'patients' and public.patients_can_read(public.storage_org_id(name)));

create policy patients_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patients'
    and public.patients_can_write(public.storage_org_id(name))
    and exists (select 1 from public.patients p
                 where p.id = public.storage_second_uuid(name)
                   and p.org_id = public.storage_org_id(name))
  );


-- =============================================================================
-- 8. Droits d'accès
-- =============================================================================

revoke all on
  public.households, public.patients, public.patient_counters, public.patient_medical,
  public.patient_access_logs, public.patient_coverages, public.patient_merges
from anon, authenticated;

grant select on public.households to authenticated;
grant insert (id, org_id, name, phone, neighborhood) on public.households to authenticated;
grant update (name, phone, neighborhood) on public.households to authenticated;

-- Ni le numéro, ni la structure, ni la fusion, ni la suppression depuis l'application.
grant select on public.patients to authenticated;
grant insert (
  id, org_id, legacy_file_number, last_name, first_name, sex, birth_date, declared_age,
  phone, phone_owner, phone_secondary, neighborhood, commune, occupation, marital_status,
  mother_first_name, mother_last_name, emergency_contact_name, emergency_contact_phone,
  emergency_contact_relation, preferred_language, whatsapp_consent, photo_path, household_id
) on public.patients to authenticated;
grant update (
  legacy_file_number, last_name, first_name, sex, birth_date, declared_age, phone,
  phone_owner, phone_secondary, neighborhood, commune, occupation, marital_status,
  mother_first_name, mother_last_name, emergency_contact_name, emergency_contact_phone,
  emergency_contact_relation, preferred_language, whatsapp_consent, photo_path, household_id
) on public.patients to authenticated;

-- patient_medical : aucun accès direct (RPC get_ / save_patient_medical).
grant select on public.patient_access_logs to authenticated;

grant select on public.patient_coverages to authenticated;
grant insert (id, org_id, patient_id, scheme, payer_id, member_number, coverage_rate,
              valid_from, valid_to) on public.patient_coverages to authenticated;
grant update (scheme, payer_id, member_number, coverage_rate, valid_from, valid_to, deleted_at)
  on public.patient_coverages to authenticated;

grant select on public.patient_merges to authenticated;

revoke execute on function
  public.patient_normalize(text),
  public.is_clinician_manager(uuid),
  public.patients_can_read(uuid),
  public.patients_org_writable(uuid),
  public.patients_can_write(uuid),
  public.patients_can_read_medical(uuid),
  public.patients_can_read_sensitive(uuid),
  public.patient_permissions(uuid),
  public.set_member_clinician(uuid, boolean),
  public.next_patient_file_number(uuid),
  public.patients_prepare(),
  public.patient_medical_audit(),
  public.get_patient_medical(uuid),
  public.save_patient_medical(uuid, text, text, text, boolean),
  public.patient_coverages_prepare(),
  public.search_patients(uuid, text, integer, integer),
  public.find_duplicate_candidates(uuid, text, text, text, text, integer, uuid),
  public.merge_patients(uuid, uuid, text),
  public.patient_error_message(text, text),
  public.patient_parse_date(text),
  public.import_patients(uuid, jsonb)
from public, anon, authenticated;

-- Aides appelées par les policies et les RPC SECURITY INVOKER, et RPC du module.
grant execute on function
  public.patient_normalize(text),
  public.is_clinician_manager(uuid),
  public.patients_can_read(uuid),
  public.patients_can_write(uuid),
  public.patients_can_read_medical(uuid),
  public.patients_can_read_sensitive(uuid),
  public.patient_permissions(uuid),
  public.set_member_clinician(uuid, boolean),
  public.get_patient_medical(uuid),
  public.save_patient_medical(uuid, text, text, text, boolean),
  public.search_patients(uuid, text, integer, integer),
  public.find_duplicate_candidates(uuid, text, text, text, text, integer, uuid),
  public.merge_patients(uuid, uuid, text),
  public.patient_error_message(text, text),
  public.patient_parse_date(text),
  public.import_patients(uuid, jsonb)
to authenticated;


-- =============================================================================
-- 9. Row Level Security
-- =============================================================================

alter table public.households          enable row level security;
alter table public.patients            enable row level security;
alter table public.patient_counters    enable row level security;
alter table public.patient_medical     enable row level security;
alter table public.patient_access_logs enable row level security;
alter table public.patient_coverages   enable row level security;
alter table public.patient_merges      enable row level security;

-- patient_counters, patient_medical : aucune policy, aucun droit (serveur uniquement).

create policy households_select on public.households
  for select to authenticated
  using (public.patients_can_read(org_id));
create policy households_insert on public.households
  for insert to authenticated
  with check (public.patients_can_write(org_id));
create policy households_update on public.households
  for update to authenticated
  using (public.patients_can_write(org_id))
  with check (public.patients_can_write(org_id));

-- Les dossiers fusionnés restent lisibles : le front suit merged_into_id.
create policy patients_select on public.patients
  for select to authenticated
  using (public.patients_can_read(org_id));
create policy patients_insert on public.patients
  for insert to authenticated
  with check (public.patients_can_write(org_id));
create policy patients_update on public.patients
  for update to authenticated
  using (public.patients_can_write(org_id) and deleted_at is null)
  with check (public.patients_can_write(org_id));

create policy patient_coverages_select on public.patient_coverages
  for select to authenticated
  using (public.patients_can_read(org_id));
create policy patient_coverages_insert on public.patient_coverages
  for insert to authenticated
  with check (public.patients_can_write(org_id));
create policy patient_coverages_update on public.patient_coverages
  for update to authenticated
  using (public.patients_can_write(org_id))
  with check (public.patients_can_write(org_id));

-- Journal des lectures sensibles et fusions : owner et admin.
create policy patient_access_logs_select on public.patient_access_logs
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));
create policy patient_merges_select on public.patient_merges
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));
