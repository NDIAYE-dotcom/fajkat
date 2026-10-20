-- =============================================================================
-- Étape 14, partie D (suite) : qualité du praticien ; rendez-vous d'un jour passé
-- -----------------------------------------------------------------------------
-- 1. prescription_prescriber_titles : qualité de qui a prescrit (« Fonction » de sa fiche
--    du personnel, sinon titre de son profil), imprimée sous son nom. staff_files n'est lu
--    que par l'owner, l'admin et la personne elle-même : la fonction la rend aux seuls
--    soignants qui impriment (encounters_can_write).
-- 2. Rendez-vous d'un jour fini encore « prévu » ou « confirmé » : clos par la base,
--    marqués closed_automatically (comme les passages, étape 14 correctif) :
--      - patient venu ce jour-là dans la structure (passage, ou consultation commencée) :
--        « Venu » (arrived), relié au passage s'il n'y en a qu'un ;
--      - sinon : « Non venu » (no_show).
--    Un passage « Parti sans être vu » noté par l'équipe ne compte pas comme venu ; un
--    passage clos automatiquement (oublié en salle d'attente) compte.
--    Jamais le jour même. Un rendez-vous clos une fois (auto_closed_at) ne l'est jamais
--    plus, même remis à « prévu » à la main. Un changement de statut à la main retire la
--    marque « automatique ».
--    Quand : à la première arrivée du jour (même déclencheur que les passages), à
--    l'ouverture de l'agenda et de l'onglet Rendez-vous de la fiche
--    (close_past_appointments : membres de la structure, jours finis seulement, rejouable
--    sans effet de plus), et une fois à l'application de cette migration.
--    Rendez-vous discrets : même règle et même statut pour tous ; la clôture n'écrit ni ne
--    renvoie rien qui dépende du vrai type.
-- 3. Lectures : closed_automatically ajouté à list_appointments et
--    list_patient_appointments ; « no_show_auto » / « arrived_auto » dans la chronologie.
-- =============================================================================


-- =============================================================================
-- 1. Qualité du praticien
-- =============================================================================

create function public.prescription_prescriber_titles(p_encounter_id uuid)
returns table (prescription_id uuid, prescriber_title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  -- Mêmes droits que l'impression : soignants qui rédigent.
  if not found or not public.encounters_can_write(v_enc.org_id) then
    raise exception 'Ordonnance introuvable.' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(nullif(btrim(f.job_title), ''), nullif(btrim(pr.title), ''))
      from public.prescriptions p
      left join public.memberships m on m.org_id = p.org_id and m.user_id = p.prescribed_by
      left join public.staff_files f on f.membership_id = m.id and f.deleted_at is null
      left join public.profiles pr on pr.id = p.prescribed_by
     where p.encounter_id = v_enc.id;
end;
$$;


-- =============================================================================
-- 2. Rendez-vous d'un jour passé
-- =============================================================================

alter table public.appointments
  add column closed_automatically boolean not null default false,
  add column auto_closed_at timestamptz;

comment on column public.appointments.closed_automatically is
  'Statut actuel (« Venu » ou « Non venu ») posé par la base après la journée ; faux dès un changement à la main.';
comment on column public.appointments.auto_closed_at is
  'Date de la clôture automatique : un rendez-vous clos une fois ne l''est jamais plus.';

-- Rendez-vous encore à clore : appointments_close_past est appelée à chaque arrivée et à
-- chaque ouverture de l'agenda ; l'index ne garde que les lignes qu'elle peut toucher.
create index appointments_to_close_idx on public.appointments (org_id, local_date)
  where deleted_at is null and status in ('scheduled', 'confirmed') and auto_closed_at is null;

-- Changement de statut à la main : la marque « automatique » tombe. Seule la clôture pose
-- la variable locale fajkat.closing_appointments.
create function public.appointments_auto_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('fajkat.closing_appointments', true), '') <> 'on' then
    new.closed_automatically := false;
  end if;
  return new;
end;
$$;

create trigger appointments_auto_flag before update on public.appointments
  for each row execute function public.appointments_auto_flag();

-- Clôture des rendez-vous des jours finis d'une structure (interne, sans contrôle de
-- droits). Renvoie le nombre de rendez-vous clos.
create function public.appointments_close_past(p_org_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz  text;
  v_auj date;
  v_n   integer;
begin
  select timezone into v_tz from public.organizations where id = p_org_id;
  if v_tz is null then
    return 0;
  end if;
  v_auj := public.org_local_date(p_org_id);
  perform set_config('fajkat.closing_appointments', 'on', true);

  with cibles as (
    select a.id,
           pa.nb, pa.premier, pa.seul,
           (select min(e.started_at) from public.encounters e
             where e.org_id = a.org_id and e.patient_id = a.patient_id
               and e.deleted_at is null
               and (e.started_at at time zone v_tz)::date = a.local_date) as consultation
      from public.appointments a
      -- Passages du patient ce jour-là, sauf « Parti sans être vu » noté par l'équipe.
      left join lateral (
        select count(*) as nb, min(v.arrived_at) as premier,
               case when count(*) = 1 then min(v.id::text)::uuid end as seul
          from public.visits v
         where v.org_id = a.org_id and v.patient_id = a.patient_id
           and v.visit_date = a.local_date and v.deleted_at is null
           and not (v.status = 'left' and not v.closed_automatically)
      ) pa on true
     where a.org_id = p_org_id and a.deleted_at is null
       and a.status in ('scheduled', 'confirmed')
       and a.local_date < v_auj
       and a.auto_closed_at is null
  )
  update public.appointments a
     set status = case when c.nb > 0 or c.consultation is not null then 'arrived' else 'no_show' end,
         arrived_at = case when c.nb > 0 or c.consultation is not null
                           then coalesce(c.premier, c.consultation) else a.arrived_at end,
         visit_id = case when c.nb = 1 then coalesce(a.visit_id, c.seul) else a.visit_id end,
         status_changed_at = now(),
         closed_automatically = true,
         auto_closed_at = now()
    from cibles c
   where a.id = c.id
     -- Revérifié sur la ligne verrouillée : deux clôtures simultanées ne font rien de plus.
     and a.status in ('scheduled', 'confirmed') and a.auto_closed_at is null;
  get diagnostics v_n = row_count;

  perform set_config('fajkat.closing_appointments', '', true);
  return v_n;
end;
$$;

-- Appelée par l'application à l'ouverture de l'agenda ou de l'onglet Rendez-vous : membres
-- actifs de la structure seulement ; jours finis seulement ; rejouable sans effet de plus.
create function public.close_past_appointments(p_org_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not public.is_member(p_org_id) then
    raise exception 'Structure introuvable.' using errcode = '42501';
  end if;
  return public.appointments_close_past(p_org_id);
end;
$$;

-- Première arrivée du jour : passages, puis rendez-vous des jours finis (dans cet ordre,
-- les passages oubliés sont déjà clos quand on regarde qui est venu).
create or replace function public.visits_close_past()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.close_past_visits(new.org_id);
  perform public.appointments_close_past(new.org_id);
  return new;
end;
$$;

-- Rendez-vous des jours passés déjà en attente.
select public.appointments_close_past(id) from public.organizations;


-- =============================================================================
-- 3. Lectures : marque « automatique »
-- =============================================================================

-- Identiques à l'étape 14 (partie C), plus la colonne closed_automatically.
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
           -- « followup » (pris depuis un module de soins) : « agenda » pour un rendez-vous
           -- discret masqué.
           case when t.is_discreet and not v_discret and a.source = 'followup' then 'agenda'
                else a.source end,
           case when t.is_discreet and not v_discret then null else a.source_ref end,
           a.holiday_confirmed, a.visit_id, v.ticket_number,
           case when t.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical and (not t.is_discreet or v_discret) then n.note end,
           a.closed_automatically
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


drop function public.list_patient_appointments(uuid);
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
           public.appointment_type_id_for_viewer(a.appointment_type_id),
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           t.is_discreet and v_discret,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           case when t.is_discreet and not v_discret then null else a.series_id end,
           case when t.is_discreet and not v_discret then null else a.series_index end,
           case when t.is_discreet and not v_discret and a.source = 'followup' then 'agenda'
                else a.source end,
           v.ticket_number,
           case when t.is_discreet and not v_discret then null else a.cancel_reason end,
           case when v_medical and (not t.is_discreet or v_discret) then n.note end,
           a.closed_automatically
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
     where a.patient_id = p_patient_id and a.org_id = v_org and a.deleted_at is null
     order by a.starts_at desc;
end;
$$;


-- Identique à l'étape 14 (correctif), sauf le statut d'un rendez-vous clos
-- automatiquement (« no_show_auto », « arrived_auto »).
create or replace function public.patient_timeline(
  p_patient_id uuid,
  p_kinds      text[] default null,
  p_before_at  timestamptz default null,
  p_before_id  uuid default null,
  p_limit      integer default 20)
returns table (kind text, item_id uuid, encounter_id uuid, occurred_at timestamptz,
               title text, detail text, status text, is_sensitive boolean, author_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org      uuid;
  v_medical  boolean;
  v_sensible boolean;
  v_file     boolean;
  v_rdv      boolean;
  v_limite   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.patients_can_read(v_org) then
    raise exception 'Dossier introuvable.' using errcode = '42501';
  end if;
  v_medical  := public.encounters_can_read(v_org);
  v_sensible := public.encounters_can_write(v_org);
  v_file     := public.queue_can_read(v_org);
  v_rdv      := public.appointments_can_read(v_org);

  return query
  with visibles as (
    select e.* from public.encounters e
     where v_medical and e.patient_id = p_patient_id and e.org_id = v_org
       and e.deleted_at is null
       and (e.status = 'validated' or e.author_id = auth.uid())
       and (v_sensible or not e.is_sensitive)
  ),
  lignes as (
    -- Passages : numéro et file, jamais le motif ni les constantes.
    select 'visit'::text, v.id, null::uuid, v.arrived_at,
           'Passage ' || v.ticket_number,
           case when not public.patients_can_read_sensitive(v_org)
                     and public.appointment_label_is_discreet(q.label)
                then 'Consultation' else q.label end,
           -- Clôture automatique (passage oublié d'un jour passé) : statut à part.
           case when v.closed_automatically then 'closed_auto' else v.status end,
           false, null::text
      from public.visits v
      join public.queue_services q on q.id = v.queue_service_id
     where v_file and v.patient_id = p_patient_id and v.org_id = v_org and v.deleted_at is null
    union all
    -- Rendez-vous : type (« Consultation » pour un type discret hors des soignants habilités),
    -- praticien ; jamais la note ni le motif d'annulation.
    select 'appointment', a.id, null, a.starts_at,
           case when t.is_discreet and not public.appointments_can_see_discreet(v_org)
                then 'Consultation' else t.label end,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           -- Clos automatiquement : « no_show_auto » / « arrived_auto », pour tous les
           -- rôles (rien ne dépend du vrai type).
           case when a.closed_automatically then a.status || '_auto' else a.status end,
           false, null
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
     where v_rdv and a.patient_id = p_patient_id and a.org_id = v_org and a.deleted_at is null
    union all
    select 'encounter', e.id, e.id, coalesce(e.validated_at, e.started_at), t.label,
           case when e.is_sensitive then null
                else (select d.label from public.diagnoses d
                       where d.encounter_id = e.id and d.rank = 'primary') end,
           e.status, e.is_sensitive, public.user_display_name(coalesce(e.validated_by, e.author_id))
      from visibles e join public.encounter_types t on t.id = e.encounter_type_id
    union all
    select 'prescription', p.id, e.id, p.prescribed_at, 'Ordonnance',
           (select count(*) || ' médicament' || case when count(*) > 1 then 's' else '' end
              from public.prescription_items i where i.prescription_id = p.id),
           null, e.is_sensitive, public.user_display_name(p.prescribed_by)
      from public.prescriptions p join visibles e on e.id = p.encounter_id
    union all
    select 'referral', r.id, e.id, r.referred_at, 'Référence vers ' || r.destination_name,
           case when r.counter_referral is not null then 'Contre-référence reçue' end,
           case when r.counter_referral is not null then 'returned' else 'sent' end,
           e.is_sensitive, public.user_display_name(r.referred_by)
      from public.referrals r join visibles e on e.id = r.encounter_id
    union all
    select 'certificate', c.id, e.id, c.issued_at, c.title,
           case when c.rest_days is not null then c.rest_days || ' jour(s) de repos' end,
           null, e.is_sensitive, public.user_display_name(c.issued_by)
      from public.certificates c join visibles e on e.id = c.encounter_id
  )
  select x.* from lignes x(kind, item_id, encounter_id, occurred_at, title, detail, status,
                           is_sensitive, author_name)
   where (p_kinds is null or x.kind = any (p_kinds))
     and (p_before_at is null
          or (x.occurred_at, x.item_id)
             < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by x.occurred_at desc, x.item_id desc
   limit v_limite;
end;
$$;


-- =============================================================================
-- 4. Droits
-- =============================================================================

revoke execute on function
  public.prescription_prescriber_titles(uuid), public.close_past_appointments(uuid),
  public.list_appointments(uuid, date, date, uuid), public.list_patient_appointments(uuid)
from public, anon;

grant execute on function
  public.prescription_prescriber_titles(uuid), public.close_past_appointments(uuid),
  public.list_appointments(uuid, date, date, uuid), public.list_patient_appointments(uuid)
to authenticated;

-- Fonctions internes : jamais appelées par le client.
revoke execute on function public.appointments_close_past(uuid), public.appointments_auto_flag()
  from public, anon, authenticated;
