-- =============================================================================
-- Étape 12, partie F — Bornes de vraisemblance des constantes
-- -----------------------------------------------------------------------------
-- 1. vital_sign_bounds() : bornes { mesure: { min, max } } lues dans les contraintes de
--    vital_signs (une seule source : l'écran les affiche sans les recopier).
-- 2. vital_alerts (aperçu pendant la saisie) : aucune alerte sur une valeur impossible,
--    ni sur une tension incomplète ou incohérente (systolique sans diastolique, ou
--    systolique pas plus haute que la diastolique). save_vitals les refuse déjà.
-- =============================================================================

-- « CHECK (((systolic >= 40) AND (systolic <= 300))) » -> { "systolic": { "min": 40, "max": 300 } }
create function public.vital_sign_bounds()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.mesure, jsonb_build_object('min', b.mini, 'max', b.maxi)),
                  '{}'::jsonb)
    from (
      select m.mesure,
             (regexp_match(d.definition, '>=\s*\(?([0-9.]+)'))[1]::numeric as mini,
             (regexp_match(d.definition, '<=\s*\(?([0-9.]+)'))[1]::numeric as maxi
        from unnest(array['weight_kg', 'height_cm', 'temperature_c', 'systolic', 'diastolic',
                          'pulse', 'spo2', 'glucose_g_l', 'muac_mm']) m(mesure)
        join lateral (
          select pg_get_constraintdef(c.oid) as definition
            from pg_catalog.pg_constraint c
           where c.conrelid = 'public.vital_signs'::regclass
             and c.conname = 'vital_signs_' || m.mesure || '_check') d on true
    ) b
   where b.mini is not null and b.maxi is not null;
$$;

-- Valeurs plausibles seulement : nombre, dans les bornes ; tension complète et cohérente.
create function public.vital_values_plausible(p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bornes jsonb := public.vital_sign_bounds();
  v_sortie jsonb := '{}'::jsonb;
  v_cle    text;
  v_valeur numeric;
begin
  for v_cle in select jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) loop
    continue when not public.vital_measure_valid(v_cle)
      or jsonb_typeof(p_values -> v_cle) <> 'number';
    v_valeur := (p_values ->> v_cle)::numeric;
    continue when v_bornes ? v_cle
      and (v_valeur < (v_bornes -> v_cle ->> 'min')::numeric
           or v_valeur > (v_bornes -> v_cle ->> 'max')::numeric);
    v_sortie := v_sortie || jsonb_build_object(v_cle, v_valeur);
  end loop;

  if not (v_sortie ? 'systolic' and v_sortie ? 'diastolic')
     or (v_sortie ->> 'systolic')::numeric <= (v_sortie ->> 'diastolic')::numeric then
    v_sortie := v_sortie - 'systolic' - 'diastolic';
  end if;
  return v_sortie;
end;
$$;

-- Aperçu des alertes pendant la saisie (même calcul que l'enregistrement), sur les seules
-- valeurs plausibles.
create or replace function public.vital_alerts(p_patient_id uuid, p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.queue_can_medical(v_org) then
    raise exception 'Les constantes sont réservées aux soignants.' using errcode = '42501';
  end if;
  return public.vital_alerts_compute(
    v_org, public.patient_age_months(p_patient_id, public.org_local_date(v_org)),
    public.vital_values_plausible(p_values));
end;
$$;

revoke execute on function public.vital_sign_bounds(), public.vital_values_plausible(jsonb)
  from public, anon, authenticated;
grant execute on function public.vital_sign_bounds() to authenticated;
