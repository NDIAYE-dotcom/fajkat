-- =============================================================================
-- Étape 13, correctif H : vitesse des listes de rendez-vous (avancé de l'étape 30)
-- -----------------------------------------------------------------------------
-- Mesuré le 21/10/2026 sur une base locale (325 rendez-vous sur une semaine, dont 134 de
-- types discrets) : list_appointments 250 ms pour une sage-femme, 700 ms pour l'accueil ;
-- la même requête sans fonction par ligne : 1,5 ms.
-- Cause : pour chaque rendez-vous, appointment_type_id_for_viewer et
-- appointment_type_label_for_viewer recalculaient appointments_can_see_discreet (droits de
-- l'utilisateur, offre de la structure) ; pour l'accueil, chaque rendez-vous discret
-- relançait en plus le calcul sur chaque type candidat. Fonctions security definer, jamais
-- intégrées à la requête par Postgres.
-- Correction, masquage identique :
-- 1. appointment_types_seen(p_org_id, p_can_see, p_type_id) : type et libellé vus, calculés
--    une fois par type de la structure, avec un droit déjà connu. Interne : fermée à
--    authenticated (avec p_can_see à true, l'accueil lirait les libellés réels).
-- 2. appointment_type_label_for_viewer et appointment_type_id_for_viewer s'appuient sur elle :
--    le masquage reste écrit en un seul endroit.
-- 3. list_appointments, list_patient_appointments, appointments_to_remind : droits calculés
--    une fois par appel, types vus joints une fois, nom du praticien par jointure.
-- Aucune table ni aucun index ne change (la requête seule tient en 1,5 ms).
-- =============================================================================


-- =============================================================================
-- 1. Types vus par l'utilisateur
-- =============================================================================

-- Pour chaque type de la structure (retirés compris : un rendez-vous ancien peut en garder
-- un), ce que voit un utilisateur selon p_can_see (appointments_can_see_discreet), comme
-- appointment_type_label_for_viewer (étape 13 E) et appointment_type_id_for_viewer (13 C) :
--   - type ordinaire, ou utilisateur habilité : le type et son libellé ;
--   - type discret masqué : « Consultation » ; type : le type ordinaire de ce libellé
--     (actif d'abord), sinon aucun.
-- p_type_id : un seul type (appel ligne à ligne des fonctions ci-dessous).
create function public.appointment_types_seen(
  p_org_id uuid, p_can_see boolean, p_type_id uuid default null)
returns table (type_id uuid, seen_type_id uuid, seen_label text, is_discreet boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with vus as (
    select t.id, t.org_id, t.is_discreet,
           case when not t.is_discreet or p_can_see then t.label else 'Consultation' end
             as libelle
      from public.appointment_types t
     where t.org_id = p_org_id
       and (p_type_id is null or t.id = p_type_id)
  )
  select vus.id,
         case
           when not vus.is_discreet or p_can_see then vus.id
           else (select v.id from public.appointment_types v
                  where v.org_id = vus.org_id and not v.is_discreet and v.deleted_at is null
                    and v.label = vus.libelle
                  order by v.is_active desc, v.sort_order
                  limit 1)
         end,
         vus.libelle,
         vus.is_discreet
    from vus;
$$;

create or replace function public.appointment_type_label_for_viewer(p_type_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.seen_label
    from public.appointment_types t
    cross join lateral public.appointment_types_seen(
      t.org_id, public.appointments_can_see_discreet(t.org_id), t.id) s
   where t.id = p_type_id;
$$;

create or replace function public.appointment_type_id_for_viewer(p_type_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.seen_type_id
    from public.appointment_types t
    cross join lateral public.appointment_types_seen(
      t.org_id, public.appointments_can_see_discreet(t.org_id), t.id) s
   where t.id = p_type_id;
$$;


-- =============================================================================
-- 2. Agenda (même résultat, colonne par colonne)
-- =============================================================================

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
  note                       text,
  closed_automatically       boolean)
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
           s.seen_type_id, s.seen_label,
           -- Pour l'accueil et le caissier, rien ne signale un rendez-vous discret : ni le
           -- type, ni la séance, ni la série, ni le module d'origine, ni le motif.
           s.is_discreet and v_discret, a.practitioner_membership_id,
           case when a.practitioner_membership_id is not null and pr.id is not null
                then coalesce(nullif(btrim(pr.full_name), ''), 'Membre sans nom') end,
           case when s.is_discreet and not v_discret then null else a.session_id end,
           case when s.is_discreet and not v_discret then null else a.series_id end,
           case when s.is_discreet and not v_discret then null else a.series_index end,
           -- « followup » (pris depuis un module de soins) : « agenda » pour un rendez-vous
           -- discret masqué.
           case when s.is_discreet and not v_discret and a.source = 'followup' then 'agenda'
                else a.source end,
           case when s.is_discreet and not v_discret then null else a.source_ref end,
           a.holiday_confirmed, a.visit_id, v.ticket_number,
           case when s.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical and (not s.is_discreet or v_discret) then n.note end,
           a.closed_automatically
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types_seen(p_org_id, v_discret) s on s.type_id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
      left join (public.memberships m join public.profiles pr on pr.id = m.user_id)
        on m.id = a.practitioner_membership_id
     where a.org_id = p_org_id and a.deleted_at is null
       and a.local_date between p_from and p_to
       and (p_practitioner_id is null or a.practitioner_membership_id = p_practitioner_id)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;

create or replace function public.list_patient_appointments(p_patient_id uuid)
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
  note                text,
  closed_automatically boolean)
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
           s.seen_type_id, s.seen_label,
           s.is_discreet and v_discret,
           case when a.practitioner_membership_id is not null and pr.id is not null
                then coalesce(nullif(btrim(pr.full_name), ''), 'Membre sans nom') end,
           case when s.is_discreet and not v_discret then null else a.series_id end,
           case when s.is_discreet and not v_discret then null else a.series_index end,
           case when s.is_discreet and not v_discret and a.source = 'followup' then 'agenda'
                else a.source end,
           v.ticket_number,
           case when s.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical and (not s.is_discreet or v_discret) then n.note end,
           a.closed_automatically
      from public.appointments a
      join public.appointment_types_seen(v_org, v_discret) s on s.type_id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
      left join (public.memberships m join public.profiles pr on pr.id = m.user_id)
        on m.id = a.practitioner_membership_id
     where a.patient_id = p_patient_id and a.org_id = v_org and a.deleted_at is null
     order by a.starts_at desc;
end;
$$;

create or replace function public.appointments_to_remind(p_org_id uuid, p_date date default null)
returns table (
  appointment_id        uuid,
  patient_id            uuid,
  patient_last_name     text,
  patient_first_name    text,
  patient_sex           text,
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
    select a.id, a.patient_id, p.last_name, p.first_name, p.sex::text, p.file_number, p.phone,
           p.phone_owner, p.whatsapp_consent, p.preferred_language, a.starts_at, a.status,
           s.seen_label,
           s.is_discreet and v_discret, public.appointment_patient_label(a.id),
           case when a.practitioner_membership_id is not null and pr.id is not null
                then coalesce(nullif(btrim(pr.full_name), ''), 'Membre sans nom') end,
           a.reminder_sent_at, a.reminder_done_at,
           case when a.reminder_done_by is not null
                then coalesce((select nullif(btrim(pf.full_name), '') from public.profiles pf
                                where pf.id = a.reminder_done_by), 'Membre sans nom') end
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types_seen(p_org_id, v_discret) s on s.type_id = a.appointment_type_id
      left join (public.memberships m join public.profiles pr on pr.id = m.user_id)
        on m.id = a.practitioner_membership_id
     where a.org_id = p_org_id and a.deleted_at is null
       and a.status in ('scheduled', 'confirmed')
       and a.local_date = coalesce(p_date, public.org_local_date(p_org_id) + 1)
       and public.appointment_reminder_allowed(a.id)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;


-- =============================================================================
-- 3. Droits d'accès
-- =============================================================================

-- Interne : jamais appelée par le client (Supabase donne d'office le droit d'exécution à
-- authenticated). Les trois listes gardent leurs droits (create or replace).
revoke execute on function public.appointment_types_seen(uuid, boolean, uuid)
from public, anon, authenticated;
