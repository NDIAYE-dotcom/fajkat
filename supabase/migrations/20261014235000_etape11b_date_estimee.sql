-- =============================================================================
-- Étape 11b — Date de naissance estimée (enfants de moins de 5 ans)
-- -----------------------------------------------------------------------------
-- Pour un enfant de moins de 5 ans, l'âge déclaré (« 3 ans » ou « 8 mois ») donne une date
-- de naissance estimée (date du jour moins cet âge), enregistrée avec l'indicateur
-- birth_date_estimated. Le module Enfant (calendrier vaccinal) a besoin d'une date, pas
-- d'un âge arrondi. Affichage : « né(e) vers octobre 2023 ». À partir de 5 ans, l'âge
-- déclaré en années reste enregistré comme à l'étape 11 (declared_age).
--
-- 1. patients.birth_date_estimated (+ contrainte : jamais sans date de naissance).
-- 2. search_patients et find_duplicate_candidates renvoient l'indicateur (recréées :
--    leur type de retour change ; corps identiques à l'étape 11 sinon).
-- 3. merge_patients : une date exacte l'emporte sur une date estimée.
-- Ne modifie pas la migration de l'étape 11.
-- =============================================================================


-- =============================================================================
-- 1. Colonne
-- =============================================================================

alter table public.patients
  add column birth_date_estimated boolean not null default false;

alter table public.patients
  add constraint patients_birth_estimated_check
  check (not birth_date_estimated or birth_date is not null);

comment on column public.patients.birth_date_estimated is
  'Date de naissance estimée à partir d''un âge déclaré (enfant de moins de 5 ans).';

grant insert (birth_date_estimated) on public.patients to authenticated;
grant update (birth_date_estimated) on public.patients to authenticated;


-- =============================================================================
-- 2. Recherche et doublons : indicateur renvoyé
-- =============================================================================

drop function public.search_patients(uuid, text, integer, integer);

create function public.search_patients(
  p_org_id uuid, p_query text default '', p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, file_number text, legacy_file_number text, last_name text, first_name text,
  sex text, birth_date date, birth_date_estimated boolean, birth_year smallint,
  declared_age smallint, phone text, phone_owner text, neighborhood text,
  mother_first_name text, household_id uuid, photo_path text, created_at timestamptz,
  total_count bigint)
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
         p.birth_date, p.birth_date_estimated, p.birth_year, p.declared_age, p.phone,
         p.phone_owner, p.neighborhood, p.mother_first_name, p.household_id, p.photo_path,
         p.created_at, count(*) over ()
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

drop function public.find_duplicate_candidates(uuid, text, text, text, text, integer, uuid);

create function public.find_duplicate_candidates(
  p_org_id uuid, p_last_name text, p_first_name text, p_phone text default null,
  p_mother_first_name text default null, p_birth_year integer default null,
  p_exclude_id uuid default null)
returns table (
  id uuid, file_number text, last_name text, first_name text, sex text, birth_date date,
  birth_date_estimated boolean, birth_year smallint, declared_age smallint, phone text,
  neighborhood text, mother_first_name text, reason text, score real)
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
  select c.id, c.file_number, c.last_name, c.first_name, c.sex, c.birth_date,
         c.birth_date_estimated, c.birth_year, c.declared_age, c.phone, c.neighborhood,
         c.mother_first_name, c.reason, c.score
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

revoke execute on function
  public.search_patients(uuid, text, integer, integer),
  public.find_duplicate_candidates(uuid, text, text, text, text, integer, uuid)
from public, anon, authenticated;

grant execute on function
  public.search_patients(uuid, text, integer, integer),
  public.find_duplicate_candidates(uuid, text, text, text, text, integer, uuid)
to authenticated;


-- =============================================================================
-- 3. Fusion : une date exacte l'emporte sur une date estimée
-- =============================================================================

create or replace function public.merge_patients(p_keep_id uuid, p_duplicate_id uuid, p_reason text default null)
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
  v_date_doublon boolean;
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

  -- Date du doublon retenue si le dossier conservé n'en a pas, ou s'il n'a qu'une date
  -- estimée et que le doublon a une date exacte.
  v_date_doublon := v_doublon.birth_date is not null
    and (v_garde.birth_date is null
         or (v_garde.birth_date_estimated and not v_doublon.birth_date_estimated));

  -- Identité : les champs vides du dossier conservé sont complétés.
  update public.patients g set
    legacy_file_number = coalesce(g.legacy_file_number, v_doublon.legacy_file_number),
    birth_date = case when v_date_doublon then v_doublon.birth_date else g.birth_date end,
    birth_date_estimated = case when v_date_doublon then v_doublon.birth_date_estimated
                                else g.birth_date_estimated end,
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
