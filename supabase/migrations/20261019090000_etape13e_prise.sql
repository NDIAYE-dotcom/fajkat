-- =============================================================================
-- Étape 13, partie D — Prise de rendez-vous : types discrets, changement de type,
--                      prochaines séances libres, file « Sage-femme »
-- -----------------------------------------------------------------------------
-- 1. Types discrets (planification familiale, dépistage…) : seuls ceux qui les voient
--    (soignants, owner, admin : appointments_can_see_discreet) en prennent un, par
--    book_appointment, check_appointment ou schedule_followup. L'accueil et le caissier
--    prennent un rendez-vous « Consultation » ; un soignant change ensuite le type.
-- 2. Le type d'un rendez-vous ne change que par set_appointment_type (rôles médicaux).
--    Le rôle authenticated n'a aucun UPDATE sur appointments (écriture par RPC seulement,
--    étape 13 A) ; en plus, un trigger refuse tout changement de appointment_type_id qui
--    ne vient pas de set_appointment_type : l'autorisation est une variable locale à la
--    transaction (set_config(..., true)) qui porte l'id du rendez-vous, remise à vide
--    aussitôt après, et le trigger revérifie le rôle médical. Le client ne peut pas la
--    poser : PostgREST n'expose pas set_config (schéma pg_catalog) et ne pose lui-même
--    que des variables « request.* ».
--    Report par l'accueil d'un rendez-vous discret masqué : le type gardé est celui en
--    base (inchangé depuis la partie A), jamais le « Consultation » affiché ; la séance
--    envoyée par l'application est ignorée, la base retrouve celle du vrai type.
--    check_appointment, pour un rendez-vous existant (p_exclude_id), lit le vrai type et
--    le vrai patient en base.
-- 3. Libellé neutre : un type discret masqué s'appelle toujours « Consultation » (plus le
--    nom de sa file d'arrivée : la file « Sage-femme » reçoit aussi les CPN, mais un
--    libellé propre aux rendez-vous masqués les distinguerait des autres).
-- 4. La table appointments ne montre plus à l'accueil et au caissier les rendez-vous d'un
--    type discret (l'id du type, inconnu d'eux, suffirait à les repérer). L'agenda passe
--    par list_appointments, qui les renvoie sous le libellé neutre (inchangé).
-- 5. next_available_sessions : prochaines séances qui ont des places (séance pleine).
--    Pour un rendez-vous discret masqué : date, heure et places seulement, ni séance ni
--    type.
-- 6. File « Sage-femme » (postes de santé) : la CPN, la planification familiale et la
--    consultation postnatale (nouveau type) arrivent dans la même file, nommée sans
--    évoquer le soin. Nouveaux postes : modèles mis à jour. Postes existants : seulement
--    si l'owner n'a changé ni les noms des files ni la file des types concernés ; sinon,
--    la file « Planification familiale » est seulement renommée, si elle garde son nom.
--    Les cliniques ne changent pas (la PF y arrive déjà en « Consultation »).
-- 7. Réponses des RPC (book_appointment, reschedule_appointment(s), set_appointment_status,
--    schedule_followup, check_appointment) : pour un rendez-vous discret que l'appelant ne
--    voit pas, ni l'id du vrai type, ni celui de sa séance (appointment_for_viewer).
--    arrive_appointment renvoie le passage (file « Sage-femme » ou Consultation), jamais
--    le type ; set_appointment_type est réservé aux soignants.
-- =============================================================================


-- 1. Libellé neutre ------------------------------------------------------------------

create or replace function public.appointment_type_label_for_viewer(p_type_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not t.is_discreet or public.appointments_can_see_discreet(t.org_id) then t.label
           else 'Consultation'
         end
    from public.appointment_types t
   where t.id = p_type_id;
$$;


-- 2. Table appointments : rendez-vous discrets cachés à qui ne les voit pas ------------

drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (public.appointments_can_see_discreet(org_id)
              or not public.appointment_type_is_discreet(appointment_type_id)));


-- 3. Prise, contrôle, report, suivi : garde des types discrets -----------------------

-- Ligne de rendez-vous renvoyée par une RPC : pour un rendez-vous discret, quand
-- l'appelant ne voit pas les types discrets, le type est celui qu'il voit (Consultation),
-- et ni séance, ni motif d'annulation, ni module d'origine (« pf »…). Les notes ne sont
-- jamais dans cette ligne (appointment_notes, soignants seulement).
create function public.appointment_for_viewer(p_a public.appointments)
returns public.appointments
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_a.id is not null and public.appointment_type_is_discreet(p_a.appointment_type_id)
     and not public.appointments_can_see_discreet(p_a.org_id) then
    p_a.appointment_type_id := public.appointment_type_id_for_viewer(p_a.appointment_type_id);
    p_a.session_id := null;
    p_a.cancel_reason := null;
    p_a.source_ref := null;
  end if;
  return p_a;
end;
$$;

create or replace function public.book_appointment(
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
  p_source          text default 'agenda')
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
end;
$$;

create or replace function public.check_appointment(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_session_id      uuid default null,
  p_count           integer default 1,
  p_interval_months integer default null,
  p_exclude_id      uuid default null)
returns jsonb
language plpgsql
stable
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
  return v_resultat;
end;
$$;

create or replace function public.appointment_reschedule_one(
  p_appointment_id  uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid,
  p_keep_practitioner boolean,
  p_session_id      uuid,
  p_confirm         boolean)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a     public.appointments;
  v_note  text;
  v_neuf  public.appointments;
begin
  select * into v_a from public.appointments
   where id = p_appointment_id and deleted_at is null
   for update;
  if not found or not public.appointments_can_read(v_a.org_id) then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_a.org_id);
  if v_a.status not in ('scheduled', 'confirmed', 'no_show') then
    raise exception 'Ce rendez-vous est déjà clos (arrivé, annulé ou reporté).' using errcode = '22023';
  end if;

  select note into v_note from public.appointment_notes
   where appointment_id = v_a.id and deleted_at is null;

  v_neuf := public.appointment_insert(
    v_a.org_id, v_a.patient_id, v_a.appointment_type_id, p_starts_at,
    case when p_keep_practitioner then v_a.practitioner_membership_id else p_practitioner_id end,
    case when public.appointment_type_is_discreet(v_a.appointment_type_id)
              and not public.appointments_can_see_discreet(v_a.org_id) then null
         else p_session_id end,
    v_note, p_confirm, v_a.series_id, v_a.series_index, 'reschedule',
    v_a.source_ref, v_a.id, v_a.id);

  update public.appointments
     set status = 'rescheduled', status_changed_at = now(), rescheduled_to_id = v_neuf.id
   where id = v_a.id;
  return v_neuf;
end;
$$;

create or replace function public.reschedule_appointment(
  p_appointment_id  uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_keep_practitioner boolean default true,
  p_session_id      uuid default null,
  p_confirm         boolean default false)
returns public.appointments
language sql
volatile
security definer
set search_path = ''
as $$
  select public.appointment_for_viewer(public.appointment_reschedule_one(
    p_appointment_id, p_starts_at, p_practitioner_id, p_keep_practitioner, p_session_id,
    p_confirm));
$$;

create or replace function public.reschedule_appointments(
  p_appointment_ids uuid[], p_new_date date, p_confirm boolean default false)
returns setof public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a record;
begin
  if p_new_date is null then
    raise exception 'Choisissez la nouvelle date.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_appointment_ids), 0) = 0 then
    raise exception 'Choisissez au moins un rendez-vous.' using errcode = '22023';
  end if;
  for v_a in
    select a.id, ((p_new_date + (a.starts_at at time zone o.timezone)::time) at time zone o.timezone)
             as nouveau
      from public.appointments a
      join public.organizations o on o.id = a.org_id
     where a.id = any (p_appointment_ids)
     order by a.starts_at
  loop
    return next public.appointment_for_viewer(
      public.appointment_reschedule_one(v_a.id, v_a.nouveau, null, true, null, p_confirm));
  end loop;
  if not found then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.set_appointment_status(
  p_appointment_id uuid, p_status text, p_reason text default null)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
begin
  select * into v_a from public.appointments
   where id = p_appointment_id and deleted_at is null
   for update;
  if not found or not public.appointments_can_read(v_a.org_id) then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_a.org_id);

  if p_status not in ('scheduled', 'confirmed', 'no_show', 'cancelled') then
    raise exception 'Statut inconnu.' using errcode = '22023';
  end if;
  if v_a.status in ('arrived', 'cancelled', 'rescheduled') then
    raise exception 'Ce rendez-vous est déjà clos (arrivé, annulé ou reporté).' using errcode = '22023';
  end if;
  if v_a.status = 'no_show' and p_status <> 'scheduled' then
    raise exception 'Remettez d''abord ce rendez-vous à « prévu ».' using errcode = '22023';
  end if;
  if p_status = 'no_show' and v_a.local_date > public.org_local_date(v_a.org_id) then
    raise exception 'Un patient ne peut être marqué absent qu''à partir du jour du rendez-vous.'
      using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 300 then
    raise exception 'Le motif ne doit pas dépasser 300 caractères.' using errcode = '22023';
  end if;
  if p_status = v_a.status then
    return public.appointment_for_viewer(v_a);
  end if;

  update public.appointments
     set status = p_status,
         status_changed_at = now(),
         confirmed_at = case when p_status = 'confirmed' then now()
                             when p_status = 'scheduled' then null else confirmed_at end,
         cancelled_at = case when p_status = 'cancelled' then now() end,
         cancel_reason = case when p_status = 'cancelled'
                              then nullif(btrim(coalesce(p_reason, '')), '') end
   where id = p_appointment_id
  returning * into v_a;
  return public.appointment_for_viewer(v_a);
end;
$$;

create or replace function public.schedule_followup(
  p_patient_id uuid, p_type_code text, p_date date, p_source text)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_tz       text;
  v_settings jsonb;
  v_type     public.appointment_types;
  v_existant public.appointments;
  v_jour     date;
  v_dow      integer;
  v_heures   jsonb;
  v_heure    time;
  v_session  uuid;
  v_seances  boolean;
  v_essai    integer;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.appointments_can_read(v_org) then
    raise exception 'Dossier introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_org);
  if p_date is null then
    raise exception 'Indiquez la date du prochain rendez-vous.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_source, '')), '') is null or char_length(p_source) > 60 then
    raise exception 'Indiquez le module qui crée le rendez-vous.' using errcode = '22023';
  end if;

  select * into v_type from public.appointment_types
   where org_id = v_org and template_code = p_type_code and is_active and deleted_at is null
   order by sort_order
   limit 1;
  if not found then
    raise exception 'Le type de rendez-vous « % » n''existe pas dans les paramètres.', p_type_code
      using errcode = '22023';
  end if;
  if v_type.is_discreet and not public.appointments_can_see_discreet(v_org) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;

  select * into v_existant from public.appointments
   where patient_id = p_patient_id and appointment_type_id = v_type.id
     and status in ('scheduled', 'confirmed') and deleted_at is null
     and local_date between p_date - 7 and p_date + 7
   order by abs(local_date - p_date)
   limit 1;
  if found then
    return public.appointment_for_viewer(v_existant);
  end if;

  select timezone, settings into v_tz, v_settings from public.organizations where id = v_org;
  v_seances := exists (select 1 from public.appointment_sessions
                        where appointment_type_id = v_type.id and is_active and deleted_at is null);
  v_jour := greatest(p_date, public.org_local_date(v_org) + 1);

  for v_essai in 0 .. 30 loop
    v_dow := extract(isodow from v_jour)::integer;
    v_heures := v_settings -> 'opening_hours' -> public.weekday_key(v_dow);
    v_heure := null;
    v_session := null;
    if not exists (select 1 from public.holidays
                    where org_id = v_org and holiday_date = v_jour and deleted_at is null)
       and coalesce(v_heures ->> 'statut', '') <> 'ferme' then
      if v_seances then
        perform 1 from public.appointment_sessions
         where appointment_type_id = v_type.id and weekday = v_dow for update;
        select s.id, s.start_time into v_session, v_heure
          from public.appointment_sessions s
         where s.appointment_type_id = v_type.id and s.weekday = v_dow
           and s.is_active and s.deleted_at is null
           and (s.capacity is null
                or s.capacity > (select count(*) from public.appointments a
                                  where a.session_id = s.id and a.local_date = v_jour
                                    and a.status in ('scheduled', 'confirmed', 'arrived')
                                    and a.deleted_at is null))
         order by s.start_time
         limit 1;
      else
        v_heure := case when v_heures ->> 'statut' = 'ouvert'
                         and coalesce(v_heures ->> 'debut', '') ~ '^\d{2}:\d{2}$'
                        then (v_heures ->> 'debut')::time else time '08:00' end;
      end if;
    end if;
    if v_heure is not null then
      -- Avertissements acceptés (autre rendez-vous du patient le même jour…) : aucun
      -- soignant n'est là pour confirmer ; les refus restent des refus.
      return public.appointment_for_viewer(public.appointment_insert(v_org, p_patient_id, v_type.id,
                                       (v_jour + v_heure) at time zone v_tz, null, v_session,
                                       null, true, null, null, 'followup', btrim(p_source), null));
    end if;
    v_jour := v_jour + 1;
  end loop;

  raise exception 'Aucune date libre dans les 30 jours qui suivent le %.', to_char(p_date, 'DD/MM/YYYY')
    using errcode = '22023';
end;
$$;


-- 4. Changement de type (rôles médicaux) ---------------------------------------------

create function public.appointments_type_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_type_id is distinct from old.appointment_type_id
     and (coalesce(current_setting('fajkat.changement_type_rdv', true), '') <> new.id::text
          or not public.appointments_can_medical(new.org_id)) then
    raise exception 'Le type d''un rendez-vous ne change que par « Changer le type », réservé aux soignants.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger appointments_type_guard
  before update of appointment_type_id on public.appointments
  for each row execute function public.appointments_type_guard();

-- Nouveau type pour un rendez-vous prévu ou confirmé : mêmes contrôles qu'une prise (séance
-- du nouveau type, places, jour férié à confirmer…), durée du nouveau type. L'ancien type
-- reste dans le journal d'audit (audit_logs, trigger appointments_audit).
create function public.set_appointment_type(
  p_appointment_id uuid, p_type_id uuid, p_confirm boolean default false)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a      public.appointments;
  v_type   public.appointment_types;
  v_tz     text;
  v_issues jsonb;
begin
  select * into v_a from public.appointments
   where id = p_appointment_id and deleted_at is null
   for update;
  if not found or not public.appointments_can_read(v_a.org_id) then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_a.org_id);
  if not public.appointments_can_medical(v_a.org_id) then
    raise exception 'Seuls les soignants changent le type d''un rendez-vous.' using errcode = '42501';
  end if;
  if v_a.status not in ('scheduled', 'confirmed') then
    raise exception 'Seul un rendez-vous prévu ou confirmé change de type.' using errcode = '22023';
  end if;

  select * into v_type from public.appointment_types
   where id = p_type_id and org_id = v_a.org_id and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez un type de rendez-vous.' using errcode = '22023';
  end if;
  if v_type.id = v_a.appointment_type_id then
    return v_a;
  end if;

  -- Séances du nouveau type ce jour-là verrouillées, comme pour une prise.
  select timezone into v_tz from public.organizations where id = v_a.org_id;
  perform 1 from public.appointment_sessions
   where org_id = v_a.org_id and appointment_type_id = v_type.id
     and weekday = extract(isodow from (v_a.starts_at at time zone v_tz))::integer
   for update;

  v_issues := public.appointment_issues(v_a.org_id, v_type.id, v_a.patient_id, v_a.starts_at,
                                        v_a.practitioner_membership_id, null, v_a.id);
  if jsonb_array_length(v_issues -> 'blocking') > 0 then
    raise exception '%', v_issues -> 'blocking' -> 0 ->> 'message' using errcode = '22023';
  end if;
  if jsonb_array_length(v_issues -> 'warnings') > 0 and not coalesce(p_confirm, false) then
    raise exception '%', 'À confirmer : '
      || (select string_agg(w ->> 'message', ' ') from jsonb_array_elements(v_issues -> 'warnings') w)
      using errcode = '22023', hint = 'confirmation_required';
  end if;

  perform set_config('fajkat.changement_type_rdv', v_a.id::text, true);
  update public.appointments
     set appointment_type_id = v_type.id,
         session_id = (v_issues ->> 'session_id')::uuid,
         ends_at = (v_issues ->> 'ends_at')::timestamptz,
         holiday_confirmed = holiday_confirmed or v_issues -> 'warnings' @> '[{"code": "holiday"}]'
   where id = v_a.id
  returning * into v_a;
  perform set_config('fajkat.changement_type_rdv', '', true);
  return v_a;
end;
$$;


-- 5. Prochaines séances qui ont des places ------------------------------------------

-- Pour un type (prise) ou pour un rendez-vous existant (report : son vrai type, sa place
-- exclue du compte). Ni jour férié, ni jour fermé, ni congé validé du praticien de la
-- séance ; aujourd'hui, seulement les séances pas encore finies. 120 jours au plus.
-- Rendez-vous discret masqué : date, heure de début et places seulement (ni séance, ni
-- heure de fin, ni type).
create function public.next_available_sessions(
  p_org_id          uuid,
  p_type_id         uuid default null,
  p_appointment_id  uuid default null,
  p_from            date default null,
  p_practitioner_id uuid default null,
  p_limit           integer default 3)
returns table (
  local_date  date,
  starts_at   timestamptz,
  start_time  time,
  end_time    time,
  places_left integer,
  session_id  uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type      uuid;
  v_praticien uuid := p_practitioner_id;
  v_exclure   uuid;
  v_masque    boolean;
  v_tz        text;
  v_settings  jsonb;
  v_auj       date;
  v_maintenant time;
  v_jour      date;
  v_dow       integer;
  v_s         record;
  v_pris      integer;
  v_trouves   integer := 0;
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Demandez de 1 à 10 séances.' using errcode = '22023';
  end if;

  if p_appointment_id is not null then
    select a.appointment_type_id, coalesce(p_practitioner_id, a.practitioner_membership_id)
      into v_type, v_praticien
      from public.appointments a
     where a.id = p_appointment_id and a.org_id = p_org_id and a.deleted_at is null;
    if not found then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    v_exclure := p_appointment_id;
  else
    select t.id into v_type from public.appointment_types t
     where t.id = p_type_id and t.org_id = p_org_id and t.is_active and t.deleted_at is null;
    if v_type is null then
      raise exception 'Choisissez un type de rendez-vous.' using errcode = '22023';
    end if;
  end if;
  v_masque := public.appointment_type_is_discreet(v_type)
              and not public.appointments_can_see_discreet(p_org_id);
  if v_masque and p_appointment_id is null then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;

  select o.timezone, o.settings into v_tz, v_settings from public.organizations o
   where o.id = p_org_id;
  v_auj := public.org_local_date(p_org_id);
  v_maintenant := (now() at time zone v_tz)::time;
  v_jour := greatest(coalesce(p_from, v_auj), v_auj);

  while v_jour <= v_auj + 120 and v_trouves < p_limit loop
    v_dow := extract(isodow from v_jour)::integer;
    if not exists (select 1 from public.holidays h
                    where h.org_id = p_org_id and h.holiday_date = v_jour and h.deleted_at is null)
       and coalesce(v_settings -> 'opening_hours' -> public.weekday_key(v_dow) ->> 'statut', '')
           <> 'ferme' then
      for v_s in
        select s.id, s.start_time, s.end_time, s.capacity, s.practitioner_membership_id
          from public.appointment_sessions s
         where s.org_id = p_org_id and s.appointment_type_id = v_type and s.weekday = v_dow
           and s.is_active and s.deleted_at is null
           and (s.practitioner_membership_id is null or v_praticien is null
                or s.practitioner_membership_id = v_praticien)
           and (v_jour > v_auj or s.end_time > v_maintenant)
         order by s.start_time
      loop
        continue when exists (
          select 1 from public.leave_requests l
           where l.membership_id = coalesce(v_s.practitioner_membership_id, v_praticien)
             and l.status = 'approved' and l.deleted_at is null
             and v_jour between l.start_date and l.end_date);
        v_pris := null;
        if v_s.capacity is not null then
          select count(*) into v_pris from public.appointments a
           where a.session_id = v_s.id and a.local_date = v_jour
             and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
             and a.id is distinct from v_exclure;
          continue when v_pris >= v_s.capacity;
        end if;
        local_date  := v_jour;
        starts_at   := (v_jour + v_s.start_time) at time zone v_tz;
        start_time  := v_s.start_time;
        end_time    := case when v_masque then null else v_s.end_time end;
        places_left := v_s.capacity - v_pris;
        session_id  := case when v_masque then null else v_s.id end;
        return next;
        v_trouves := v_trouves + 1;
        exit when v_trouves >= p_limit;
      end loop;
    end if;
    v_jour := v_jour + 1;
  end loop;
end;
$$;


-- 6. File « Sage-femme » -------------------------------------------------------------

-- Nouveaux postes : une seule file pour la CPN, la PF et la consultation postnatale.
update public.queue_service_templates
   set label = 'Sage-femme'
 where plan_code = 'poste_sante' and code = 'cpn' and label = 'Consultation prénatale';
update public.queue_service_templates
   set is_active = false
 where plan_code = 'poste_sante' and code = 'pf';
update public.appointment_type_templates
   set queue_service_code = 'cpn'
 where plan_code = 'poste_sante' and code = 'pf' and queue_service_code = 'pf';
insert into public.appointment_type_templates
  (plan_code, code, label, duration_minutes, is_discreet, recurrence_months, queue_service_code,
   sort_order)
values ('poste_sante', 'postnatal', 'Consultation postnatale', 30, false, null, 'cpn', 25)
on conflict (plan_code, code) do nothing;

-- Postes existants.
do $$
declare
  v_org      uuid;
  v_cpn      public.queue_services;
  v_pf       public.queue_services;
  v_type_cpn uuid;
  v_type_pf  uuid;
  v_libre    boolean;
  v_file     uuid;
begin
  for v_org in select o.id from public.organizations o where o.type = 'poste_sante' loop
    v_cpn := null;
    v_pf := null;
    select * into v_cpn from public.queue_services
     where org_id = v_org and template_code = 'cpn' and deleted_at is null
     order by created_at limit 1;
    select * into v_pf from public.queue_services
     where org_id = v_org and template_code = 'pf' and deleted_at is null
     order by created_at limit 1;
    select queue_service_id into v_type_cpn from public.appointment_types
     where org_id = v_org and template_code = 'cpn' and deleted_at is null
     order by created_at limit 1;
    select queue_service_id into v_type_pf from public.appointment_types
     where org_id = v_org and template_code = 'pf' and deleted_at is null
     order by created_at limit 1;
    -- Nom « Sage-femme » encore libre dans la structure (un nom n'y figure qu'une fois).
    v_libre := not exists (select 1 from public.queue_services
                            where org_id = v_org and deleted_at is null
                              and lower(btrim(label)) = 'sage-femme');

    if v_libre and v_cpn.id is not null and v_pf.id is not null
       and v_cpn.is_active and v_pf.is_active
       and v_cpn.label = 'Consultation prénatale' and v_pf.label = 'Planification familiale'
       and (v_type_cpn is null or v_type_cpn = v_cpn.id)
       and (v_type_pf is null or v_type_pf = v_pf.id) then
      -- Réglages d'origine : les deux files n'en font plus qu'une.
      update public.queue_services set label = 'Sage-femme' where id = v_cpn.id;
      update public.appointment_types set queue_service_id = v_cpn.id
       where org_id = v_org and template_code = 'pf' and queue_service_id = v_pf.id;
      -- L'ancienne file reste (passages déjà enregistrés), désactivée et sous un nom neutre.
      update public.queue_services set is_active = false, label = 'Sage-femme (ancienne file)'
       where id = v_pf.id;
      -- Écrans d'appel qui suivaient la file PF : ils suivent la file commune.
      update public.display_screens
         set queue_service_ids = array_append(queue_service_ids, v_cpn.id)
       where org_id = v_org and v_pf.id = any (queue_service_ids)
         and not v_cpn.id = any (queue_service_ids);
    elsif v_libre and v_pf.id is not null and v_pf.label = 'Planification familiale' then
      -- Réglages changés par l'owner : la file PF garde sa place, sous un nom neutre.
      update public.queue_services set label = 'Sage-femme' where id = v_pf.id;
    end if;

    -- Consultation postnatale : dans la file où arrive la CPN (la file « Sage-femme »
    -- quand les deux files ont été réunies).
    if not exists (select 1 from public.appointment_types
                    where org_id = v_org and template_code = 'postnatal') then
      select queue_service_id into v_file from public.appointment_types
       where org_id = v_org and template_code = 'cpn' and deleted_at is null
       order by created_at limit 1;
      insert into public.appointment_types (org_id, template_code, label, duration_minutes,
                                            is_discreet, recurrence_months, queue_service_id,
                                            sort_order, created_by)
      values (v_org, 'postnatal', 'Consultation postnatale', 30, false, null,
              coalesce(v_file, v_cpn.id), 25, null);
    end if;
  end loop;
end $$;


-- 7. Droits ------------------------------------------------------------------------

revoke execute on function
  public.appointment_for_viewer(public.appointments),
  public.appointments_type_guard(),
  public.set_appointment_type(uuid, uuid, boolean),
  public.next_available_sessions(uuid, uuid, uuid, date, uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.set_appointment_type(uuid, uuid, boolean),
  public.next_available_sessions(uuid, uuid, uuid, date, uuid, integer)
to authenticated;
