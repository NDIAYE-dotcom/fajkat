-- =============================================================================
-- Étape 13, partie E — Suivi des rendez-vous : statuts, arrivée, rappels de la veille,
--                      rendez-vous du patient, séries contrôlées date par date
-- -----------------------------------------------------------------------------
-- 1. Rappels et téléphone partagé : au Sénégal, le téléphone est souvent celui de la
--    famille. Un rendez-vous discret (planification familiale, dépistage…) n'est rappelé
--    que sur le téléphone de la patiente elle-même (patients.phone_owner = 'patient') :
--    sinon il n'apparaît pas dans la liste des rappels, sans aucune mention qui le
--    signale. Règle unique : appointment_reminder_allowed(), à reprendre par les envois
--    WhatsApp (étapes 23 et 24). Le soignant reste libre de prévenir la patiente lui-même.
-- 2. « Rappel fait » (appel ou message à la main) : reminder_done_at / reminder_done_by,
--    posés par set_appointment_reminder. reminder_sent_at reste réservé à l'envoi
--    WhatsApp automatique (étapes 23 et 24). appointments_to_remind renvoie ces colonnes
--    et le numéro de dossier (homonymes).
-- 3. Séries masquées : une PF tous les 3 mois se repère par sa série, même affichée
--    « Consultation ». Pour un rendez-vous discret que l'appelant ne voit pas : ni
--    series_id, ni series_index (appointment_for_viewer, list_appointments,
--    list_patient_appointments). list_appointments masque aussi source_ref (module
--    d'origine, « pf »…), comme appointment_for_viewer.
-- 4. Annulation : motif obligatoire (300 caractères au plus).
-- 5. arrive_appointment : pour un rendez-vous discret masqué, la file envoyée par
--    l'application (celle du libellé « Consultation ») est ignorée : le patient entre dans
--    la file du vrai type (« Sage-femme » au poste). Sans file réglée pour ce type, la file
--    choisie est reprise.
-- 6. list_patient_appointments : rendez-vous d'un patient (fiche, onglet « Rendez-vous »),
--    avec les mêmes règles de masquage que l'agenda.
-- 7. Séries contrôlées date par date : check_appointment_series et
--    book_appointment_series reçoivent la liste des dates (heure, séance, hors séance
--    pour chacune) : une date sur un jour férié ou dans une séance pleine peut être
--    déplacée seule avant l'enregistrement. Tout ou rien, même series_id. Réservé à qui
--    voit le type (un type discret : soignants, owner, admin).
-- =============================================================================


-- 1. Règle des rappels -----------------------------------------------------------------

-- Vrai si le rendez-vous peut figurer dans un rappel (liste de la veille, WhatsApp) : un
-- type discret seulement quand le téléphone du dossier est celui de la patiente elle-même.
-- Titulaire inconnu : pas de rappel (prudence). Jamais exposée au client : la réponse
-- dirait si un rendez-vous est discret.
create function public.appointment_reminder_allowed(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not t.is_discreet or (p.phone is not null and p.phone_owner = 'patient')
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
      join public.patients p on p.id = a.patient_id
     where a.id = p_appointment_id), false);
$$;


-- 2. « Rappel fait » -------------------------------------------------------------------

alter table public.appointments
  add column reminder_done_at timestamptz,
  add column reminder_done_by uuid references auth.users (id) on delete set null;

comment on column public.appointments.reminder_done_at is
  'Rappel fait à la main (appel, message), coché dans « À rappeler demain ».';
comment on column public.appointments.reminder_sent_at is
  'Rappel WhatsApp envoyé automatiquement (étapes 23 et 24).';

-- Coche ou décoche « Rappel fait » pour les rendez-vous d'un même téléphone (une famille
-- prévenue en un appel). Rendez-vous prévus ou confirmés, d'aujourd'hui ou plus tard,
-- qui peuvent être rappelés ; sinon « Rendez-vous introuvable » (rien n'est révélé).
create function public.set_appointment_reminder(p_appointment_ids uuid[], p_done boolean)
returns table (appointment_id uuid, reminder_done_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_id uuid;
begin
  if coalesce(cardinality(p_appointment_ids), 0) = 0 or cardinality(p_appointment_ids) > 50 then
    raise exception 'Choisissez de 1 à 50 rendez-vous.' using errcode = '22023';
  end if;
  foreach v_id in array p_appointment_ids loop
    select * into v_a from public.appointments
     where id = v_id and deleted_at is null
     for update;
    if not found or not public.appointments_can_read(v_a.org_id)
       or not public.appointment_reminder_allowed(v_a.id) then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    perform public.appointments_assert_write(v_a.org_id);
    if v_a.status not in ('scheduled', 'confirmed')
       or v_a.local_date < public.org_local_date(v_a.org_id) then
      raise exception 'Ce rendez-vous n''est plus à rappeler (passé, arrivé, annulé ou reporté).'
        using errcode = '22023';
    end if;
    update public.appointments a
       set reminder_done_at = case when coalesce(p_done, false) then now() end,
           reminder_done_by = case when coalesce(p_done, false) then auth.uid() end
     where a.id = v_id;
    appointment_id := v_id;
    reminder_done_at := case when coalesce(p_done, false) then now() end;
    return next;
  end loop;
end;
$$;

drop function public.appointments_to_remind(uuid, date);

-- Rendez-vous à rappeler (demain par défaut). Un rendez-vous discret n'y figure que sur
-- le téléphone de la patiente elle-même (appointment_reminder_allowed). patient_label :
-- message destiné au patient, jamais le nom d'un type discret.
create function public.appointments_to_remind(p_org_id uuid, p_date date default null)
returns table (
  appointment_id        uuid,
  patient_id            uuid,
  patient_last_name     text,
  patient_first_name    text,
  file_number           text,
  phone                 text,
  phone_owner           text,
  whatsapp_consent      boolean,
  preferred_language    text,
  starts_at             timestamptz,
  status                text,
  type_label            text,
  is_discreet           boolean,
  patient_label         text,
  practitioner_name     text,
  reminder_sent_at      timestamptz,
  reminder_done_at      timestamptz,
  reminder_done_by_name text)
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
    select a.id, a.patient_id, p.last_name, p.first_name, p.file_number, p.phone,
           p.phone_owner, p.whatsapp_consent, p.preferred_language, a.starts_at, a.status,
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           t.is_discreet and v_discret, public.appointment_patient_label(a.id),
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           a.reminder_sent_at, a.reminder_done_at,
           case when a.reminder_done_by is not null
                then coalesce((select nullif(btrim(pr.full_name), '') from public.profiles pr
                                where pr.id = a.reminder_done_by), 'Membre sans nom') end
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types t on t.id = a.appointment_type_id
     where a.org_id = p_org_id and a.deleted_at is null
       and a.status in ('scheduled', 'confirmed')
       and a.local_date = coalesce(p_date, public.org_local_date(p_org_id) + 1)
       and public.appointment_reminder_allowed(a.id)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;


-- 3. Séries masquées --------------------------------------------------------------------

create or replace function public.appointment_for_viewer(p_a public.appointments)
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
    -- Une série (PF tous les 3 mois) trahirait le soin.
    p_a.series_id := null;
    p_a.series_index := null;
  end if;
  return p_a;
end;
$$;

create or replace function public.list_appointments(
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
           -- Pour l'accueil et le caissier, rien ne signale un rendez-vous discret : ni le
           -- type, ni la séance, ni la série, ni le module d'origine, ni le motif.
           t.is_discreet and v_discret, a.practitioner_membership_id,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           case when t.is_discreet and not v_discret then null else a.session_id end,
           case when t.is_discreet and not v_discret then null else a.series_id end,
           case when t.is_discreet and not v_discret then null else a.series_index end,
           a.source,
           case when t.is_discreet and not v_discret then null else a.source_ref end,
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


-- 4. Annulation : motif obligatoire ----------------------------------------------------

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
  if p_status = 'cancelled' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Indiquez le motif de l''annulation.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 300 then
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
         cancel_reason = case when p_status = 'cancelled' then btrim(p_reason) end
   where id = p_appointment_id
  returning * into v_a;
  return public.appointment_for_viewer(v_a);
end;
$$;


-- 5. Arrivée : file du vrai type pour un rendez-vous discret masqué ---------------------

create or replace function public.arrive_appointment(
  p_appointment_id   uuid,
  p_queue_service_id uuid default null,
  p_priority         text default 'normal')
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a       public.appointments;
  v_file    uuid;
  v_service uuid;
  v_visite  public.visits;
begin
  select * into v_a from public.appointments
   where id = p_appointment_id and deleted_at is null
   for update;
  if not found or not public.appointments_can_read(v_a.org_id) then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_a.org_id);
  if not public.queue_can_read(v_a.org_id) then
    raise exception 'Votre rôle ne permet pas d''enregistrer une arrivée.' using errcode = '42501';
  end if;
  if v_a.status not in ('scheduled', 'confirmed', 'no_show') then
    raise exception 'Ce rendez-vous est déjà clos (arrivé, annulé ou reporté).' using errcode = '22023';
  end if;
  if v_a.local_date <> public.org_local_date(v_a.org_id) then
    raise exception 'Ce rendez-vous n''est pas prévu aujourd''hui : reportez-le d''abord.'
      using errcode = '22023';
  end if;

  select queue_service_id into v_file from public.appointment_types
   where id = v_a.appointment_type_id;
  -- Rendez-vous discret masqué : l'application ne connaît que « Consultation » ; la file
  -- envoyée n'est reprise que si le vrai type n'a pas de file.
  if public.appointment_type_is_discreet(v_a.appointment_type_id)
     and not public.appointments_can_see_discreet(v_a.org_id) then
    v_service := coalesce(v_file, p_queue_service_id);
  else
    v_service := coalesce(p_queue_service_id, v_file);
  end if;
  if v_service is null then
    raise exception 'Choisissez le service de la file d''attente.' using errcode = '22023';
  end if;

  select * into v_visite from public.visits
   where patient_id = v_a.patient_id and queue_service_id = v_service
     and visit_date = v_a.local_date and status in ('waiting', 'vitals', 'consultation')
     and deleted_at is null
   limit 1;
  if not found then
    v_visite := public.visit_create(v_a.org_id, v_a.patient_id, v_service,
                                    coalesce(p_priority, 'normal'), null, 'appointment');
  end if;

  update public.appointments
     set status = 'arrived', status_changed_at = now(), arrived_at = now(), visit_id = v_visite.id
   where id = v_a.id;
  return v_visite;
end;
$$;


-- 6. Rendez-vous d'un patient -----------------------------------------------------------

create function public.list_patient_appointments(p_patient_id uuid)
returns table (
  id                  uuid,
  starts_at           timestamptz,
  ends_at             timestamptz,
  local_date          date,
  status              text,
  appointment_type_id uuid,
  type_label          text,
  is_discreet         boolean,
  practitioner_name   text,
  series_id           uuid,
  series_index        smallint,
  source              text,
  ticket_number       text,
  cancel_reason       text,
  note                text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_medical boolean;
  v_discret boolean;
begin
  select p.org_id into v_org from public.patients p where p.id = p_patient_id;
  if v_org is null or not public.appointments_can_read(v_org) then
    raise exception 'Dossier introuvable.' using errcode = '42501';
  end if;
  v_medical := public.appointments_can_medical(v_org);
  v_discret := public.appointments_can_see_discreet(v_org);
  return query
    select a.id, a.starts_at, a.ends_at, a.local_date, a.status,
           public.appointment_type_id_for_viewer(a.appointment_type_id),
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           t.is_discreet and v_discret,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           case when t.is_discreet and not v_discret then null else a.series_id end,
           case when t.is_discreet and not v_discret then null else a.series_index end,
           a.source, v.ticket_number,
           case when t.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical then n.note end
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
     where a.patient_id = p_patient_id and a.org_id = v_org and a.deleted_at is null
     order by a.starts_at desc;
end;
$$;


-- 7. Séries contrôlées date par date ---------------------------------------------------

-- Dates d'une série envoyées par l'application : [{ starts_at, session_id?,
-- outside_session? }], de 2 à 24, dans l'ordre. Un jour ne figure qu'une fois.
create function public.appointment_series_items(p_org_id uuid, p_items jsonb)
returns table (series_index integer, starts_at timestamptz, session_id uuid,
               outside_session boolean, local_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 2 and 24 then
    raise exception 'Une série compte de 2 à 24 rendez-vous.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'starts_at', '') = '') then
    raise exception 'Choisissez la date et l''heure de chaque rendez-vous de la série.'
      using errcode = '22023';
  end if;
  select o.timezone into v_tz from public.organizations o where o.id = p_org_id;
  return query
    select (e.n)::integer, (e.v ->> 'starts_at')::timestamptz,
           nullif(e.v ->> 'session_id', '')::uuid,
           coalesce((e.v ->> 'outside_session')::boolean, false),
           ((e.v ->> 'starts_at')::timestamptz at time zone v_tz)::date
      from jsonb_array_elements(p_items) with ordinality e(v, n)
     order by e.n;
end;
$$;

-- Aperçu d'une série : un élément par date, comme check_appointment, plus le refus « deux
-- rendez-vous le même jour ».
create function public.check_appointment_series(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_items           jsonb,
  p_practitioner_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultat jsonb := '[]'::jsonb;
  v_i        record;
  v_r        jsonb;
  v_vus      date[] := '{}';
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if public.appointment_type_is_discreet(p_type_id)
     and not public.appointments_can_see_discreet(p_org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  for v_i in select * from public.appointment_series_items(p_org_id, p_items) loop
    perform set_config('fajkat.hors_seance',
                       case when v_i.outside_session and v_i.session_id is null then 'on' else '' end,
                       true);
    v_r := jsonb_build_object('series_index', v_i.series_index)
           || public.appointment_issues(p_org_id, p_type_id, p_patient_id, v_i.starts_at,
                                        p_practitioner_id, v_i.session_id, null);
    if v_i.local_date = any (v_vus) then
      v_r := jsonb_set(v_r, '{blocking}', (v_r -> 'blocking') || jsonb_build_array(
        jsonb_build_object('code', 'series_same_day',
          'message', 'Un autre rendez-vous de la série tombe déjà le '
                     || to_char(v_i.local_date, 'DD/MM/YYYY') || '.')));
    end if;
    v_vus := v_vus || v_i.local_date;
    v_resultat := v_resultat || jsonb_build_array(v_r);
  end loop;
  perform set_config('fajkat.hors_seance', '', true);
  return v_resultat;
end;
$$;

-- Prise d'une série : chaque date avec son heure et sa séance (ou hors séance). Tout ou
-- rien : une date refusée annule toute la série ; les avertissements (jour férié…) se
-- confirment par p_confirm.
create function public.book_appointment_series(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_items           jsonb,
  p_practitioner_id uuid default null,
  p_note            text default null,
  p_confirm         boolean default false,
  p_source          text default 'agenda')
returns setof public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_serie uuid := gen_random_uuid();
  v_i     record;
  v_vus   date[] := '{}';
begin
  perform public.appointments_assert_write(p_org_id);
  if public.appointment_type_is_discreet(p_type_id)
     and not public.appointments_can_see_discreet(p_org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  if coalesce(p_source, '') not in ('agenda', 'patient_file') then
    raise exception 'Origine du rendez-vous inconnue.' using errcode = '22023';
  end if;

  for v_i in select * from public.appointment_series_items(p_org_id, p_items) loop
    if v_i.local_date = any (v_vus) then
      raise exception 'Un autre rendez-vous de la série tombe déjà le %.',
        to_char(v_i.local_date, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    v_vus := v_vus || v_i.local_date;
    perform set_config('fajkat.hors_seance',
                       case when v_i.outside_session and v_i.session_id is null then 'on' else '' end,
                       true);
    return next public.appointment_for_viewer(public.appointment_insert(
      p_org_id, p_patient_id, p_type_id, v_i.starts_at, p_practitioner_id, v_i.session_id,
      p_note, p_confirm, v_serie, v_i.series_index, p_source, null, null));
  end loop;
  perform set_config('fajkat.hors_seance', '', true);
end;
$$;


-- 8. Droits ------------------------------------------------------------------------------

revoke execute on function
  public.appointment_reminder_allowed(uuid),
  public.set_appointment_reminder(uuid[], boolean),
  public.appointments_to_remind(uuid, date),
  public.list_patient_appointments(uuid),
  public.appointment_series_items(uuid, jsonb),
  public.check_appointment_series(uuid, uuid, uuid, jsonb, uuid),
  public.book_appointment_series(uuid, uuid, uuid, jsonb, uuid, text, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.set_appointment_reminder(uuid[], boolean),
  public.appointments_to_remind(uuid, date),
  public.list_patient_appointments(uuid),
  public.check_appointment_series(uuid, uuid, uuid, jsonb, uuid),
  public.book_appointment_series(uuid, uuid, uuid, jsonb, uuid, text, boolean, text)
to authenticated;
