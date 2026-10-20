-- =============================================================================
-- Étape 14, partie B (correctif) : version dépassée d'un brouillon de consultation
-- -----------------------------------------------------------------------------
-- encounter_assert_author levait l'erreur 40001 quand le brouillon avait changé sur un
-- autre appareil. 40001 est le code des conflits de sérialisation : PostgREST rejoue alors
-- la transaction sans fin, et la requête ne répond jamais (écran bloqué sur
-- « Enregistrement… »). Même refus, même message, mais code 22023 avec l'indice
-- « version_conflict » (comme « confirmation_required » des rendez-vous).
-- Rien d'autre ne change : save_encounter_draft, discard_encounter_draft et
-- validate_encounter appellent cette fonction.
-- =============================================================================

create or replace function public.encounter_assert_author(p_enc public.encounters, p_version integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_enc.status <> 'draft' then
    raise exception 'Consultation déjà validée : ajoutez un avenant.' using errcode = '42501';
  end if;
  if p_enc.author_id is distinct from auth.uid() then
    raise exception 'Cette consultation est tenue par %. Reprenez-la pour la continuer.',
      public.user_display_name(p_enc.author_id) using errcode = '42501';
  end if;
  if p_version is null or p_version <> p_enc.version then
    raise exception 'Cette consultation a été modifiée sur un autre appareil. Rechargez-la avant de continuer.'
      using errcode = '22023', hint = 'version_conflict';
  end if;
end;
$$;

revoke execute on function public.encounter_assert_author(public.encounters, integer)
  from public, anon, authenticated;
