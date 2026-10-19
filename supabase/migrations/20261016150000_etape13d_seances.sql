-- =============================================================================
-- Étape 13, partie C — Garde-fous des séances (contrôlés par la base)
-- -----------------------------------------------------------------------------
-- 1. Chevauchement : deux séances actives du même type, le même jour de la semaine, aux
--    horaires qui se chevauchent, sont refusées. Exception (Clinique) : deux praticiens
--    différents, chacun la sienne.
-- 2. Séance qui a des rendez-vous à venir (prévus ou confirmés, aujourd'hui ou après) :
--    ni son type ni son jour ne changent ; ses horaires ne peuvent pas laisser un
--    rendez-vous dehors ; sa capacité ne descend pas sous le nombre de rendez-vous déjà
--    pris un même jour. Les rendez-vous se déplacent d'abord (report).
-- Ces contrôles des rendez-vous à venir valent pour toute modification, même d'une séance
-- retirée (sinon : retirer, changer le type, remettre). Retirer seul (is_active ou
-- deleted_at, sans autre changement) reste possible : ses rendez-vous restent prévus à la
-- même heure, simplement plus comptés dans une séance (l'application prévient avant).
-- Une séance retirée ou inactive n'est pas contrôlée pour le chevauchement.
-- Refus : code 22023, message en français affiché tel quel.
-- =============================================================================

create function public.appointment_sessions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz       text;
  v_auj      date;
  v_type     text;
  v_autre    public.appointment_sessions;
  v_avenir   integer;
  v_dehors   record;
  v_max      record;
begin
  select timezone into v_tz from public.organizations where id = new.org_id;
  v_auj := public.org_local_date(new.org_id);
  select label into v_type from public.appointment_types where id = new.appointment_type_id;

  -- 1. Chevauchement, pour une séance active seulement (une séance retirée n'accueille
  --    plus de rendez-vous). Verrou par type : deux enregistrements simultanés ne passent pas.
  if new.deleted_at is null and new.is_active then
    perform pg_advisory_xact_lock(hashtextextended('seance:' || new.appointment_type_id::text, 0));
    select * into v_autre from public.appointment_sessions s
     where s.org_id = new.org_id
       and s.id <> new.id
       and s.appointment_type_id = new.appointment_type_id
       and s.weekday = new.weekday
       and s.is_active and s.deleted_at is null
       and s.start_time < new.end_time and s.end_time > new.start_time
       and not (s.practitioner_membership_id is not null and new.practitioner_membership_id is not null
                and s.practitioner_membership_id <> new.practitioner_membership_id)
     order by s.start_time
     limit 1;
    if found then
      raise exception 'Une séance « % » existe déjà le % de % à % : les deux se chevauchent.',
        v_type,
        (array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])[v_autre.weekday],
        to_char(v_autre.start_time, 'HH24:MI'), to_char(v_autre.end_time, 'HH24:MI')
        using errcode = '22023';
    end if;
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- 2. Rendez-vous à venir de la séance : contrôlés à chaque modification, séance active
  --    ou retirée.
  select count(*) into v_avenir from public.appointments a
   where a.session_id = old.id and a.local_date >= v_auj
     and a.status in ('scheduled', 'confirmed') and a.deleted_at is null;
  if v_avenir = 0 then
    return new;
  end if;

  if new.appointment_type_id <> old.appointment_type_id then
    raise exception 'Cette séance a % rendez-vous à venir : déplacez-les avant de changer son type.',
      v_avenir using errcode = '22023';
  end if;
  if new.weekday <> old.weekday then
    raise exception 'Cette séance a % rendez-vous à venir : déplacez-les avant de changer son jour.',
      v_avenir using errcode = '22023';
  end if;

  if new.start_time <> old.start_time or new.end_time <> old.end_time then
    select count(*) as nombre,
           to_char(min(a.starts_at) at time zone v_tz, 'HH24:MI "le" DD/MM') as premier
      into v_dehors
      from public.appointments a
     where a.session_id = old.id and a.local_date >= v_auj
       and a.status in ('scheduled', 'confirmed') and a.deleted_at is null
       and ((a.starts_at at time zone v_tz)::time < new.start_time
            or (a.starts_at at time zone v_tz)::time >= new.end_time);
    if v_dehors.nombre > 0 then
      raise exception 'Cette séance a % rendez-vous à venir hors des nouveaux horaires (le premier : %) : déplacez-les d''abord.',
        v_dehors.nombre, v_dehors.premier
        using errcode = '22023';
    end if;
  end if;

  if new.capacity is not null and new.capacity is distinct from old.capacity then
    select a.local_date, count(*) as nombre into v_max
      from public.appointments a
     where a.session_id = old.id and a.local_date >= v_auj
       and a.status in ('scheduled', 'confirmed') and a.deleted_at is null
     group by a.local_date
     order by count(*) desc, a.local_date
     limit 1;
    if v_max.nombre > new.capacity then
      raise exception 'La séance a déjà % rendez-vous le % : sa capacité ne peut pas descendre sous %.',
        v_max.nombre, to_char(v_max.local_date, 'DD/MM/YYYY'), v_max.nombre
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger appointment_sessions_guard
  before insert or update on public.appointment_sessions
  for each row execute function public.appointment_sessions_guard();

revoke execute on function public.appointment_sessions_guard() from public, anon, authenticated;
