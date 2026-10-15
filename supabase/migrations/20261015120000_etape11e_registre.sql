-- =============================================================================
-- Étape 11e — Recopier une page de registre papier
-- -----------------------------------------------------------------------------
-- Un stagiaire ou un relais recopie une page du registre papier dans une grille. C'est
-- l'équivalent de plusieurs créations rapides : ouvert aux rôles qui créent un patient
-- (accueil et caissier compris), et non plus seulement à owner et admin. Chaque dossier
-- est créé par import_patients, rattaché au journal et audité comme une création.
--
-- 1. patient_imports : source ('fichier' ou 'registre'), repère facultatif « Registre
--    de l'année ___, page ___ » ; file_name facultatif pour un registre.
-- 2. Lecture du journal : owner et admin voient tout ; chacun voit ses propres pages
--    de registre recopiées.
-- 3. start_patient_import : recréée avec p_source, p_register_year, p_register_page.
-- 4. import_patients : même signature ; les droits et la taille d'un envoi suivent la
--    source du journal (fichier : owner et admin, 500 lignes ; registre : rôles qui
--    créent un patient, 60 lignes, une page).
-- 5. find_import_duplicates : recréée avec p_source (mêmes droits et limites).
-- Ne modifie pas les migrations précédentes.
-- =============================================================================


-- =============================================================================
-- 1. Journal : source et repère du registre
-- =============================================================================

alter table public.patient_imports
  add column source text not null default 'fichier',
  add column register_year smallint,
  add column register_page integer,
  alter column file_name drop not null,
  add constraint patient_imports_source_check check (source in ('fichier', 'registre')),
  add constraint patient_imports_file_name_source_check
    check (source = 'registre' or file_name is not null),
  add constraint patient_imports_register_check
    check ((source = 'registre'
            or (register_year is null and register_page is null))
           and (register_year is null or register_year between 1900 and 2100)
           and (register_page is null or register_page between 1 and 10000));

comment on column public.patient_imports.source is
  'fichier : liste Excel ou CSV (owner et admin) ; registre : page de registre papier recopiée.';
comment on column public.patient_imports.register_year is
  'Repère facultatif : année du registre papier recopié.';
comment on column public.patient_imports.register_page is
  'Repère facultatif : page du registre papier recopiée.';


-- =============================================================================
-- 2. Lecture du journal
-- =============================================================================

drop policy patient_imports_select on public.patient_imports;

create policy patient_imports_select on public.patient_imports
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin'])
         or (source = 'registre' and created_by = auth.uid()
             and public.patients_can_write(org_id)));


-- =============================================================================
-- 3. Ouverture d'un import ou d'une page de registre
-- =============================================================================

-- Droit d'importer selon la source.
create function public.patients_can_import_source(p_org_id uuid, p_source text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_source
    when 'fichier' then public.patients_can_import(p_org_id)
    when 'registre' then public.patients_can_write(p_org_id)
    else false
  end;
$$;

-- Lignes envoyées en une fois au plus : un fichier par lots de 500, une page de 60 lignes.
create function public.patient_import_batch_max(p_source text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_source when 'registre' then 60 else 500 end;
$$;

create function public.patient_import_check(p_org_id uuid, p_source text, p_rows integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_source is null or p_source not in ('fichier', 'registre') then
    raise exception 'Source d''import inconnue.' using errcode = '22023';
  end if;
  if not public.patients_can_import_source(p_org_id, p_source) then
    if p_source = 'registre' then
      raise exception 'Votre rôle ne permet pas de créer un patient.' using errcode = '42501';
    end if;
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  if p_rows > public.patient_import_batch_max(p_source) then
    if p_source = 'registre' then
      raise exception 'Une page compte au plus 60 lignes.' using errcode = '22023';
    end if;
    raise exception 'Envoyez au plus 500 lignes à la fois.' using errcode = '22023';
  end if;
end;
$$;

drop function public.start_patient_import(uuid, text, integer, integer, integer);

-- p_rejected_rows : lignes refusées dès la vérification (jamais envoyées) ;
-- p_skipped_rows : doublons probables laissés de côté. Renvoie l'id du journal.
-- p_register_year / p_register_page : repère facultatif d'une page de registre.
create function public.start_patient_import(
  p_org_id uuid, p_file_name text, p_total_rows integer,
  p_rejected_rows integer default 0, p_skipped_rows integer default 0,
  p_source text default 'fichier', p_register_year integer default null,
  p_register_page integer default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.patient_import_check(p_org_id, p_source, 0);
  if p_source = 'fichier' and (p_register_year is not null or p_register_page is not null) then
    raise exception 'Le repère de registre concerne seulement une page recopiée.'
      using errcode = '22023';
  end if;
  if p_register_year is not null and p_register_year not between 1900 and 2100 then
    raise exception 'Année du registre invalide.' using errcode = '22023';
  end if;
  if p_register_page is not null and p_register_page not between 1 and 10000 then
    raise exception 'Numéro de page invalide.' using errcode = '22023';
  end if;
  if p_source = 'registre' and coalesce(p_total_rows, 0) > 60 then
    raise exception 'Une page compte au plus 60 lignes.' using errcode = '22023';
  end if;

  insert into public.patient_imports (org_id, source, file_name, register_year, register_page,
                                      total_rows, rejected_count, skipped_count)
  values (p_org_id,
          p_source,
          case when p_source = 'fichier'
               then left(coalesce(nullif(btrim(p_file_name), ''), 'Fichier sans nom'), 255)
               else left(nullif(btrim(p_file_name), ''), 255) end,
          p_register_year,
          p_register_page,
          greatest(coalesce(p_total_rows, 0), 0),
          greatest(coalesce(p_rejected_rows, 0), 0),
          greatest(coalesce(p_skipped_rows, 0), 0))
  returning id into v_id;
  return v_id;
end;
$$;


-- =============================================================================
-- 4. Import ligne par ligne : droits selon la source du journal
-- =============================================================================

create or replace function public.import_patients(p_org_id uuid, p_rows jsonb,
                                                  p_import_id uuid default null)
returns table (line integer, patient_id uuid, file_number text, error text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne      jsonb;
  v_import     uuid := p_import_id;
  v_source     text := 'fichier';
  v_id         uuid;
  v_numero     text;
  v_telephone  text;
  v_contrainte text;
  v_message    text;
  v_importees  integer := 0;
  v_refusees   integer := 0;
begin
  -- Membre qui crée des patients d'abord : un journal d'une autre structure ne se devine pas.
  if not public.patients_can_write(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs importent un registre.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Envoyez une liste de lignes.' using errcode = '22023';
  end if;

  if v_import is not null then
    select i.source into v_source
      from public.patient_imports i
     where i.id = v_import and i.org_id = p_org_id
       and i.created_by = auth.uid() and i.deleted_at is null;
    if not found then
      raise exception 'Import introuvable : relancez l''import du fichier.' using errcode = '22023';
    end if;
  end if;
  perform public.patient_import_check(p_org_id, v_source, jsonb_array_length(p_rows));

  if v_import is null then
    v_import := public.start_patient_import(p_org_id, null, jsonb_array_length(p_rows));
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
        -- Consentement : seulement s'il est écrit, et avec un téléphone. Une page de
        -- registre ne le recopie jamais : il se demande au patient en personne.
        case when v_telephone is not null and v_source = 'fichier'
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
-- 5. Doublons probables d'un lot
-- =============================================================================

drop function public.find_import_duplicates(uuid, jsonb);

-- p_rows : [{ "line", "last_name", "first_name", "phone", "mother_first_name",
--             "birth_year", "legacy_file_number" }] — 500 au plus (60 pour un registre).
-- Renvoie, pour chaque ligne, les dossiers proches (5 au plus, le même ancien numéro
-- en premier). Lecture seule.
create function public.find_import_duplicates(p_org_id uuid, p_rows jsonb,
                                              p_source text default 'fichier')
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
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Envoyez une liste de lignes.' using errcode = '22023';
  end if;
  perform public.patient_import_check(p_org_id, p_source, jsonb_array_length(p_rows));

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
-- 6. Droits d'exécution
-- =============================================================================

revoke execute on function
  public.patients_can_import_source(uuid, text),
  public.patient_import_batch_max(text),
  public.patient_import_check(uuid, text, integer),
  public.start_patient_import(uuid, text, integer, integer, integer, text, integer, integer),
  public.import_patients(uuid, jsonb, uuid),
  public.find_import_duplicates(uuid, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public.start_patient_import(uuid, text, integer, integer, integer, text, integer, integer),
  public.import_patients(uuid, jsonb, uuid),
  public.find_import_duplicates(uuid, jsonb, text)
to authenticated;
