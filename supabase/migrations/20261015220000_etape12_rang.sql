-- =============================================================================
-- Étape 12 — Personnes devant un ticket (correctif de get_ticket_public)
-- -----------------------------------------------------------------------------
-- « Personnes devant » suit exactement l'ordre de « Appeler le suivant » (call_next vers la
-- consultation) : même file, même jour, patients encore à appeler (en attente OU aux
-- constantes), triés par priorité, puis heure d'arrivée, puis numéro. Avant, les patients
-- aux constantes n'étaient pas comptés : le ticket annonçait « Vous êtes le prochain » alors
-- qu'un patient aux constantes passait encore avant.
-- Le ticket et la page de suivi lisent tous deux cette fonction.
-- =============================================================================

create function public.ticket_people_ahead(p_visit public.visits)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.visits v
    join public.queue_priorities p on p.code = v.priority
    join public.queue_priorities moi on moi.code = p_visit.priority
   where v.queue_service_id = p_visit.queue_service_id
     and v.visit_date = p_visit.visit_date
     and v.deleted_at is null
     and v.status in ('waiting', 'vitals')
     and v.id <> p_visit.id
     and (p.rank, v.arrived_at, v.ticket_seq) < (moi.rank, p_visit.arrived_at, p_visit.ticket_seq);
$$;

revoke execute on function public.ticket_people_ahead(public.visits)
  from public, anon, authenticated;

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

  return jsonb_build_object(
    'status', case when v_visite.status = 'waiting' then 'waiting'
                   when v_visite.status in ('done', 'left') then 'done'
                   else 'called' end,
    'org_name', v_org.name,
    'ticket_number', v_visite.ticket_number,
    'ahead', case when v_visite.status = 'waiting'
                  then public.ticket_people_ahead(v_visite) end,
    'room', (select label from public.rooms where id = v_visite.room_id),
    'arrived_at', v_visite.arrived_at);
end;
$$;
