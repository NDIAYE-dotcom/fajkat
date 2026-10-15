-- =============================================================================
-- Étape 11d — Import d'une liste de patients (Excel ou CSV)
-- -----------------------------------------------------------------------------
-- Le fichier est lu et vérifié dans le navigateur (aperçu : lignes valides, en erreur,
-- doublons probables). Rien n'est enregistré avant la confirmation.
--
-- 1. patient_imports : journal de chaque import (auteur, date, nom du fichier, lignes
--    importées, refusées, doublons ignorés). Écrit seulement par les fonctions ci-dessous.
--    patients.import_id : import d'origine d'un dossier.
-- 2. start_patient_import : ouvre le journal d'un import (owner et admin).
-- 3. import_patients : recréée avec p_import_id ; enregistre aussi la date estimée
--    (birth_date_estimated, étape 11b) et le consentement WhatsApp (jamais « accepte »
--    par défaut : sans valeur explicite, il reste non renseigné). Les compteurs du
--    journal sont tenus par le serveur, jamais fournis par le navigateur.
-- 4. find_import_duplicates : doublons probables de tout un lot en un seul appel
--    (mêmes critères que find_duplicate_candidates, plus le même ancien numéro de
--    dossier avec un nom proche : un import relancé après une coupure est reconnu).
-- 5. patient_error_message : messages de la date estimée et de l'ancien numéro.
-- L'ancien numéro de dossier (legacy_file_number) existe depuis l'étape 11 et figure
-- dans search_text : la recherche du registre et de l'en-tête le trouve déjà.
-- Ne modifie pas les migrations précédentes.
-- =============================================================================


-- =============================================================================
-- 1. Journal des imports
-- =============================================================================

create table public.patient_imports (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  file_name       text not null check (char_length(btrim(file_name)) between 1 and 255),
  -- Lignes de données du fichier (en-tête exclu).
  total_rows      integer not null check (total_rows between 0 and 100000),
  imported_count  integer not null default 0 check (imported_count >= 0),
  -- Refusées à la lecture du fichier (navigateur) et par la base.
  rejected_count  integer not null default 0 check (rejected_count >= 0),
  -- Doublons probables laissés de côté à la confirmation.
  skipped_count   integer not null default 0 check (skipped_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at      timestamptz
);

create index patient_imports_org_created_idx
  on public.patient_imports (org_id, created_at desc);

comment on table public.patient_imports is
  'Journal des imports de patients : auteur, date, fichier, lignes importées et refusées.';

create trigger patient_imports_set_updated_at before update on public.patient_imports
  for each row execute function public.set_updated_at();
create trigger patient_imports_audit
  after insert or update or delete on public.patient_imports
  for each row execute function public.audit_trigger();

alter table public.patients
  add column import_id uuid references public.patient_imports (id);

comment on column public.patients.import_id is
  'Import d''origine du dossier (null : dossier créé à l''accueil).';

create index patients_import_idx on public.patients (import_id) where import_id is not null;

-- Ancien numéro comparé sans casse ni espaces : doublons d'un import relancé.
create index patients_legacy_number_idx
  on public.patients (org_id, lower(btrim(legacy_file_number)))
  where legacy_file_number is not null and deleted_at is null;

alter table public.patient_imports enable row level security;

revoke all on public.patient_imports from anon, authenticated;
grant select on public.patient_imports to authenticated;

create policy patient_imports_select on public.patient_imports
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']));


-- =============================================================================
-- 2. Ouverture d'un import
-- =============================================================================

create function public.patients_can_import(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(p_org_id, array['owner', 'admin'])
     and public.patients_can_write(p_org_id);
$$;

-- p_rejected_rows : lignes refusées dès la lecture du fichier (jamais envoyées) ;
-- p_skipped_rows : doublons probables laissés de côté. Renvoie l'id du journal.
create function public.start_patient_import(
  p_org_id uuid, p_file_name text, p_total_rows integer,
  p_rejected_rows integer default 0, p_skipped_rows integer default 0)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.patients_can_import(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  insert into public.patient_imports (org_id, file_name, total_rows, rejected_count,
                                      skipped_count)
  values (p_org_id,
          left(coalesce(nullif(btrim(p_file_name), ''), 'Fichier sans nom'), 255),
          greatest(coalesce(p_total_rows, 0), 0),
          greatest(coalesce(p_rejected_rows, 0), 0),
          greatest(coalesce(p_skipped_rows, 0), 0))
  returning id into v_id;
  return v_id;
end;
$$;


-- =============================================================================
-- 3. Import ligne par ligne
-- =============================================================================

-- Valeur booléenne d'un fichier : true / false, sinon null (non renseigné).
create function public.patient_parse_bool(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_text, '')))
    when 'true' then true
    when 'false' then false
  end;
$$;

drop function public.import_patients(uuid, jsonb);

-- Import d'un ancien registre : owner et admin, 500 lignes au plus par appel. Chaque
-- ligne est enregistrée seule : une erreur n'empêche pas les autres.
-- p_rows : [{ "line": 2, "last_name": "…", "first_name": "…", "sex": "F",
--             "birth_date": "2024-03-01", "birth_date_estimated": true, … }]
-- p_import_id : journal ouvert par start_patient_import (le même pour tous les lots d'un
-- fichier). Sans journal, un journal « Fichier sans nom » est ouvert : aucun import
-- n'échappe au journal.
-- SECURITY DEFINER : les compteurs du journal ne sont modifiables par personne d'autre.
-- Droits vérifiés ci-dessous ; la structure de chaque ligne est imposée (p_org_id).
create function public.import_patients(p_org_id uuid, p_rows jsonb, p_import_id uuid default null)
returns table (line integer, patient_id uuid, file_number text, error text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne      jsonb;
  v_import     uuid := p_import_id;
  v_id         uuid;
  v_numero     text;
  v_telephone  text;
  v_contrainte text;
  v_message    text;
  v_importees  integer := 0;
  v_refusees   integer := 0;
begin
  if not public.patients_can_import(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Envoyez au plus 500 lignes à la fois.' using errcode = '22023';
  end if;

  if v_import is null then
    v_import := public.start_patient_import(p_org_id, null, jsonb_array_length(p_rows));
  elsif not exists (select 1 from public.patient_imports i
                     where i.id = v_import and i.org_id = p_org_id
                       and i.created_by = auth.uid() and i.deleted_at is null) then
    raise exception 'Import introuvable : relancez l''import du fichier.' using errcode = '22023';
  end if;

  for v_ligne in select * from jsonb_array_elements(p_rows) loop
    line := (v_ligne ->> 'line')::integer;
    v_telephone := nullif(btrim(v_ligne ->> 'phone'), '');
    begin
      insert into public.patients (
        org_id, import_id, legacy_file_number, last_name, first_name, sex, birth_date,
        birth_date_estimated, declared_age, phone, phone_owner, phone_secondary,
        neighborhood, commune, occupation, marital_status, mother_first_name,
        mother_last_name, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relation, preferred_language, whatsapp_consent)
      values (
        p_org_id,
        v_import,
        nullif(btrim(v_ligne ->> 'legacy_file_number'), ''),
        coalesce(v_ligne ->> 'last_name', ''),
        coalesce(v_ligne ->> 'first_name', ''),
        upper(btrim(coalesce(v_ligne ->> 'sex', ''))),
        public.patient_parse_date(v_ligne ->> 'birth_date'),
        coalesce(public.patient_parse_bool(v_ligne ->> 'birth_date_estimated'), false),
        nullif(btrim(v_ligne ->> 'declared_age'), '')::smallint,
        v_telephone,
        case when v_telephone is not null then nullif(btrim(v_ligne ->> 'phone_owner'), '') end,
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
        coalesce(nullif(btrim(v_ligne ->> 'preferred_language'), ''), 'fr'),
        -- Consentement : seulement s'il est écrit dans le fichier, et avec un téléphone.
        case when v_telephone is not null
             then public.patient_parse_bool(v_ligne ->> 'whatsapp_consent') end)
      returning patients.id, patients.file_number into v_id, v_numero;
      patient_id := v_id;
      file_number := v_numero;
      error := null;
      v_importees := v_importees + 1;
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
    if error is not null then
      v_refusees := v_refusees + 1;
    end if;
    return next;
  end loop;

  update public.patient_imports
     set imported_count = imported_count + v_importees,
         rejected_count = rejected_count + v_refusees
   where id = v_import;
end;
$$;


-- =============================================================================
-- 4. Doublons probables d'un lot
-- =============================================================================

-- p_rows : [{ "line", "last_name", "first_name", "phone", "mother_first_name",
--             "birth_year", "legacy_file_number" }] — 500 au plus.
-- Renvoie, pour chaque ligne, les dossiers proches (5 au plus, le même ancien numéro
-- en premier). Lecture seule.
create function public.find_import_duplicates(p_org_id uuid, p_rows jsonb)
returns table (
  line integer, id uuid, file_number text, legacy_file_number text, last_name text,
  first_name text, sex text, birth_date date, birth_date_estimated boolean,
  birth_year smallint, declared_age smallint, phone text, neighborhood text,
  mother_first_name text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.patients_can_import(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Envoyez au plus 500 lignes à la fois.' using errcode = '22023';
  end if;

  return query
  with lignes as (
    select (r ->> 'line')::integer as num, r
      from jsonb_array_elements(p_rows) r
  ),
  candidats as (
    -- Même ancien numéro et nom proche : le plus sûr (import relancé).
    select l.num, p.id as pid, 'meme_ancien_numero'::text as raison, 0 as rang,
           1::real as score
      from lignes l
      join public.patients p
        on p.org_id = p_org_id
       and p.deleted_at is null
       and p.legacy_file_number is not null
       and lower(btrim(p.legacy_file_number)) = lower(btrim(l.r ->> 'legacy_file_number'))
     where nullif(btrim(l.r ->> 'legacy_file_number'), '') is not null
       and extensions.similarity(p.name_text, public.patient_normalize(
             coalesce(l.r ->> 'last_name', '') || ' ' || coalesce(l.r ->> 'first_name', '')))
           >= 0.4
    union all
    select l.num, d.id, d.reason, 1, d.score
      from lignes l
     cross join lateral public.find_duplicate_candidates(
             p_org_id, l.r ->> 'last_name', l.r ->> 'first_name',
             nullif(l.r ->> 'phone', ''), nullif(l.r ->> 'mother_first_name', ''),
             nullif(l.r ->> 'birth_year', '')::integer) d
  ),
  uniques as (
    select distinct on (c.num, c.pid) c.num, c.pid, c.raison, c.rang, c.score
      from candidats c
     order by c.num, c.pid, c.rang
  ),
  classes as (
    select u.*, row_number() over (partition by u.num order by u.rang, u.score desc) as n
      from uniques u
  )
  select c.num, p.id, p.file_number, p.legacy_file_number, p.last_name, p.first_name, p.sex,
         p.birth_date, p.birth_date_estimated, p.birth_year, p.declared_age, p.phone,
         p.neighborhood, p.mother_first_name, c.raison
    from classes c
    join public.patients p on p.id = c.pid
   where c.n <= 5
   order by c.num, c.n;
end;
$$;


-- =============================================================================
-- 5. Messages d'erreur de l'import
-- =============================================================================

create or replace function public.patient_error_message(p_constraint text, p_message text)
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
    when 'patients_birth_estimated_check' then 'Date de naissance estimée invalide.'
    when 'patients_legacy_file_number_check' then 'Ancien n° de dossier trop long (40 caractères au plus).'
    when 'patients_phone_check' then 'Téléphone invalide (format +221771234567).'
    when 'patients_phone_secondary_check' then 'Téléphone secondaire invalide.'
    when 'patients_emergency_phone_check' then 'Téléphone de la personne à prévenir invalide.'
    when 'patients_phone_owner_check' then 'Titulaire du téléphone invalide.'
    when 'patients_marital_status_check' then 'Situation matrimoniale invalide.'
    when 'patients_language_check' then 'Langue préférée invalide.'
    when 'patients_neighborhood_check' then 'Quartier trop long (120 caractères au plus).'
    when 'patients_commune_check' then 'Commune trop longue (120 caractères au plus).'
    when 'patients_mother_first_name_check' then 'Prénom de la mère trop long (80 caractères au plus).'
    else coalesce(p_message, 'Ligne refusée.')
  end;
$$;


-- =============================================================================
-- 6. Droits d'exécution
-- =============================================================================

revoke execute on function
  public.patients_can_import(uuid),
  public.start_patient_import(uuid, text, integer, integer, integer),
  public.patient_parse_bool(text),
  public.import_patients(uuid, jsonb, uuid),
  public.find_import_duplicates(uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.patients_can_import(uuid),
  public.start_patient_import(uuid, text, integer, integer, integer),
  public.import_patients(uuid, jsonb, uuid),
  public.find_import_duplicates(uuid, jsonb)
to authenticated;
