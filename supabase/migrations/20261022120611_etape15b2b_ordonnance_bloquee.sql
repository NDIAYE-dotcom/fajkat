-- =============================================================================
-- Étape 15, partie B2 (correctif) : un soin bloqué ne part jamais sur l'ordonnance
-- -----------------------------------------------------------------------------
-- Défaut trouvé par Ousmane : la ligne de SP ajoutée par « Ajouter à l'ordonnance » restait
-- dans l'ordonnance d'une patiente « Sous cotrimoxazole ». Une patiente sous cotrimoxazole
-- pouvait repartir avec de la SP.
-- 1. Validation de toute consultation refusée si son ordonnance contient la ligne d'un soin
--    bloqué par une situation en cours ce jour : pour une CPN, celles cochées dans la CPN
--    (sinon celles de la grossesse) ; pour toute autre consultation (fièvre…), celles en
--    cours de la grossesse. La ligne est reconnue par sa clé fixe (« maternite-tpi_sp »),
--    et par le nom du produit proposé par le type de soin, lu par drug_name_normalize
--    (sans majuscules, accents, tirets ni « + » : « SULFADOXINE-PYRIMÉTHAMINE »,
--    « sulfadoxine + pyriméthamine »). Les noms de marque (Fansidar…) viendront du
--    catalogue de la pharmacie (docs/plus-tard.md).
-- 2. Même contrôle, par le nom du produit, sur toute ligne ajoutée à une consultation déjà
--    validée (add_prescription), quel que soit son type, tant que la situation est en cours,
--    seulement pour un utilisateur habilité aux données sensibles : pour les autres (le
--    pharmacien à l'étape 17), rien ne change, ni refus ni message. Une ligne enregistrée
--    ne se modifie plus (prescription_items_frozen, étape 14) : pas de contrôle d'UPDATE.
-- =============================================================================

-- Nom de médicament comparable : minuscules, sans accents, apostrophes, tirets, « + » ni
-- ponctuation (« Sulfadoxine-pyriméthamine » = « sulfadoxine + pyrimethamine »).
create function public.drug_name_normalize(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(public.patient_normalize(p_text), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Message de blocage si un produit (et sa clé de ligne, facultative) correspond au soin
-- d'un type bloqué par l'une des situations données ; null sinon. Interne.
create function public.blocked_care_prescription(
  p_org_id uuid, p_conditions text[], p_product_name text, p_cle text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.block_message || ' Retirez « ' || btrim(p_product_name) || ' » de l''ordonnance.'
    from public.maternal_intervention_types t
   where t.org_id = p_org_id and t.deleted_at is null
     and t.blocked_by_condition = any (coalesce(p_conditions, '{}'::text[]))
     and (p_cle = 'maternite-' || coalesce(t.template_code, t.id::text)
          or (t.prescription ->> 'product_name' is not null
              and public.drug_name_normalize(t.prescription ->> 'product_name')
                  = public.drug_name_normalize(p_product_name)))
   order by t.sort_order
   limit 1;
$$;

-- Ordonnance du brouillon d'une consultation, contrôlée avec les situations du jour (p_cpn :
-- celles cochées dans la CPN ; sinon celles en cours de la grossesse). Interne.
create function public.anc_prescription_check(p_enc public.encounters, p_data jsonb, p_cpn boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_g    uuid;
  v_cond text[];
  v_item jsonb;
  v_msg  text;
begin
  select id into v_g from public.pregnancies
   where patient_id = p_enc.patient_id and status = 'ongoing' and deleted_at is null;
  if v_g is null then
    return;
  end if;
  v_cond := coalesce(case when p_cpn then public.anc_draft_conditions(p_data -> 'maternite') end,
                     public.pregnancy_active_conditions(v_g));
  for v_item in
    select * from jsonb_array_elements(public.jsonb_array_or_empty(p_data #> '{prescription,items}'))
  loop
    v_msg := public.blocked_care_prescription(p_enc.org_id, v_cond, v_item ->> 'product_name',
                                              v_item ->> 'cle');
    if v_msg is not null then
      raise exception '%', v_msg using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Remplace encounter_validate_extensions (partie B2) : plus le contrôle de l'ordonnance,
-- pour toute consultation.
create or replace function public.encounter_validate_extensions(p_enc public.encounters, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  select template_code into v_code from public.encounter_types where id = p_enc.encounter_type_id;
  if v_code = 'cpn' then
    perform public.anc_visit_from_encounter(p_enc, p_data -> 'maternite');
    perform public.anc_care_from_encounter(p_enc, p_data -> 'maternite');
  end if;
  perform public.anc_prescription_check(p_enc, p_data, coalesce(v_code = 'cpn', false));
end;
$$;

-- Ligne ajoutée à une consultation déjà validée (add_prescription) : refusée si elle
-- correspond au soin bloqué par une situation en cours de la grossesse, et seulement pour
-- un utilisateur habilité aux données sensibles (sinon rien ne change : ni refus ni
-- message, rien ne révèle la situation). Pendant la validation (consultation encore en
-- brouillon), le contrôle est celui de la validation, avec les situations du jour.
create function public.prescription_items_blocked_care()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_g   uuid;
  v_msg text;
begin
  select e.* into v_enc
    from public.prescriptions p
    join public.encounters e on e.id = p.encounter_id
   where p.id = new.prescription_id;
  if v_enc.id is null or v_enc.status = 'draft'
     or not public.patients_can_read_sensitive(v_enc.org_id) then
    return new;
  end if;
  select id into v_g from public.pregnancies
   where patient_id = v_enc.patient_id and status = 'ongoing' and deleted_at is null;
  if v_g is null then
    return new;
  end if;
  v_msg := public.blocked_care_prescription(v_enc.org_id, public.pregnancy_active_conditions(v_g),
                                            new.product_name, null);
  if v_msg is not null then
    raise exception '%', v_msg using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger prescription_items_blocked_care before insert on public.prescription_items
  for each row execute function public.prescription_items_blocked_care();

revoke execute on function
  public.drug_name_normalize(text),
  public.blocked_care_prescription(uuid, text[], text, text),
  public.anc_prescription_check(public.encounters, jsonb, boolean),
  public.prescription_items_blocked_care()
from public, anon, authenticated;
