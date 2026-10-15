-- =============================================================================
-- Étape 11f (suite) — Numéro d'un dossier fusionné
-- -----------------------------------------------------------------------------
-- Un patient revient avec une carte ou un papier marqué du numéro d'un dossier fusionné
-- (CL-2026-000020). Ce numéro, complet ou en partie (« 000020 »), trouve désormais le
-- dossier gardé, avec la mention de l'ancien numéro. Les fusions en chaîne (A dans B,
-- puis B dans C) mènent au dossier gardé en dernier.
--
-- search_patients : recréée (nouvelle colonne merged_file_numbers dans le retour).
-- Ne modifie pas les migrations précédentes.
-- =============================================================================

drop function public.search_patients(uuid, text, integer, integer);

create function public.search_patients(
  p_org_id uuid, p_query text default '', p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, file_number text, legacy_file_number text, last_name text, first_name text,
  sex text, birth_date date, birth_date_estimated boolean, birth_year smallint,
  declared_age smallint, phone text, phone_owner text, neighborhood text,
  mother_first_name text, household_id uuid, photo_path text, created_at timestamptz,
  merged_file_numbers text, total_count bigint)
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
  with recursive anciens as (
    -- Dossiers fusionnés dont le numéro correspond : complet (« CL-2026-000020 ») ou ses
    -- chiffres en partie (« 000020 »).
    select m.file_number as ancien, m.merged_into_id as cible, 1 as saut
      from public.patients m
     where m.org_id = p_org_id
       and m.merged_into_id is not null
       and v_q <> ''
       and (lower(m.file_number) = v_q
            or (v_numero and regexp_replace(m.file_number, '\D', '', 'g')
                             like '%' || v_chiffres || '%'))
    union all
    -- Fusion en chaîne : on suit jusqu'au dossier gardé en dernier.
    select a.ancien, c.merged_into_id, a.saut + 1
      from anciens a
      join public.patients c on c.id = a.cible
     where c.merged_into_id is not null and a.saut < 10
  ),
  par_cible as (
    select a.cible, string_agg(distinct a.ancien, ', ' order by a.ancien) as numeros
      from anciens a
     group by a.cible
  )
  select p.id, p.file_number, p.legacy_file_number, p.last_name, p.first_name, p.sex,
         p.birth_date, p.birth_date_estimated, p.birth_year, p.declared_age, p.phone,
         p.phone_owner, p.neighborhood, p.mother_first_name, p.household_id, p.photo_path,
         p.created_at, pc.numeros, count(*) over ()
    from public.patients p
    left join par_cible pc on pc.cible = p.id
   where p.org_id = p_org_id
     and p.deleted_at is null
     and (
       v_q = ''
       or pc.cible is not null
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
     (lower(p.file_number) = v_q or lower(coalesce(p.legacy_file_number, '')) = v_q
      or pc.cible is not null) desc,
     case when v_q = '' then 0
          else greatest(extensions.similarity(p.name_text, v_q),
                        extensions.similarity(p.name_phonetic, v_q_phon)) end desc,
     p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.search_patients(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_patients(uuid, text, integer, integer) to authenticated;
