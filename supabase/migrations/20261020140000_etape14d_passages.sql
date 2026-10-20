-- =============================================================================
-- Étape 14 (correctif) : passages clos à la validation de la consultation, et passages
-- d'un jour passé clos d'eux-mêmes
-- -----------------------------------------------------------------------------
-- Étape 12 : un passage va de « En attente » / « Constantes » / « En consultation » à
-- « Terminé » (done) ou « Parti sans être vu » (left), seulement à la main (move_visit).
-- Il n'existe pas de statut « orienté » (une référence est un document de la consultation).
--   1. Consultation validée, liée à un passage toujours « En consultation » sans changement
--      de statut ni de file depuis le début de cette consultation : le passage passe à
--      « Terminé » (heure de fin : la validation). Il quitte le tableau et l'écran d'appel.
--      Passage déplacé entre-temps (remis en attente, orienté vers une autre file) : rien
--      ne change. Un changement de file remet status_changed_at à l'heure du changement.
--   2. Passage encore ouvert d'un jour passé : clos à la première arrivée enregistrée dans
--      la structure (trigger sur visits), et une fois pour tous à l'application de cette
--      migration. « Terminé » s'il a été appelé en consultation ou si une consultation
--      validée y est liée ; sinon « Parti sans être vu ». Heure de fin : la fin du jour du
--      passage, dans le fuseau de la structure (l'heure réelle n'est pas connue). Marque
--      closed_automatically : à l'écran « Clos automatiquement », et les rapports le
--      distinguent d'un vrai départ.
-- Aucun passage n'est supprimé ; chaque changement passe par le journal (visits_audit).
-- =============================================================================

alter table public.visits
  add column closed_automatically boolean not null default false;
comment on column public.visits.closed_automatically is
  'Passage clos par close_past_visits (oublié un jour passé), pas par un soignant ni l''accueil.';

-- Recherche des passages ouverts (close_past_visits, à chaque arrivée).
create index visits_open_idx on public.visits (org_id, visit_date)
  where deleted_at is null and status in ('waiting', 'vitals', 'consultation');

-- Changement de file d'un passage (aucune fonction ne le fait aujourd'hui) : compté comme
-- un changement de statut.
create function public.visits_queue_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.queue_service_id is distinct from old.queue_service_id then
    -- Heure réelle du changement (pas celle du début de la transaction).
    new.status_changed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger visits_queue_change
  before update of queue_service_id on public.visits
  for each row execute function public.visits_queue_change();


-- 1. Validation d'une consultation -------------------------------------------------------

create function public.encounters_close_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'validated' and old.status is distinct from 'validated'
     and new.visit_id is not null then
    update public.visits v
       set status = 'done', finished_at = now(), status_changed_at = now()
     where v.id = new.visit_id and v.deleted_at is null
       and v.status = 'consultation' and v.status_changed_at <= new.started_at;
  end if;
  return new;
end;
$$;

create trigger encounters_close_visit
  after update of status on public.encounters
  for each row execute function public.encounters_close_visit();


-- 2. Passages ouverts d'un jour passé ---------------------------------------------------

create function public.close_past_visits(p_org_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_auj  date;
  v_n    integer;
begin
  select timezone into v_tz from public.organizations where id = p_org_id;
  if v_tz is null then
    return 0;
  end if;
  v_auj := public.org_local_date(p_org_id);
  with clos as (
    select v.id,
           case when v.status = 'consultation' or v.consultation_at is not null
                     or exists (select 1 from public.encounters e
                                 where e.visit_id = v.id and e.status = 'validated'
                                   and e.deleted_at is null)
                then 'done' else 'left' end as statut,
           ((v.visit_date + 1)::timestamp at time zone v_tz) - interval '1 second' as fin
      from public.visits v
     where v.org_id = p_org_id and v.deleted_at is null
       and v.visit_date < v_auj
       and v.status in ('waiting', 'vitals', 'consultation')
  )
  update public.visits v
     set status = c.statut,
         finished_at = case when c.statut = 'done' then c.fin else v.finished_at end,
         left_at = case when c.statut = 'left' then c.fin else v.left_at end,
         status_changed_at = now(),
         closed_automatically = true
    from clos c
   where v.id = c.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Avant chaque nouvelle arrivée : la file du jour repart propre.
create function public.visits_close_past()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.close_past_visits(new.org_id);
  return new;
end;
$$;

create trigger visits_close_past
  before insert on public.visits
  for each row execute function public.visits_close_past();

-- Passages déjà restés ouverts.
select public.close_past_visits(id) from public.organizations;
-- Passages du jour dont la consultation est déjà validée : même règle qu'au 1.
update public.visits v
   set status = 'done', finished_at = e.validated_at, status_changed_at = now()
  from public.encounters e
 where e.visit_id = v.id and e.status = 'validated' and e.deleted_at is null
   and v.deleted_at is null and v.status = 'consultation'
   and v.status_changed_at <= e.started_at;


-- 3. Chronologie : passage clos automatiquement ------------------------------------------

-- Identique à l'étape 14 (partie C), sauf le statut d'un passage clos automatiquement
-- (« closed_auto »).
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
           a.status, false, null
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



-- 4. Droits : fonctions internes ----------------------------------------------------------

revoke execute on function public.encounters_close_visit(), public.close_past_visits(uuid),
  public.visits_close_past(), public.visits_queue_change()
from public, anon, authenticated;
