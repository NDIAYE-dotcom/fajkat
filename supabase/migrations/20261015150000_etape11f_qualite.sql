-- =============================================================================
-- Étape 11f — Qualité du registre
-- -----------------------------------------------------------------------------
-- Au Sénégal, un même prénom s'écrit de plusieurs façons (Mamadou / Momodou / Mamadu,
-- Ndèye / Ndeye, Khady / Kady / Xadi…). La recherche et la détection des doublons
-- rapprochent désormais les noms qui se prononcent pareil. Un doublon reste une
-- proposition : rien n'est jamais fusionné automatiquement.
--
-- 1. patient_phonetic : clé de prononciation d'un nom, règles adaptées aux noms
--    sénégalais (pas fuzzystrmatch : soundex et metaphone suivent l'anglais).
-- 2. patients.name_phonetic et search_phonetic, tenus par le trigger patients_prepare
--    (recréé à l'identique, plus ces deux champs) ; dossiers existants remis à jour.
-- 3. find_duplicate_candidates (création rapide, et par elle find_import_duplicates :
--    import et registre papier) : un nom qui se prononce pareil vaut un nom proche.
--    Même téléphone : le prénom doit aussi être proche (Fatou et Fanta, sœurs qui
--    partagent le téléphone de la famille, ne sont pas un doublon).
-- 4. search_patients : chaque mot cherché compare aussi sa prononciation.
-- 5. suggest_neighborhoods : quartiers déjà saisis dans la structure, les plus
--    fréquents en premier, fautes de frappe tolérées (« Granf » -> « Grand Yoff »).
-- La fusion (merge_patients, étapes 11 et 11b) ne change pas.
-- Ne modifie pas les migrations précédentes.
-- =============================================================================


-- =============================================================================
-- 1. Clé de prononciation
-- =============================================================================

-- Un nom (un ou plusieurs mots) -> une clé sans espace :
--   apostrophes, tirets et espaces ignorés : N'diaye = Ndiaye, M'Baye = Mbaye,
--     Mame-Diarra = Mame Diarra (les accents sont déjà retirés : Ndèye = Ndeye) ;
--   sh -> ch (Sheikh / Cheikh), kh -> k (Khady / Kady), th -> t (Thiam / Tiam),
--     ph -> f, dj -> j (Djibril / Jibril), qu -> k, c devant e / i -> s (Cissé / Sissé),
--     x wolof -> k (Xadi / Khady), y -> i (Ndeye / Ndeie) ;
--   ou -> u (Fatou / Fatu, Moussa / Musa), puis o -> a (Mamadou / Momodou) ;
--   h final muet (Bah / Ba) ; lettres doublées simplifiées (Aïssatou / Aissatou / Aïssatu).
-- Ndiaye (ndiaie) et Ndoye (ndaie), Fatou (fatu) et Fanta (fanta) restent distincts.
create function public.patient_phonetic(p_text text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  s text := regexp_replace(public.patient_normalize(p_text), '[^a-z]', '', 'g');
begin
  s := replace(s, 'sh', 'ch');
  -- « ch » mis de côté (ʃ) : son c ne doit pas devenir k.
  s := replace(s, 'ch', 'ʃ');
  s := replace(s, 'kh', 'k');
  s := replace(s, 'th', 't');
  s := replace(s, 'ph', 'f');
  s := replace(s, 'dj', 'j');
  s := replace(s, 'qu', 'k');
  s := regexp_replace(s, 'c([eiy])', 's\1', 'g');
  s := translate(s, 'cqxy', 'kkki');
  s := replace(s, 'ou', 'u');
  s := translate(s, 'o', 'a');
  s := regexp_replace(s, 'h$', '');
  s := regexp_replace(s, '(.)\1+', '\1', 'g');
  return s;
end;
$$;

-- Clé de chaque mot, séparées par une espace (recherche mot par mot).
create function public.patient_phonetic_words(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(k, ' '), '')
    from (select public.patient_phonetic(m) as k
            from regexp_split_to_table(public.patient_normalize(p_text), '[^a-z0-9]+') as m) c
   where k <> '';
$$;

-- Texte de recherche phonétique d'un dossier : chaque mot (nom, prénom, mère, quartier),
-- puis le nom, le prénom et le prénom de la mère en un bloc (Mame-Diarra = Mamediarra).
create function public.patient_search_phonetic(
  p_last_name text, p_first_name text, p_mother_first_name text, p_mother_last_name text,
  p_neighborhood text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select concat_ws(' ',
    public.patient_phonetic_words(concat_ws(' ', p_last_name, p_first_name,
      p_mother_first_name, p_mother_last_name, p_neighborhood)),
    public.patient_phonetic(p_last_name),
    public.patient_phonetic(p_first_name),
    nullif(public.patient_phonetic(p_mother_first_name), ''));
$$;


-- =============================================================================
-- 2. Colonnes, trigger, dossiers existants
-- =============================================================================

alter table public.patients
  add column name_phonetic text not null default '',
  add column search_phonetic text not null default '';

comment on column public.patients.name_phonetic is
  'Clés de prononciation du nom et du prénom (patient_phonetic), tenues par patients_prepare.';
comment on column public.patients.search_phonetic is
  'Texte de recherche phonétique (patient_search_phonetic), tenu par patients_prepare.';

create index patients_name_phonetic_idx
  on public.patients (org_id, name_phonetic) where deleted_at is null;
create index patients_search_phonetic_trgm_idx
  on public.patients using gin (search_phonetic extensions.gin_trgm_ops);

-- Identique à l'étape 11, plus name_phonetic et search_phonetic.
create or replace function public.patients_prepare()
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
  new.name_phonetic := public.patient_phonetic(new.last_name) || ' '
                       || public.patient_phonetic(new.first_name);
  new.search_phonetic := public.patient_search_phonetic(new.last_name, new.first_name,
    new.mother_first_name, new.mother_last_name, new.neighborhood);
  return new;
end;
$$;

-- Dossiers existants : seuls les deux nouveaux champs changent. Ni date de modification
-- ni ligne d'audit pour un calcul technique.
alter table public.patients disable trigger patients_prepare;
alter table public.patients disable trigger patients_set_updated_at;
alter table public.patients disable trigger patients_audit;

update public.patients set
  name_phonetic = public.patient_phonetic(last_name) || ' ' || public.patient_phonetic(first_name),
  search_phonetic = public.patient_search_phonetic(last_name, first_name, mother_first_name,
                                                   mother_last_name, neighborhood);

alter table public.patients enable trigger patients_prepare;
alter table public.patients enable trigger patients_set_updated_at;
alter table public.patients enable trigger patients_audit;


-- =============================================================================
-- 3. Doublons : même signature et même retour qu'à l'étape 11b
-- =============================================================================

create or replace function public.find_duplicate_candidates(
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
  v_nom     text := public.patient_normalize(p_last_name);
  v_prenom  text := public.patient_normalize(p_first_name);
  v_complet text := public.patient_normalize(coalesce(p_last_name, '') || ' ' || coalesce(p_first_name, ''));
  v_mere    text := public.patient_normalize(p_mother_first_name);
  v_tel     text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  -- Prononciation, dans l'ordre saisi et inversé (nom et prénom souvent intervertis).
  v_phon     text := public.patient_phonetic(p_last_name) || ' ' || public.patient_phonetic(p_first_name);
  v_phon_inv text := public.patient_phonetic(p_first_name) || ' ' || public.patient_phonetic(p_last_name);
  v_mere_phon text := public.patient_phonetic(p_mother_first_name);
begin
  -- Nom ou prénom sans lettre (chiffres seuls) : pas de comparaison de prononciation.
  if public.patient_phonetic(p_last_name) = '' or public.patient_phonetic(p_first_name) = '' then
    v_phon := null;
    v_phon_inv := null;
  end if;
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
             greatest(extensions.similarity(p.name_text, v_complet),
                      case when p.prononce then 0.95 else 0 end)::real as score,
             case
               -- Même téléphone (souvent celui de la famille) : nom proche ET prénom proche,
               -- l'un ou l'autre éventuellement interverti.
               when length(v_tel) = 9
                    and (right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_tel
                         or right(regexp_replace(coalesce(p.phone_secondary, ''), '\D', '', 'g'), 9) = v_tel)
                    and (p.prononce
                         or (extensions.similarity(p.name_text, v_complet) >= 0.5
                             and greatest(extensions.similarity(p.prenom, v_prenom),
                                          extensions.similarity(p.prenom, v_nom)) >= 0.4))
                 then 'meme_telephone'
               when v_mere <> ''
                    and (p.prononce
                         or (extensions.similarity(public.patient_normalize(p.last_name), v_nom) >= 0.6
                             and extensions.similarity(p.prenom, v_prenom) >= 0.5))
                    and (extensions.similarity(public.patient_normalize(p.mother_first_name), v_mere) >= 0.6
                         or (v_mere_phon <> ''
                             and public.patient_phonetic(p.mother_first_name) = v_mere_phon))
                 then 'meme_mere'
               when p_birth_year is not null and p.birth_year is not null
                    and abs(p.birth_year - p_birth_year) <= 1
                    and (p.prononce or extensions.similarity(p.name_text, v_complet) >= 0.7)
                 then 'meme_nom_age'
             end as reason
        from (
          select q.*, public.patient_normalize(q.first_name) as prenom,
                 coalesce(q.name_phonetic in (v_phon, v_phon_inv), false) as prononce
            from public.patients q
           where q.org_id = p_org_id
             and q.deleted_at is null
             and q.id is distinct from p_exclude_id
             and (q.name_text operator(extensions.%) v_complet
                  or q.name_phonetic in (v_phon, v_phon_inv)
                  or (length(v_tel) = 9 and q.phone_digits like '%' || v_tel || '%'))
        ) p
    ) c
   where c.reason is not null
   order by c.score desc
   limit 5;
end;
$$;


-- =============================================================================
-- 4. Recherche : même signature et même retour qu'à l'étape 11b
-- =============================================================================

create or replace function public.search_patients(
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
  v_q        text := public.patient_normalize(p_query);
  v_q_phon   text := public.patient_phonetic_words(p_query);
  v_chiffres text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_numero   boolean;
  v_mots     text[];
  v_cles     text[];
begin
  if not public.patients_can_read(p_org_id) then
    raise exception 'Vous n''avez pas accès au registre des patients.' using errcode = '42501';
  end if;
  v_numero := coalesce(p_query, '') ~ '^[[:space:]0-9+().-]+$' and length(v_chiffres) >= 3;
  v_mots := array_remove(regexp_split_to_array(v_q, ' '), '');
  -- Prononciation de chaque mot, calculée une fois (vide pour un mot avec des chiffres).
  v_cles := array(select case when m !~ '[0-9]' then public.patient_phonetic(m) else '' end
                    from unnest(v_mots) with ordinality as u(m, n) order by n);

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
             select 1 from unnest(v_mots, v_cles) as m(mot, cle)
              where not (p.search_text like '%' || m.mot || '%'
                         -- Faute de frappe tolérée sur les mots, jamais sur un numéro.
                         or (length(m.mot) >= 4 and m.mot !~ '[0-9]'
                             and m.mot operator(extensions.<%) p.search_text)
                         -- Même prononciation : « Momodou » trouve « Mamadou ».
                         or (length(m.cle) >= 3 and p.search_phonetic like '%' || m.cle || '%')))))
   order by
     (lower(p.file_number) = v_q or lower(coalesce(p.legacy_file_number, '')) = v_q) desc,
     case when v_q = '' then 0
          else greatest(extensions.similarity(p.name_text, v_q),
                        extensions.similarity(p.name_phonetic, v_q_phon)) end desc,
     p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


-- =============================================================================
-- 5. Suggestions de quartier
-- =============================================================================

-- Quartiers déjà saisis dans la structure, regroupés sans tenir compte des majuscules,
-- accents et espaces (affichés sous l'orthographe la plus fréquente). Les plus fréquents
-- en premier ; ceux qui commencent par la saisie avant ceux qui la contiennent, puis les
-- fautes de frappe (« Granf » -> « Grand Yoff »). Saisie vide : les plus fréquents.
create function public.suggest_neighborhoods(
  p_org_id uuid, p_query text default '', p_limit integer default 6)
returns table (neighborhood text, patient_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := public.patient_normalize(p_query);
begin
  if not public.patients_can_read(p_org_id) then
    raise exception 'Vous n''avez pas accès au registre des patients.' using errcode = '42501';
  end if;

  return query
  with saisis as (
    select p.neighborhood as libelle, public.patient_normalize(p.neighborhood) as cle
      from public.patients p
     where p.org_id = p_org_id
       and p.deleted_at is null
       and p.neighborhood is not null
       and btrim(p.neighborhood) <> ''
  ),
  groupes as (
    select s.cle, mode() within group (order by s.libelle) as libelle, count(*) as n
      from saisis s
     group by s.cle
  )
  select g.libelle, g.n
    from groupes g
   where v_q = ''
      or g.cle like v_q || '%'
      or g.cle like '% ' || v_q || '%'
      or (length(v_q) >= 3 and extensions.word_similarity(v_q, g.cle) >= 0.5)
   order by
     (v_q <> '' and (g.cle like v_q || '%' or g.cle like '% ' || v_q || '%')) desc,
     g.n desc,
     extensions.word_similarity(v_q, g.cle) desc,
     g.libelle
   limit least(greatest(coalesce(p_limit, 6), 1), 10);
end;
$$;


-- =============================================================================
-- 6. Droits d'exécution
-- =============================================================================

revoke execute on function
  public.patient_phonetic(text),
  public.patient_phonetic_words(text),
  public.patient_search_phonetic(text, text, text, text, text),
  public.suggest_neighborhoods(uuid, text, integer)
from public, anon, authenticated;

grant execute on function
  public.suggest_neighborhoods(uuid, text, integer)
to authenticated;
