-- =============================================================================
-- Étape 13, partie C — Types discrets masqués aux rôles non soignants, et identité
--                      des patients dans l'agenda (homonymes)
-- -----------------------------------------------------------------------------
-- Un type discret (planification familiale, dépistage…) n'est nommé qu'aux soignants
-- (appointments_can_medical) et à l'owner et l'admin, qui paramètrent l'agenda
-- (appointments_can_see_discreet). Pour l'accueil et le caissier :
--   - list_appointments et appointments_to_remind renvoient un libellé neutre : le nom de
--     la file d'arrivée du type, sinon « Consultation » (aussi quand le nom de la file
--     est lui-même parlant : « Planification familiale »). Le rendez-vous se range ainsi
--     dans une colonne ordinaire : appointment_type_id est celui du type visible qui porte
--     ce libellé (Consultation), is_discreet vaut false, cancel_reason est vide (texte
--     libre qui pourrait révéler le soin). Rien ne distingue un rendez-vous discret ;
--   - les tables appointment_types et appointment_sessions ne montrent plus les types
--     discrets ni leurs séances ;
--   - les messages de contrôle (« Ce patient a déjà un rendez-vous ce jour-là… »)
--     utilisent le même libellé neutre.
-- La note du rendez-vous reste réservée aux soignants (inchangé).
-- list_appointments renvoie aussi le sexe et la naissance du patient : l'agenda affiche
-- le numéro de dossier et l'âge pour distinguer deux homonymes.
-- =============================================================================


-- 1. Aides ---------------------------------------------------------------------

-- Libellé qui évoque un soin discret. Ce n'est qu'un filet de sécurité (type discret
-- d'office à la création, nom de file trop parlant) : le vrai réglage reste la case
-- « Type discret » des paramètres. Accents écrits en minuscules et en capitales : la
-- comparaison sans casse des lettres accentuées dépend de la collation de la base.
create function public.appointment_label_is_discreet(p_label text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_label, '') ~* ('(d[eéEÉ]pistage|planification|contracep|\mpf\M|\mvih\M'
    || '|\mptme\M|\mist\M|\msida\M|sant[eéEÉ] mentale|\mpsy|avortement|\msaa\M|\mvbg\M'
    || '|violence)');
$$;

create or replace function public.appointment_types_discreet_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.appointment_label_is_discreet(new.label) then
    new.is_discreet := true;
  end if;
  return new;
end;
$$;

create function public.appointments_can_see_discreet(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.appointments_can_medical(p_org_id) or public.appointments_can_manage(p_org_id);
$$;

create function public.appointment_type_is_discreet(p_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_discreet from public.appointment_types where id = p_type_id), false);
$$;

-- Nom du type pour l'utilisateur connecté : le vrai nom, ou un libellé neutre.
create function public.appointment_type_label_for_viewer(p_type_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not t.is_discreet or public.appointments_can_see_discreet(t.org_id) then t.label
           when q.label is not null and not public.appointment_label_is_discreet(q.label) then q.label
           else 'Consultation'
         end
    from public.appointment_types t
    left join public.queue_services q on q.id = t.queue_service_id
   where t.id = p_type_id;
$$;


-- Type à renvoyer à l'utilisateur connecté : le vrai, ou, pour un type discret qu'il ne
-- voit pas, le type visible qui porte le libellé neutre (Consultation) ; sinon rien.
create function public.appointment_type_id_for_viewer(p_type_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not t.is_discreet or public.appointments_can_see_discreet(t.org_id) then t.id
           else (select v.id from public.appointment_types v
                  where v.org_id = t.org_id and not v.is_discreet and v.deleted_at is null
                    and v.label = public.appointment_type_label_for_viewer(t.id)
                  order by v.is_active desc, v.sort_order
                  limit 1)
         end
    from public.appointment_types t
   where t.id = p_type_id;
$$;


-- 2. Tables : types discrets et leurs séances cachés ---------------------------

drop policy appointment_types_select on public.appointment_types;
create policy appointment_types_select on public.appointment_types
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (not is_discreet or public.appointments_can_see_discreet(org_id)));

drop policy appointment_sessions_select on public.appointment_sessions;
create policy appointment_sessions_select on public.appointment_sessions
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (public.appointments_can_see_discreet(org_id)
              or not public.appointment_type_is_discreet(appointment_type_id)));


-- 3. Contrôles : libellé neutre dans les messages --------------------------------

create or replace function public.appointment_issues(
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
  v_tz        text;
  v_settings  jsonb;
  v_type      public.appointment_types;
  v_ends_at   timestamptz;
  v_local     timestamp;
  v_date      date;
  v_debut     time;
  v_fin       time;
  v_dow       integer;
  v_session   public.appointment_sessions;
  v_pris      integer;
  v_jour      jsonb;
  v_libelle   text;
  v_nom       text;
  v_bloquants jsonb := '[]'::jsonb;
  v_alertes   jsonb := '[]'::jsonb;
  v_b         record;
begin
  select timezone, settings into v_tz, v_settings from public.organizations where id = p_org_id;
  select * into v_type from public.appointment_types
   where id = p_type_id and org_id = p_org_id and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez un type de rendez-vous.' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'Choisissez la date et l''heure du rendez-vous.' using errcode = '22023';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_type.duration_minutes);
  v_local   := p_starts_at at time zone v_tz;
  v_date    := v_local::date;
  v_debut   := v_local::time;
  v_fin     := (v_ends_at at time zone v_tz)::time;
  v_dow     := extract(isodow from v_date)::integer;

  if v_date < public.org_local_date(p_org_id) then
    v_bloquants := v_bloquants || jsonb_build_object('code', 'past',
      'message', 'Cette date est passée (' || to_char(v_date, 'DD/MM/YYYY') || ').');
  end if;

  -- Praticien.
  if p_practitioner_id is not null then
    if not public.org_has_feature(p_org_id, 'agenda_multi_praticiens') then
      v_bloquants := v_bloquants || jsonb_build_object('code', 'practitioner',
        'message', 'L''agenda par praticien fait partie de l''offre Clinique.');
    elsif not public.is_practitioner(p_org_id, p_practitioner_id) then
      v_bloquants := v_bloquants || jsonb_build_object('code', 'practitioner',
        'message', 'Choisissez un praticien actif de la structure.');
    else
      v_nom := public.membership_display_name(p_practitioner_id);
      -- Congé validé (étape 9) : ni le type ni le motif ne sont donnés.
      if exists (select 1 from public.leave_requests l
                  where l.membership_id = p_practitioner_id and l.status = 'approved'
                    and l.deleted_at is null and v_date between l.start_date and l.end_date) then
        v_alertes := v_alertes || jsonb_build_object('code', 'leave',
          'message', v_nom || ' est en congé le ' || to_char(v_date, 'DD/MM/YYYY') || '.');
      end if;
    end if;
  end if;

  -- Séance : celle choisie, ou celle du type qui couvre l'heure ce jour-là.
  if p_session_id is not null then
    select * into v_session from public.appointment_sessions
     where id = p_session_id and org_id = p_org_id and is_active and deleted_at is null;
    if not found or v_session.appointment_type_id <> p_type_id or v_session.weekday <> v_dow
       or v_debut < v_session.start_time or v_debut >= v_session.end_time then
      v_bloquants := v_bloquants || jsonb_build_object('code', 'session',
        'message', 'Cette séance n''a pas lieu à la date et à l''heure choisies.');
      v_session := null;
    end if;
  else
    select * into v_session from public.appointment_sessions s
     where s.org_id = p_org_id and s.appointment_type_id = p_type_id and s.weekday = v_dow
       and s.is_active and s.deleted_at is null
       and v_debut >= s.start_time and v_debut < s.end_time
       and (s.practitioner_membership_id is null or p_practitioner_id is null
            or s.practitioner_membership_id = p_practitioner_id)
     order by (s.practitioner_membership_id is not distinct from p_practitioner_id) desc,
              s.start_time
     limit 1;
  end if;

  if v_session.id is not null and v_session.capacity is not null then
    select count(*) into v_pris from public.appointments a
     where a.session_id = v_session.id and a.local_date = v_date
       and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
       and a.id is distinct from p_exclude_id;
    if v_pris >= v_session.capacity then
      v_bloquants := v_bloquants || jsonb_build_object('code', 'full',
        'message', 'Séance pleine le ' || to_char(v_date, 'DD/MM/YYYY') || ' : '
                   || v_pris || ' / ' || v_session.capacity || ' rendez-vous.');
    end if;
  end if;

  -- Jour férié.
  select label into v_libelle from public.holidays
   where org_id = p_org_id and holiday_date = v_date and deleted_at is null;
  if v_libelle is not null then
    v_alertes := v_alertes || jsonb_build_object('code', 'holiday',
      'message', 'Le ' || to_char(v_date, 'DD/MM/YYYY') || ' est un jour férié (' || v_libelle || ').');
  end if;

  -- Horaires d'ouverture (étape 7) : rien n'est supposé si le jour n'est pas renseigné.
  v_jour := v_settings -> 'opening_hours' -> public.weekday_key(v_dow);
  if v_jour ->> 'statut' = 'ferme' then
    v_alertes := v_alertes || jsonb_build_object('code', 'closed',
      'message', 'La structure est fermée le ' || public.weekday_key(v_dow) || '.');
  elsif v_jour ->> 'statut' = 'ouvert'
        and coalesce(v_jour ->> 'debut', '') ~ '^\d{2}:\d{2}$'
        and coalesce(v_jour ->> 'fin', '') ~ '^\d{2}:\d{2}$' then
    if v_debut < (v_jour ->> 'debut')::time
       or (v_fin > (v_jour ->> 'fin')::time and (v_jour ->> 'fin')::time > (v_jour ->> 'debut')::time)
       or v_fin < v_debut then
      v_alertes := v_alertes || jsonb_build_object('code', 'hours',
        'message', 'En dehors des horaires d''ouverture (' || (v_jour ->> 'debut') || ' – '
                   || (v_jour ->> 'fin') || ').');
    end if;
  end if;

  -- Pauses.
  select b.label, b.start_time, b.end_time into v_b from public.appointment_breaks b
   where b.org_id = p_org_id and b.is_active and b.deleted_at is null
     and (b.weekday is null or b.weekday = v_dow)
     and v_debut < b.end_time and (v_fin > b.start_time or v_fin < v_debut)
   order by b.start_time
   limit 1;
  if found then
    v_alertes := v_alertes || jsonb_build_object('code', 'break',
      'message', 'Pendant la pause « ' || v_b.label || ' » (' || to_char(v_b.start_time, 'HH24:MI')
                 || ' – ' || to_char(v_b.end_time, 'HH24:MI') || ').');
  end if;

  -- Créneau du praticien déjà pris (hors séance : une séance accueille plusieurs patients).
  if p_practitioner_id is not null and v_session.id is null and v_nom is not null then
    select to_char(a.starts_at at time zone v_tz, 'HH24:MI') into v_libelle
      from public.appointments a
     where a.practitioner_membership_id = p_practitioner_id
       and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
       and a.id is distinct from p_exclude_id
       and a.starts_at < v_ends_at and a.ends_at > p_starts_at
     order by a.starts_at
     limit 1;
    if v_libelle is not null then
      v_alertes := v_alertes || jsonb_build_object('code', 'overlap',
        'message', v_nom || ' a déjà un rendez-vous à ' || v_libelle || '.');
    end if;
  end if;

  -- Autre rendez-vous du même patient ce jour-là.
  if p_patient_id is not null then
    select to_char(a.starts_at at time zone v_tz, 'HH24:MI') || ', '
           || public.appointment_type_label_for_viewer(a.appointment_type_id) into v_libelle
      from public.appointments a
     where a.patient_id = p_patient_id and a.local_date = v_date
       and a.status in ('scheduled', 'confirmed') and a.deleted_at is null
       and a.id is distinct from p_exclude_id
     order by a.starts_at
     limit 1;
    if v_libelle is not null then
      v_alertes := v_alertes || jsonb_build_object('code', 'patient_same_day',
        'message', 'Ce patient a déjà un rendez-vous ce jour-là (' || v_libelle || ').');
    end if;
  end if;

  return jsonb_build_object(
    'starts_at',  p_starts_at,
    'ends_at',    v_ends_at,
    'local_date', v_date,
    'session_id', v_session.id,
    'blocking',   v_bloquants,
    'warnings',   v_alertes);
end;
$$;


-- 4. Agenda : libellé neutre, identité du patient ----------------------------------

drop function public.list_appointments(uuid, date, date, uuid);

create function public.list_appointments(
  p_org_id          uuid,
  p_from            date,
  p_to              date,
  p_practitioner_id uuid default null)
returns table (
  id                         uuid,
  patient_id                 uuid,
  patient_last_name          text,
  patient_first_name         text,
  patient_sex                text,
  birth_date                 date,
  birth_date_estimated       boolean,
  birth_year                 smallint,
  file_number                text,
  phone                      text,
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  local_date                 date,
  status                     text,
  appointment_type_id        uuid,
  type_label                 text,
  is_discreet                boolean,
  practitioner_membership_id uuid,
  practitioner_name          text,
  session_id                 uuid,
  series_id                  uuid,
  series_index               smallint,
  source                     text,
  source_ref                 text,
  holiday_confirmed          boolean,
  visit_id                   uuid,
  ticket_number              text,
  cancel_reason              text,
  note                       text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_medical boolean := public.appointments_can_medical(p_org_id);
  v_discret boolean := public.appointments_can_see_discreet(p_org_id);
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Choisissez une période de 62 jours au plus.' using errcode = '22023';
  end if;
  return query
    select a.id, a.patient_id, p.last_name, p.first_name, p.sex, p.birth_date,
           p.birth_date_estimated, p.birth_year, p.file_number, p.phone,
           a.starts_at, a.ends_at, a.local_date, a.status,
           public.appointment_type_id_for_viewer(a.appointment_type_id),
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           -- Pour l'accueil et le caissier, rien ne signale un rendez-vous discret.
           t.is_discreet and v_discret, a.practitioner_membership_id,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           -- Séance d'un type discret : cachée aussi (elle porterait son nom).
           case when t.is_discreet and not v_discret then null else a.session_id end,
           a.series_id, a.series_index, a.source, a.source_ref,
           a.holiday_confirmed, a.visit_id, v.ticket_number,
           case when t.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical then n.note end
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types t on t.id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
     where a.org_id = p_org_id and a.deleted_at is null
       and a.local_date between p_from and p_to
       and (p_practitioner_id is null or a.practitioner_membership_id = p_practitioner_id)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;

-- « À rappeler demain » : même libellé neutre pour l'accueil et le caissier
-- (patient_label, destiné au patient, ne nomme jamais un type discret : inchangé).
create or replace function public.appointments_to_remind(p_org_id uuid, p_date date default null)
returns table (
  appointment_id     uuid,
  patient_id         uuid,
  patient_last_name  text,
  patient_first_name text,
  phone              text,
  phone_owner        text,
  whatsapp_consent   boolean,
  preferred_language text,
  starts_at          timestamptz,
  status             text,
  type_label         text,
  is_discreet        boolean,
  patient_label      text,
  practitioner_name  text,
  reminder_sent_at   timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_discret boolean := public.appointments_can_see_discreet(p_org_id);
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  return query
    select a.id, a.patient_id, p.last_name, p.first_name, p.phone, p.phone_owner,
           p.whatsapp_consent, p.preferred_language, a.starts_at, a.status,
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           t.is_discreet and v_discret, public.appointment_patient_label(a.id),
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           a.reminder_sent_at
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types t on t.id = a.appointment_type_id
     where a.org_id = p_org_id and a.deleted_at is null
       and a.status in ('scheduled', 'confirmed')
       and a.local_date = coalesce(p_date, public.org_local_date(p_org_id) + 1)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;


-- 5. Droits ------------------------------------------------------------------------

revoke execute on function
  public.appointment_label_is_discreet(text),
  public.appointments_can_see_discreet(uuid),
  public.appointment_type_is_discreet(uuid),
  public.appointment_type_label_for_viewer(uuid),
  public.appointment_type_id_for_viewer(uuid),
  public.list_appointments(uuid, date, date, uuid)
from public, anon, authenticated;

-- Aides appelées par les policies et par le trigger « discret d'office », et RPC du module.
grant execute on function
  public.appointment_label_is_discreet(text),
  public.appointments_can_see_discreet(uuid),
  public.appointment_type_is_discreet(uuid),
  public.list_appointments(uuid, date, date, uuid)
to authenticated;
