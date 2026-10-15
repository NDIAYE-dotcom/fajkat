-- =============================================================================
-- Étape 12 — Confidentialité de l'affichage public (correctif de 20261015190000)
-- -----------------------------------------------------------------------------
-- 1. Écran d'appel : plus de nom de service dans les messages ni dans les derniers appels
--    (« CPN » ou « Dépistage » à côté des initiales trahirait le secret médical).
--    Numéro, initiales, salle seulement.
-- 2. Suivi public du ticket : plus de service ; numéro, personnes devant, salle. Un jeton
--    d'un autre jour ne renvoie plus que « expired », sans le numéro.
-- 3. Jeton du QR : 128 bits aléatoires (32 caractères hexadécimaux), jamais l'id du
--    passage. Les jetons courts déjà attribués sont remplacés (les QR déjà imprimés ne
--    fonctionnent plus : ils ne valaient de toute façon que le jour même).
--
-- Signatures inchangées : create or replace garde les droits d'exécution existants.
-- =============================================================================


-- =============================================================================
-- 1. Jeton du QR
-- =============================================================================

alter table public.visits
  alter column public_code set default replace(gen_random_uuid()::text, '-', '');

update public.visits
   set public_code = replace(gen_random_uuid()::text, '-', '')
 where public_code !~ '^[0-9a-f]{32}$';

comment on column public.visits.public_code is
  'Jeton du QR du ticket (128 bits aléatoires, jamais l''id du passage), valable le jour du passage.';


-- =============================================================================
-- 2. Écran d'appel : numéro, initiales, salle
-- =============================================================================

-- Ce que voit l'écran pour un appel : numéro, initiales, salle. Rien d'autre : pas même
-- le service (« CPN » ou « Dépistage » à côté des initiales trahirait le secret médical).
create or replace function public.display_call_payload(p_visit public.visits)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'visit_id', p_visit.id,
    'ticket_number', p_visit.ticket_number,
    'initials', public.patient_initials(p.first_name, p.last_name),
    'room', r.label,
    'called_at', p_visit.last_called_at,
    'call_count', p_visit.call_count)
    from public.patients p
    left join public.rooms r on r.id = p_visit.room_id
   where p.id = p_visit.patient_id;
$$;


-- =============================================================================
-- 3. Suivi public du ticket : numéro, personnes devant, salle
-- =============================================================================

-- status : waiting | called | done | expired | unknown. Numéro, nombre de personnes
-- devant, salle : ni nom, ni motif, ni service (secret médical). Jeton valable le jour du
-- passage seulement ; la page s'actualise au plus toutes les 60 s (et sur demande).
create or replace function public.get_ticket_public(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visite public.visits;
  v_org    public.organizations;
  v_rang   integer;
begin
  select * into v_visite from public.visits
   where public_code = btrim(coalesce(p_code, '')) and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  select * into v_org from public.organizations where id = v_visite.org_id;
  if v_org.deleted_at is not null or v_org.status = 'suspended'
     or not public.org_has_feature(v_org.id, 'file_attente') then
    return jsonb_build_object('status', 'unknown');
  end if;
  if v_visite.visit_date <> public.org_local_date(v_org.id) then
    return jsonb_build_object('status', 'expired');
  end if;

  -- Personnes qui passeront avant, dans le même service (même ordre que call_next).
  if v_visite.status = 'waiting' then
    select count(*) into v_rang
      from public.visits v
      join public.queue_priorities p on p.code = v.priority
      join public.queue_priorities moi on moi.code = v_visite.priority
     where v.queue_service_id = v_visite.queue_service_id
       and v.visit_date = v_visite.visit_date and v.deleted_at is null
       and v.status = 'waiting' and v.id <> v_visite.id
       and (p.rank, v.arrived_at, v.ticket_seq) < (moi.rank, v_visite.arrived_at, v_visite.ticket_seq);
  end if;

  return jsonb_build_object(
    'status', case when v_visite.status = 'waiting' then 'waiting'
                   when v_visite.status in ('done', 'left') then 'done'
                   else 'called' end,
    'org_name', v_org.name,
    'ticket_number', v_visite.ticket_number,
    'ahead', v_rang,
    'room', (select label from public.rooms where id = v_visite.room_id),
    'arrived_at', v_visite.arrived_at);
end;
$$;
