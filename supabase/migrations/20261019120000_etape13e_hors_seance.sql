-- =============================================================================
-- Étape 13, partie D (correctif) — rendez-vous « hors séance » choisi volontairement
-- -----------------------------------------------------------------------------
-- Jusqu'ici, un rendez-vous sans séance dont l'heure tombe pendant une séance du même
-- type était rattaché à cette séance (et refusé si elle était pleine). La fenêtre de prise
-- propose maintenant « Autre heure, hors séance » comme un choix volontaire, jamais coché
-- d'office :
--   - book_appointment / check_appointment reçoivent p_outside_session (faux par défaut :
--     comportement inchangé, report compris) ;
--   - hors séance : le rendez-vous n'est rattaché à aucune séance ; s'il tombe pendant une
--     séance pleine du même type, un avertissement est rendu (« La séance de 09:00 est
--     pleine : prendre quand même ce patient hors séance ? ») et la prise doit être
--     confirmée (p_confirm) ; une séance qui a des places n'est pas concernée ;
--   - jamais pour un rendez-vous discret masqué (sa séance est retrouvée par la base).
-- Mécanisme : variable de transaction fajkat.hors_seance posée par les deux RPC et lue par
-- appointment_issues, qui enveloppe l'ancienne fonction (renommée appointment_issues_base).
-- =============================================================================


-- 1. appointment_issues : enveloppe de l'ancienne fonction -------------------------

alter function public.appointment_issues(uuid, uuid, uuid, timestamptz, uuid, uuid, uuid)
  rename to appointment_issues_base;

create function public.appointment_issues(
  p_org_id          uuid,
  p_type_id         uuid,
  p_patient_id      uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid,
  p_session_id      uuid,
  p_exclude_id      uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r       jsonb;
  v_session public.appointment_sessions;
  v_pris    integer;
begin
  v_r := public.appointment_issues_base(p_org_id, p_type_id, p_patient_id, p_starts_at,
                                        p_practitioner_id, p_session_id, p_exclude_id);
  if p_session_id is not null or coalesce(current_setting('fajkat.hors_seance', true), '') <> 'on'
     or v_r ->> 'session_id' is null then
    return v_r;
  end if;

  -- Hors séance volontaire : aucune séance rattachée ; séance pleine signalée, à confirmer.
  select * into v_session from public.appointment_sessions where id = (v_r ->> 'session_id')::uuid;
  v_r := v_r || jsonb_build_object('session_id', null,
    'blocking', coalesce((select jsonb_agg(b) from jsonb_array_elements(v_r -> 'blocking') b
                           where b ->> 'code' <> 'full'), '[]'::jsonb));
  if v_session.capacity is not null then
    select count(*) into v_pris from public.appointments a
     where a.session_id = v_session.id and a.local_date = (v_r ->> 'local_date')::date
       and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
       and a.id is distinct from p_exclude_id;
    if v_pris >= v_session.capacity then
      v_r := jsonb_set(v_r, '{warnings}', jsonb_build_array(jsonb_build_object(
        'code', 'outside_full',
        'message', 'La séance de ' || to_char(v_session.start_time, 'HH24:MI')
                   || ' est pleine : prendre quand même ce patient hors séance ?'))
        || (v_r -> 'warnings'));
    end if;
  end if;
  return v_r;
end;
$$;


-- 2. book_appointment et check_appointment : p_outside_session -----------------------

drop function public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean,
                                      integer, integer, text);
drop function public.check_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, integer,
                                       integer, uuid);

create function public.book_appointment(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_session_id      uuid default null,
  p_note            text default null,
  p_confirm         boolean default false,
  p_count           integer default 1,
  p_interval_months integer default null,
  p_source          text default 'agenda',
  p_outside_session boolean default false)
returns setof public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_serie uuid;
  v_d     record;
begin
  perform public.appointments_assert_write(p_org_id);
  perform set_config('fajkat.hors_seance', case when p_outside_session then 'on' else '' end, true);
  if public.appointment_type_is_discreet(p_type_id) and not public.appointments_can_see_discreet(p_org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  if coalesce(p_source, '') not in ('agenda', 'patient_file') then
    raise exception 'Origine du rendez-vous inconnue.' using errcode = '22023';
  end if;
  if p_count is null or p_count not between 1 and 24 then
    raise exception 'Une série compte de 1 à 24 rendez-vous.' using errcode = '22023';
  end if;
  if p_count > 1 then
    if coalesce(p_interval_months, 0) not between 1 and 24 then
      raise exception 'Indiquez l''intervalle entre les rendez-vous (1 à 24 mois).'
        using errcode = '22023';
    end if;
    v_serie := gen_random_uuid();
  end if;

  for v_d in select * from public.appointment_series_dates(p_org_id, p_starts_at, p_count,
                                                           p_interval_months) loop
    return next public.appointment_for_viewer(public.appointment_insert(
      p_org_id, p_patient_id, p_type_id, v_d.starts_at, p_practitioner_id,
      case when v_d.series_index = 1 then p_session_id end,
      p_note, p_confirm, v_serie, case when v_serie is not null then v_d.series_index end,
      p_source, null, null));
  end loop;
  perform set_config('fajkat.hors_seance', '', true);
end;
$$;

create function public.check_appointment(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_session_id      uuid default null,
  p_count           integer default 1,
  p_interval_months integer default null,
  p_exclude_id      uuid default null,
  p_outside_session boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resultat jsonb := '[]'::jsonb;
  v_d        record;
  v_type     uuid := p_type_id;
  v_patient  uuid := p_patient_id;
  v_session  uuid := p_session_id;
  v_masque   boolean := false;
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_exclude_id is not null then
    select a.appointment_type_id, a.patient_id into v_type, v_patient
      from public.appointments a
     where a.id = p_exclude_id and a.org_id = p_org_id and a.deleted_at is null;
    if not found then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    -- Rendez-vous discret masqué : sa séance est trouvée par la base.
    if public.appointment_type_is_discreet(v_type)
       and not public.appointments_can_see_discreet(p_org_id) then
      v_session := null;
      v_masque := true;
    end if;
  elsif public.appointment_type_is_discreet(p_type_id)
        and not public.appointments_can_see_discreet(p_org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 24 then
    raise exception 'Une série compte de 1 à 24 rendez-vous.' using errcode = '22023';
  end if;
  if p_count > 1 and coalesce(p_interval_months, 0) not between 1 and 24 then
    raise exception 'Indiquez l''intervalle entre les rendez-vous (1 à 24 mois).' using errcode = '22023';
  end if;
  -- Hors séance volontaire : seulement pour un type que l'appelant voit (jamais pour un
  -- rendez-vous discret masqué, dont la base retrouve la séance).
  perform set_config('fajkat.hors_seance',
    case when p_outside_session and not v_masque then 'on' else '' end, true);
  for v_d in select * from public.appointment_series_dates(p_org_id, p_starts_at, p_count,
                                                           p_interval_months) loop
    v_resultat := v_resultat || jsonb_build_array(
      jsonb_build_object('series_index', v_d.series_index)
      || public.appointment_issues(p_org_id, v_type, v_patient, v_d.starts_at,
                                   p_practitioner_id,
                                   case when v_d.series_index = 1 then v_session end,
                                   p_exclude_id));
  end loop;
  -- Rendez-vous discret masqué : la séance trouvée (celle de son vrai type) n'est pas rendue.
  if v_masque then
    select coalesce(jsonb_agg(e || jsonb_build_object('session_id', null)), '[]'::jsonb)
      into v_resultat from jsonb_array_elements(v_resultat) e;
  end if;
  perform set_config('fajkat.hors_seance', '', true);
  return v_resultat;
end;
$$;


-- 3. Droits ------------------------------------------------------------------------

revoke execute on function
  public.appointment_issues_base(uuid, uuid, uuid, timestamptz, uuid, uuid, uuid),
  public.appointment_issues(uuid, uuid, uuid, timestamptz, uuid, uuid, uuid),
  public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean, integer,
                          integer, text, boolean),
  public.check_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, integer, integer, uuid,
                           boolean)
from public, anon, authenticated;

grant execute on function
  public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean, integer,
                          integer, text, boolean),
  public.check_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, integer, integer, uuid,
                           boolean)
to authenticated;
