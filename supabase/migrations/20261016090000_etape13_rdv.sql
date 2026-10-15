-- =============================================================================
-- Étape 13 — Rendez-vous et agenda (features « rendez_vous » et
--            « agenda_multi_praticiens »)
-- -----------------------------------------------------------------------------
-- 1. Aides             : droits (lecture, écriture, note réservée aux soignants,
--                        paramètres), praticien, nom du type montré au patient.
-- 2. Référentiels      : appointment_type_templates (types proposés par offre),
--                        holiday_templates (jours fériés par pays : fêtes fixes datées,
--                        fêtes religieuses sans date, saisies chaque année).
-- 3. Paramètres        : appointment_types (durée, type « discret », récurrence proposée,
--                        file d'attente à l'arrivée), appointment_sessions (séances et
--                        capacité), appointment_breaks (pauses), holidays (jours fériés
--                        de la structure). Horaires d'ouverture : settings.opening_hours
--                        (étape 7).
-- 4. appointments      : rendez-vous, statuts scheduled / confirmed / arrived / no_show /
--                        cancelled / rescheduled. Un report crée un nouveau rendez-vous
--                        et garde l'ancien (rescheduled_to_id). La note vit à part
--                        (appointment_notes) : soignants seulement.
-- 5. Contrôles         : séance pleine refusée ; jour férié, jour fermé, hors horaires,
--                        pause, praticien en congé, créneau déjà pris, autre rendez-vous
--                        du patient le même jour : avertissements à confirmer.
-- 6. RPC               : check_appointment, book_appointment (séries comprises),
--                        set_appointment_status, reschedule_appointment(s),
--                        arrive_appointment (file d'attente en un geste), list_appointments,
--                        appointments_to_remind, patient_appointment_stats,
--                        schedule_followup, add_fixed_holidays.
-- 7. Fusion de dossiers : les rendez-vous suivent le dossier gardé.
--
-- Type « discret » (planification familiale, dépistage…) : tout ce qui est destiné au
-- patient (rappels WhatsApp, page publique, impression remise) n'affiche que
-- « votre rendez-vous au poste de santé / à la clinique » (appointment_patient_label) :
-- le téléphone est souvent partagé par la famille.
--
-- Qui fait quoi :
--   agenda (lecture, prise, statuts, report, arrivée) : owner, admin, médecin,
--                         sage-femme, infirmier, aide-soignant, accueil, caissier ;
--   note du rendez-vous  : saisie par tous ceux-là, lue par les soignants seulement ;
--   paramètres, jours fériés : owner et admin.
--
-- Les refus métier lèvent le code 22023 avec un message en français, affiché tel quel.
-- Les avertissements à confirmer lèvent 22023 avec le hint « confirmation_required ».
-- =============================================================================


-- =============================================================================
-- 1. Aides
-- =============================================================================

create function public.appointments_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'rendez_vous')
     and public.has_role(p_org_id, array[
           'owner', 'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
           'accueil', 'caissier']);
$$;

create function public.appointments_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.appointments_can_read(p_org_id) and public.patients_org_writable(p_org_id);
$$;

-- Note du rendez-vous : peut révéler un motif médical.
create function public.appointments_can_medical(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'rendez_vous')
     and public.patients_can_read_medical(p_org_id);
$$;

create function public.appointments_can_manage(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'rendez_vous')
     and public.has_role(p_org_id, array['owner', 'admin']);
$$;

create function public.appointments_can_configure(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.appointments_can_manage(p_org_id) and public.patients_org_writable(p_org_id);
$$;

-- Droits de l'utilisateur connecté, pour le front (affichage seulement : la base décide).
create function public.appointment_permissions(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'read',               public.appointments_can_read(p_org_id),
    'write',              public.appointments_can_write(p_org_id),
    'medical',            public.appointments_can_medical(p_org_id),
    'manage',             public.appointments_can_manage(p_org_id),
    'multi_practitioner', public.org_has_feature(p_org_id, 'agenda_multi_praticiens'),
    'queue',              public.org_has_feature(p_org_id, 'file_attente')
                          and public.queue_can_write(p_org_id));
$$;

-- Praticien : membre actif au rôle soignant, ou owner / admin qui exerce (is_clinician).
create function public.is_practitioner(p_org_id uuid, p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.id = p_membership_id
       and m.org_id = p_org_id
       and m.is_active
       and m.deleted_at is null
       and (m.role in ('medecin', 'sage_femme', 'infirmier', 'aide_soignant')
            or (m.role in ('owner', 'admin') and m.is_clinician)));
$$;

create function public.membership_display_name(p_membership_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.full_name), ''), 'Membre sans nom')
    from public.memberships m
    join public.profiles p on p.id = m.user_id
   where m.id = p_membership_id;
$$;

-- Jour de la semaine ISO (1 = lundi) -> clé de settings.opening_hours (étape 7).
create function public.weekday_key(p_isodow integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])[p_isodow];
$$;


-- =============================================================================
-- 2. Référentiels
-- =============================================================================

-- Types proposés à la création d'une structure. queue_service_code : service de file
-- (queue_service_templates.code) où entre le patient au bouton « Arrivé ».
create table public.appointment_type_templates (
  plan_code          text not null references public.plans (code) on update cascade,
  code               text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label              text not null,
  duration_minutes   smallint not null check (duration_minutes between 5 and 480),
  is_discreet        boolean not null default false,
  recurrence_months  smallint check (recurrence_months between 1 and 24),
  queue_service_code text,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (plan_code, code)
);

comment on table public.appointment_type_templates is
  'Types de rendez-vous proposés à la création d''une structure, par offre.';

create trigger appointment_type_templates_set_updated_at
  before update on public.appointment_type_templates
  for each row execute function public.set_updated_at();

insert into public.appointment_type_templates
  (plan_code, code, label, duration_minutes, is_discreet, recurrence_months, queue_service_code,
   sort_order)
values
  ('poste_sante', 'consultation', 'Consultation',              15, false, null, 'consultation', 10),
  ('poste_sante', 'cpn',          'Consultation prénatale',    30, false, null, 'cpn',          20),
  ('poste_sante', 'vaccination',  'Vaccination',               10, false, null, 'vaccination',  30),
  ('poste_sante', 'pf',           'Planification familiale',   20, true,  3,    'pf',           40),
  ('poste_sante', 'depistage',    'Dépistage',                 20, true,  null, 'consultation', 50),
  ('poste_sante', 'soins',        'Pansement et soins',        15, false, null, 'soins',        60),
  ('clinique',    'consultation', 'Consultation',              20, false, null, 'consultation', 10),
  ('clinique',    'controle',     'Consultation de contrôle',  15, false, null, 'consultation', 20),
  ('clinique',    'cpn',          'Consultation prénatale',    30, false, null, 'cpn',          30),
  ('clinique',    'vaccination',  'Vaccination',               10, false, null, 'vaccination',  40),
  ('clinique',    'pf',           'Planification familiale',   20, true,  3,    'consultation', 50),
  ('clinique',    'depistage',    'Dépistage',                 20, true,  null, 'laboratoire',  60),
  ('clinique',    'imagerie',     'Imagerie',                  20, false, null, 'imagerie',     70)
on conflict (plan_code, code) do nothing;

-- Jours fériés par pays. Fête fixe : mois et jour ; fête à date variable (religieuse,
-- lunaire ou liée à Pâques) : sans date, saisie chaque année par la structure.
create table public.holiday_templates (
  country_code text not null references public.countries (code),
  code         text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label        text not null,
  fixed_month  smallint check (fixed_month between 1 and 12),
  fixed_day    smallint check (fixed_day between 1 and 31),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (country_code, code),
  check ((fixed_month is null) = (fixed_day is null))
);

comment on table public.holiday_templates is
  'Jours fériés proposés par pays (liste indicative, modifiable). Sans date : fête variable.';

create trigger holiday_templates_set_updated_at before update on public.holiday_templates
  for each row execute function public.set_updated_at();

insert into public.holiday_templates (country_code, code, label, fixed_month, fixed_day, sort_order)
values
  ('SN', 'nouvel_an',        'Jour de l''an',                        1,    1,    10),
  ('SN', 'independance',     'Fête de l''Indépendance',              4,    4,    20),
  ('SN', 'fete_travail',     'Fête du Travail',                      5,    1,    30),
  ('SN', 'assomption',       'Assomption',                           8,    15,   40),
  ('SN', 'toussaint',        'Toussaint',                            11,   1,    50),
  ('SN', 'noel',             'Noël',                                 12,   25,   60),
  ('SN', 'tamkharit',        'Tamkharit (Achoura)',                  null, null, 110),
  ('SN', 'korite',           'Korité (Aïd el-Fitr)',                 null, null, 120),
  ('SN', 'tabaski',          'Tabaski (Aïd el-Kébir)',               null, null, 130),
  ('SN', 'gamou',            'Gamou (Maouloud)',                     null, null, 140),
  ('SN', 'magal',            'Grand Magal de Touba',                 null, null, 150),
  ('SN', 'lundi_paques',     'Lundi de Pâques',                      null, null, 160),
  ('SN', 'ascension',        'Ascension',                            null, null, 170),
  ('SN', 'lundi_pentecote',  'Lundi de Pentecôte',                   null, null, 180)
on conflict (country_code, code) do nothing;


-- =============================================================================
-- 3. Paramètres de la structure
-- =============================================================================

create table public.appointment_types (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  template_code     text,
  label             text not null check (char_length(btrim(label)) between 2 and 60),
  duration_minutes  smallint not null check (duration_minutes between 5 and 480),
  -- Discret : jamais nommé dans un message ou un document remis au patient.
  is_discreet       boolean not null default false,
  -- Récurrence proposée à la prise (planification familiale : tous les 3 mois).
  recurrence_months smallint check (recurrence_months between 1 and 24),
  -- Service de la file d'attente où entre le patient au bouton « Arrivé ».
  queue_service_id  uuid,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,
  constraint appointment_types_id_org_unique unique (id, org_id),
  foreign key (queue_service_id, org_id) references public.queue_services (id, org_id)
);

create unique index appointment_types_org_label_unique
  on public.appointment_types (org_id, lower(btrim(label))) where deleted_at is null;

comment on table public.appointment_types is
  'Types de rendez-vous de la structure : durée, discrétion, récurrence, file à l''arrivée.';

create trigger appointment_types_set_updated_at before update on public.appointment_types
  for each row execute function public.set_updated_at();
create trigger appointment_types_audit after insert or update or delete on public.appointment_types
  for each row execute function public.audit_trigger();

-- Un type nouveau dont le libellé évoque la PF, un dépistage, le VIH ou une IST est
-- discret d'office ; owner ou admin peut ensuite le modifier.
create function public.appointment_types_discreet_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.label ~* '(d[ée]pistage|planification|contracep|\mpf\M|\mvih\M|\mptme\M|\mist\M|\msida\M)' then
    new.is_discreet := true;
  end if;
  return new;
end;
$$;

create trigger appointment_types_discreet_default
  before insert on public.appointment_types
  for each row execute function public.appointment_types_discreet_default();

-- Séance : plage d'un jour de la semaine réservée à un type, avec une capacité
-- (exemple : 40 enfants le mardi matin pour la vaccination).
create table public.appointment_sessions (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.organizations (id),
  appointment_type_id        uuid not null,
  -- Jour ISO : 1 = lundi … 7 = dimanche.
  weekday                    smallint not null check (weekday between 1 and 7),
  start_time                 time not null,
  end_time                   time not null,
  -- null : sans limite.
  capacity                   integer check (capacity between 1 and 1000),
  practitioner_membership_id uuid,
  label                      text check (char_length(btrim(label)) between 2 and 60),
  is_active                  boolean not null default true,
  sort_order                 integer not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at                 timestamptz,
  constraint appointment_sessions_id_org_unique unique (id, org_id),
  constraint appointment_sessions_times_check check (end_time > start_time),
  foreign key (appointment_type_id, org_id) references public.appointment_types (id, org_id),
  foreign key (practitioner_membership_id, org_id) references public.memberships (id, org_id)
);

create index appointment_sessions_type_idx
  on public.appointment_sessions (appointment_type_id, weekday) where deleted_at is null;

comment on table public.appointment_sessions is
  'Séances hebdomadaires d''un type de rendez-vous, avec leur capacité.';

create trigger appointment_sessions_set_updated_at before update on public.appointment_sessions
  for each row execute function public.set_updated_at();
create trigger appointment_sessions_audit
  after insert or update or delete on public.appointment_sessions
  for each row execute function public.audit_trigger();

create table public.appointment_breaks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  -- null : tous les jours.
  weekday     smallint check (weekday between 1 and 7),
  start_time  time not null,
  end_time    time not null,
  label       text not null default 'Pause' check (char_length(btrim(label)) between 2 and 60),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at  timestamptz,
  constraint appointment_breaks_times_check check (end_time > start_time)
);

create index appointment_breaks_org_idx on public.appointment_breaks (org_id) where deleted_at is null;

comment on table public.appointment_breaks is 'Pauses de la structure (aucun rendez-vous proposé).';

create trigger appointment_breaks_set_updated_at before update on public.appointment_breaks
  for each row execute function public.set_updated_at();
create trigger appointment_breaks_audit after insert or update or delete on public.appointment_breaks
  for each row execute function public.audit_trigger();

create table public.holidays (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  holiday_date  date not null,
  label         text not null check (char_length(btrim(label)) between 2 and 80),
  template_code text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz
);

create unique index holidays_org_date_unique
  on public.holidays (org_id, holiday_date) where deleted_at is null;

comment on table public.holidays is
  'Jours fériés de la structure. Les fêtes à date variable sont saisies chaque année.';

create trigger holidays_set_updated_at before update on public.holidays
  for each row execute function public.set_updated_at();
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function public.audit_trigger();

-- Fêtes fixes d'une année, d'après le pays de la structure. Rejouable.
create function public.holidays_add_fixed(p_org_id uuid, p_year integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nombre integer;
begin
  insert into public.holidays (org_id, holiday_date, label, template_code, created_by)
  select p_org_id, make_date(p_year, t.fixed_month, t.fixed_day), t.label, t.code, auth.uid()
    from public.holiday_templates t
    join public.organizations o on o.country_code = t.country_code
   where o.id = p_org_id and t.is_active and t.fixed_month is not null
     and not exists (select 1 from public.holidays h
                      where h.org_id = p_org_id and h.deleted_at is null
                        and h.holiday_date = make_date(p_year, t.fixed_month, t.fixed_day));
  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

create function public.add_fixed_holidays(p_org_id uuid, p_year integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.appointments_can_manage(p_org_id) then
    raise exception 'Seuls l''owner et l''admin gèrent les jours fériés.' using errcode = '42501';
  end if;
  if not public.appointments_can_configure(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Année invalide.' using errcode = '22023';
  end if;
  return public.holidays_add_fixed(p_org_id, p_year);
end;
$$;

-- Pré-remplissage, rejouable : rien n'est ajouté à une structure déjà paramétrée.
create function public.seed_appointment_settings(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_annee integer;
begin
  select type, extract(year from now() at time zone timezone)::integer
    into v_type, v_annee
    from public.organizations where id = p_org_id;

  if not exists (select 1 from public.appointment_types where org_id = p_org_id) then
    insert into public.appointment_types (org_id, template_code, label, duration_minutes,
                                          is_discreet, recurrence_months, queue_service_id,
                                          sort_order, created_by)
    select p_org_id, t.code, t.label, t.duration_minutes, t.is_discreet, t.recurrence_months,
           (select q.id from public.queue_services q
             where q.org_id = p_org_id and q.deleted_at is null
               and q.template_code = t.queue_service_code
             limit 1),
           t.sort_order, null
      from public.appointment_type_templates t
     where t.plan_code = v_type and t.is_active;
  end if;

  if not exists (select 1 from public.holidays where org_id = p_org_id) then
    perform public.holidays_add_fixed(p_org_id, v_annee);
    perform public.holidays_add_fixed(p_org_id, v_annee + 1);
  end if;
end;
$$;

-- Après le pré-remplissage de la file (étape 12) : les types reprennent ses services.
-- Les triggers d'une même table s'exécutent par ordre alphabétique : « organizations_seed_q… »
-- (file) passe avant « organizations_seed_r… » (rendez-vous).
create function public.organizations_seed_appointment_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_appointment_settings(new.id);
  return null;
end;
$$;

create trigger organizations_seed_rdv_settings
  after insert on public.organizations
  for each row execute function public.organizations_seed_appointment_settings();

select public.seed_appointment_settings(o.id) from public.organizations o;


-- =============================================================================
-- 4. Rendez-vous
-- =============================================================================

-- Le bouton « Arrivé » crée un passage dont la source est le rendez-vous.
alter table public.visits drop constraint visits_source_check;
alter table public.visits add constraint visits_source_check
  check (source in ('reception', 'consultation_ticket', 'appointment'));

create table public.appointments (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.organizations (id),
  patient_id                 uuid not null,
  appointment_type_id        uuid not null,
  practitioner_membership_id uuid,
  session_id                 uuid,
  starts_at                  timestamptz not null,
  ends_at                    timestamptz not null,
  -- Jour du rendez-vous dans le fuseau de la structure (fixé par le serveur).
  local_date                 date not null,
  status                     text not null default 'scheduled',
  status_changed_at          timestamptz not null default now(),
  confirmed_at               timestamptz,
  arrived_at                 timestamptz,
  cancelled_at               timestamptz,
  cancel_reason              text check (char_length(cancel_reason) <= 300),
  -- Rendez-vous récurrents : même series_id, numérotés à partir de 1.
  series_id                  uuid,
  series_index               smallint check (series_index between 1 and 24),
  -- agenda / patient_file : saisie ; followup : schedule_followup ; reschedule : report.
  source                     text not null default 'agenda',
  -- Module qui a créé le rendez-vous (« cpn », « vaccination »…), pour schedule_followup.
  source_ref                 text check (char_length(source_ref) <= 60),
  rescheduled_from_id        uuid,
  rescheduled_to_id          uuid,
  -- Rendez-vous pris malgré un jour férié, après confirmation explicite.
  holiday_confirmed          boolean not null default false,
  visit_id                   uuid,
  -- Rappel WhatsApp (étapes 23 et 24).
  reminder_sent_at           timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at                 timestamptz,

  constraint appointments_id_org_unique unique (id, org_id),
  constraint appointments_times_check check (ends_at > starts_at),
  constraint appointments_status_check check (status in (
    'scheduled', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rescheduled')),
  constraint appointments_source_check
    check (source in ('agenda', 'patient_file', 'followup', 'reschedule')),
  constraint appointments_arrived_check check (status <> 'arrived' or arrived_at is not null),
  constraint appointments_rescheduled_check
    check (status <> 'rescheduled' or rescheduled_to_id is not null),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (appointment_type_id, org_id) references public.appointment_types (id, org_id),
  foreign key (practitioner_membership_id, org_id) references public.memberships (id, org_id),
  foreign key (session_id, org_id) references public.appointment_sessions (id, org_id),
  foreign key (rescheduled_from_id, org_id) references public.appointments (id, org_id),
  foreign key (rescheduled_to_id, org_id) references public.appointments (id, org_id),
  foreign key (visit_id, org_id) references public.visits (id, org_id)
);

create index appointments_org_day_idx on public.appointments (org_id, local_date, status);
create index appointments_patient_idx on public.appointments (patient_id);
create index appointments_session_day_idx
  on public.appointments (session_id, local_date) where session_id is not null;
create index appointments_practitioner_idx
  on public.appointments (practitioner_membership_id, local_date)
  where practitioner_membership_id is not null;
create index appointments_series_idx on public.appointments (series_id) where series_id is not null;

comment on table public.appointments is
  'Rendez-vous. Aucune note ici : elle vit dans appointment_notes (soignants seulement).';

create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_trigger();

create table public.appointment_notes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  appointment_id  uuid not null,
  note            text not null check (char_length(btrim(note)) between 1 and 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at      timestamptz,
  constraint appointment_notes_appointment_unique unique (appointment_id),
  foreign key (appointment_id, org_id) references public.appointments (id, org_id)
);

comment on table public.appointment_notes is
  'Note d''un rendez-vous : secret médical, lisible par les soignants seulement.';

create trigger appointment_notes_set_updated_at before update on public.appointment_notes
  for each row execute function public.set_updated_at();
create trigger appointment_notes_audit after insert or update or delete on public.appointment_notes
  for each row execute function public.audit_trigger_redacted('appointment_id');

-- Libellé montré au patient (rappel, page publique, impression remise) : un type discret
-- n'est jamais nommé.
create function public.appointment_patient_label(p_appointment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.type = 'clinique' then 'votre rendez-vous à la clinique'
              else 'votre rendez-vous au poste de santé' end
         || case when t.is_discreet then '' else ' (' || t.label || ')' end
    from public.appointments a
    join public.appointment_types t on t.id = a.appointment_type_id
    join public.organizations o on o.id = a.org_id
   where a.id = p_appointment_id;
$$;


-- =============================================================================
-- 5. Contrôles
-- =============================================================================

create function public.appointment_assert_patient(p_org_id uuid, p_patient_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient public.patients;
begin
  select * into v_patient from public.patients where id = p_patient_id and org_id = p_org_id;
  if not found then
    raise exception 'Ce patient est introuvable dans le registre.' using errcode = '22023';
  end if;
  if v_patient.merged_into_id is not null then
    raise exception 'Ce dossier a été fusionné : ouvrez le dossier conservé.' using errcode = '22023';
  end if;
  if v_patient.deleted_at is not null then
    raise exception 'Ce dossier n''est plus actif.' using errcode = '22023';
  end if;
end;
$$;

-- Problèmes d'un créneau, sans rien écrire :
--   blocking : refus (date passée, séance pleine ou invalide, praticien invalide) ;
--   warnings : à confirmer (jour férié, fermé, hors horaires, pause, praticien en congé,
--              créneau du praticien déjà pris, autre rendez-vous du patient ce jour-là).
-- Chaque élément : { code, message }. Renvoie aussi la séance retenue (session_id).
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
    select to_char(a.starts_at at time zone v_tz, 'HH24:MI') || ', ' || t.label into v_libelle
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
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

-- Dates d'une série : même heure locale, tous les p_interval_months mois.
create function public.appointment_series_dates(
  p_org_id uuid, p_starts_at timestamptz, p_count integer, p_interval_months integer)
returns table (series_index integer, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n + 1,
         ((p_starts_at at time zone o.timezone) + make_interval(months => n * coalesce(p_interval_months, 0)))
           at time zone o.timezone
    from public.organizations o, generate_series(0, greatest(p_count, 1) - 1) n
   where o.id = p_org_id
   order by n;
$$;

-- Aperçu avant la prise : un élément par rendez-vous de la série.
create function public.check_appointment(
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
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
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
      || public.appointment_issues(p_org_id, p_type_id, p_patient_id, v_d.starts_at,
                                   p_practitioner_id,
                                   case when v_d.series_index = 1 then p_session_id end,
                                   p_exclude_id));
  end loop;
  return v_resultat;
end;
$$;

-- Écriture d'un rendez-vous (droits vérifiés par l'appelant). Les séances du type ce
-- jour-là sont verrouillées : deux postes ne prennent pas la 40e place en même temps.
create function public.appointment_insert(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid,
  p_session_id      uuid,
  p_note            text,
  p_confirm         boolean,
  p_series_id       uuid,
  p_series_index    integer,
  p_source          text,
  p_source_ref      text,
  p_rescheduled_from uuid,
  p_exclude_id      uuid default null)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz      text;
  v_dow     integer;
  v_issues  jsonb;
  v_prefixe text := '';
  v_ligne   public.appointments;
begin
  perform public.appointment_assert_patient(p_org_id, p_patient_id);
  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'La note ne doit pas dépasser 500 caractères.' using errcode = '22023';
  end if;

  select timezone into v_tz from public.organizations where id = p_org_id;
  v_dow := extract(isodow from (p_starts_at at time zone v_tz))::integer;
  perform 1 from public.appointment_sessions
   where org_id = p_org_id and appointment_type_id = p_type_id and weekday = v_dow
   for update;

  v_issues := public.appointment_issues(p_org_id, p_type_id, p_patient_id, p_starts_at,
                                        p_practitioner_id, p_session_id, p_exclude_id);
  if p_series_index is not null and p_series_index > 1 or p_rescheduled_from is not null then
    v_prefixe := 'Rendez-vous du '
                 || to_char((v_issues ->> 'local_date')::date, 'DD/MM/YYYY') || ' : ';
  end if;
  if jsonb_array_length(v_issues -> 'blocking') > 0 then
    raise exception '%', v_prefixe || (v_issues -> 'blocking' -> 0 ->> 'message')
      using errcode = '22023';
  end if;
  if jsonb_array_length(v_issues -> 'warnings') > 0 and not coalesce(p_confirm, false) then
    raise exception '%', case when v_prefixe = '' then 'À confirmer : ' else v_prefixe || 'à confirmer. ' end
      || (select string_agg(w ->> 'message', ' ') from jsonb_array_elements(v_issues -> 'warnings') w)
      using errcode = '22023', hint = 'confirmation_required';
  end if;

  insert into public.appointments (org_id, patient_id, appointment_type_id,
                                   practitioner_membership_id, session_id, starts_at, ends_at,
                                   local_date, series_id, series_index, source, source_ref,
                                   rescheduled_from_id, holiday_confirmed)
  values (p_org_id, p_patient_id, p_type_id, p_practitioner_id,
          (v_issues ->> 'session_id')::uuid, p_starts_at, (v_issues ->> 'ends_at')::timestamptz,
          (v_issues ->> 'local_date')::date, p_series_id, p_series_index, p_source,
          nullif(btrim(coalesce(p_source_ref, '')), ''), p_rescheduled_from,
          v_issues -> 'warnings' @> '[{"code": "holiday"}]')
  returning * into v_ligne;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.appointment_notes (org_id, appointment_id, note)
    values (p_org_id, v_ligne.id, btrim(p_note));
  end if;
  return v_ligne;
end;
$$;

create function public.appointments_assert_write(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de gérer les rendez-vous.' using errcode = '42501';
  end if;
  if not public.appointments_can_write(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
end;
$$;


-- =============================================================================
-- 6. RPC
-- =============================================================================

-- Prise d'un rendez-vous, ou d'une série (p_count > 1, tous les p_interval_months mois).
-- Tout ou rien : un rendez-vous de la série refusé annule la série.
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
    return next public.appointment_insert(
      p_org_id, p_patient_id, p_type_id, v_d.starts_at, p_practitioner_id,
      case when v_d.series_index = 1 then p_session_id end,
      p_note, p_confirm, v_serie, case when v_serie is not null then v_d.series_index end,
      p_source, null, null);
  end loop;
end;
$$;

-- Statuts saisis à la main. « arrived » passe par arrive_appointment, « rescheduled » par
-- reschedule_appointment. Absent : seulement le jour même ou après.
create function public.set_appointment_status(
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
    return v_a;
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
  return v_a;
end;
$$;

-- Report : un nouveau rendez-vous (même patient, type, série et note) ; l'ancien reste,
-- au statut « reporté », relié au nouveau.
create function public.appointment_reschedule_one(
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
    p_session_id, v_note, p_confirm, v_a.series_id, v_a.series_index, 'reschedule',
    v_a.source_ref, v_a.id, v_a.id);

  update public.appointments
     set status = 'rescheduled', status_changed_at = now(), rescheduled_to_id = v_neuf.id
   where id = v_a.id;
  return v_neuf;
end;
$$;

create function public.reschedule_appointment(
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
  select public.appointment_reschedule_one(p_appointment_id, p_starts_at, p_practitioner_id,
                                           p_keep_practitioner, p_session_id, p_confirm);
$$;

-- Report groupé vers un autre jour, à la même heure (jour férié confirmé la veille).
-- Tout ou rien : un rendez-vous qui ne tient pas (séance pleine…) annule le report.
create function public.reschedule_appointments(
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
    return next public.appointment_reschedule_one(v_a.id, v_a.nouveau, null, true, null, p_confirm);
  end loop;
  if not found then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
end;
$$;

-- « Arrivé » : le patient entre dans la file d'attente en un seul geste. Si le patient
-- attend déjà dans ce service, son passage est repris (pas de double ticket).
create function public.arrive_appointment(
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

  v_service := coalesce(p_queue_service_id,
                        (select queue_service_id from public.appointment_types
                          where id = v_a.appointment_type_id));
  if v_service is null then
    raise exception 'Choisissez le service de la file d''attente.' using errcode = '22023';
  end if;

  select * into v_visite from public.visits
   where patient_id = v_a.patient_id and queue_service_id = v_service
     and visit_date = v_a.local_date and status in ('waiting', 'vitals', 'consultation')
     and deleted_at is null
   limit 1;
  if not found then
    v_visite := public.visit_create(v_a.org_id, v_a.patient_id, v_service, p_priority, null,
                                    'appointment');
  end if;

  update public.appointments
     set status = 'arrived', status_changed_at = now(), arrived_at = now(), visit_id = v_visite.id
   where id = v_a.id;
  return v_visite;
end;
$$;

-- Agenda d'une période (62 jours au plus). La note n'est rendue qu'aux soignants.
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
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Choisissez une période de 62 jours au plus.' using errcode = '22023';
  end if;
  return query
    select a.id, a.patient_id, p.last_name, p.first_name, p.file_number, p.phone,
           a.starts_at, a.ends_at, a.local_date, a.status, a.appointment_type_id, t.label,
           t.is_discreet, a.practitioner_membership_id,
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           a.session_id, a.series_id, a.series_index, a.source, a.source_ref,
           a.holiday_confirmed, a.visit_id, v.ticket_number, a.cancel_reason,
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

-- « À rappeler demain » (rappels WhatsApp des étapes 23 et 24). patient_label est le
-- seul texte à envoyer au patient : un type discret n'y est jamais nommé.
create function public.appointments_to_remind(p_org_id uuid, p_date date default null)
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
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  return query
    select a.id, a.patient_id, p.last_name, p.first_name, p.phone, p.phone_owner,
           p.whatsapp_consent, p.preferred_language, a.starts_at, a.status, t.label,
           t.is_discreet, public.appointment_patient_label(a.id),
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

-- Taux d'absence d'un patient : absents / (venus + absents). Les rendez-vous annulés,
-- reportés ou à venir ne comptent pas.
create function public.patient_appointment_stats(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_venus   integer;
  v_absents integer;
  v_avenir  integer;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.appointments_can_read(v_org) then
    raise exception 'Dossier introuvable.' using errcode = '42501';
  end if;
  select count(*) filter (where status = 'arrived'),
         count(*) filter (where status = 'no_show'),
         count(*) filter (where status in ('scheduled', 'confirmed')
                            and local_date >= public.org_local_date(v_org))
    into v_venus, v_absents, v_avenir
    from public.appointments
   where patient_id = p_patient_id and deleted_at is null;
  return jsonb_build_object(
    'arrived',      v_venus,
    'no_show',      v_absents,
    'upcoming',     v_avenir,
    'no_show_rate', case when v_venus + v_absents > 0
                         then round(100.0 * v_absents / (v_venus + v_absents))::integer end);
end;
$$;

-- Rendez-vous de suivi créé par un autre module (CPN, vaccins, PF…).
--   p_type_code : code du type (appointment_types.template_code), « cpn », « vaccination »… ;
--   p_date      : date souhaitée ; le premier jour qui convient dans les 30 jours est
--                 retenu (ni férié, ni fermé, séance du type avec de la place s'il y en a) ;
--   p_source    : module appelant, gardé dans source_ref.
-- Rejouable : un rendez-vous du même type déjà prévu à 7 jours près est renvoyé tel quel.
create function public.schedule_followup(
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

  select * into v_existant from public.appointments
   where patient_id = p_patient_id and appointment_type_id = v_type.id
     and status in ('scheduled', 'confirmed') and deleted_at is null
     and local_date between p_date - 7 and p_date + 7
   order by abs(local_date - p_date)
   limit 1;
  if found then
    return v_existant;
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
      return public.appointment_insert(v_org, p_patient_id, v_type.id,
                                       (v_jour + v_heure) at time zone v_tz, null, v_session,
                                       null, true, null, null, 'followup', btrim(p_source), null);
    end if;
    v_jour := v_jour + 1;
  end loop;

  raise exception 'Aucune date libre dans les 30 jours qui suivent le %.', to_char(p_date, 'DD/MM/YYYY')
    using errcode = '22023';
end;
$$;


-- =============================================================================
-- 7. Fusion de dossiers : les rendez-vous suivent le dossier gardé
-- =============================================================================

create function public.patients_merge_relink_appointments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  update public.appointments set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

create trigger patients_merge_relink_appointments
  after update of merged_into_id on public.patients
  for each row execute function public.patients_merge_relink_appointments();


-- =============================================================================
-- 8. Droits d'accès
-- =============================================================================

revoke all on
  public.appointment_type_templates, public.holiday_templates, public.appointment_types,
  public.appointment_sessions, public.appointment_breaks, public.holidays,
  public.appointments, public.appointment_notes
from anon, authenticated;

grant select on public.appointment_type_templates, public.holiday_templates to authenticated;

grant select on public.appointment_types to authenticated;
grant insert (id, org_id, label, duration_minutes, is_discreet, recurrence_months,
              queue_service_id, is_active, sort_order)
  on public.appointment_types to authenticated;
grant update (label, duration_minutes, is_discreet, recurrence_months, queue_service_id,
              is_active, sort_order, deleted_at)
  on public.appointment_types to authenticated;

grant select on public.appointment_sessions to authenticated;
grant insert (id, org_id, appointment_type_id, weekday, start_time, end_time, capacity,
              practitioner_membership_id, label, is_active, sort_order)
  on public.appointment_sessions to authenticated;
grant update (appointment_type_id, weekday, start_time, end_time, capacity,
              practitioner_membership_id, label, is_active, sort_order, deleted_at)
  on public.appointment_sessions to authenticated;

grant select on public.appointment_breaks to authenticated;
grant insert (id, org_id, weekday, start_time, end_time, label, is_active)
  on public.appointment_breaks to authenticated;
grant update (weekday, start_time, end_time, label, is_active, deleted_at)
  on public.appointment_breaks to authenticated;

grant select on public.holidays to authenticated;
grant insert (id, org_id, holiday_date, label, template_code) on public.holidays to authenticated;
grant update (holiday_date, label, deleted_at) on public.holidays to authenticated;

-- Rendez-vous et notes : lecture seulement, écriture par RPC.
grant select on public.appointments, public.appointment_notes to authenticated;

revoke execute on function
  public.appointments_can_read(uuid),
  public.appointments_can_write(uuid),
  public.appointments_can_medical(uuid),
  public.appointments_can_manage(uuid),
  public.appointments_can_configure(uuid),
  public.appointment_permissions(uuid),
  public.is_practitioner(uuid, uuid),
  public.membership_display_name(uuid),
  public.weekday_key(integer),
  public.appointment_types_discreet_default(),
  public.holidays_add_fixed(uuid, integer),
  public.add_fixed_holidays(uuid, integer),
  public.seed_appointment_settings(uuid),
  public.organizations_seed_appointment_settings(),
  public.appointment_patient_label(uuid),
  public.appointment_assert_patient(uuid, uuid),
  public.appointment_issues(uuid, uuid, uuid, timestamptz, uuid, uuid, uuid),
  public.appointment_series_dates(uuid, timestamptz, integer, integer),
  public.check_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, integer, integer, uuid),
  public.appointment_insert(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean, uuid,
                            integer, text, text, uuid, uuid),
  public.appointments_assert_write(uuid),
  public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean, integer,
                          integer, text),
  public.set_appointment_status(uuid, text, text),
  public.appointment_reschedule_one(uuid, timestamptz, uuid, boolean, uuid, boolean),
  public.reschedule_appointment(uuid, timestamptz, uuid, boolean, uuid, boolean),
  public.reschedule_appointments(uuid[], date, boolean),
  public.arrive_appointment(uuid, uuid, text),
  public.list_appointments(uuid, date, date, uuid),
  public.appointments_to_remind(uuid, date),
  public.patient_appointment_stats(uuid),
  public.schedule_followup(uuid, text, date, text),
  public.patients_merge_relink_appointments()
from public, anon, authenticated;

-- Aides appelées par les policies, et RPC du module.
grant execute on function
  public.appointments_can_read(uuid),
  public.appointments_can_write(uuid),
  public.appointments_can_medical(uuid),
  public.appointments_can_manage(uuid),
  public.appointments_can_configure(uuid),
  public.appointment_permissions(uuid),
  public.is_practitioner(uuid, uuid),
  public.add_fixed_holidays(uuid, integer),
  public.check_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, integer, integer, uuid),
  public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, uuid, text, boolean, integer,
                          integer, text),
  public.set_appointment_status(uuid, text, text),
  public.reschedule_appointment(uuid, timestamptz, uuid, boolean, uuid, boolean),
  public.reschedule_appointments(uuid[], date, boolean),
  public.arrive_appointment(uuid, uuid, text),
  public.list_appointments(uuid, date, date, uuid),
  public.appointments_to_remind(uuid, date),
  public.patient_appointment_stats(uuid),
  public.schedule_followup(uuid, text, date, text)
to authenticated;


-- =============================================================================
-- 9. Row Level Security
-- =============================================================================

alter table public.appointment_type_templates enable row level security;
alter table public.holiday_templates          enable row level security;
alter table public.appointment_types          enable row level security;
alter table public.appointment_sessions       enable row level security;
alter table public.appointment_breaks         enable row level security;
alter table public.holidays                   enable row level security;
alter table public.appointments               enable row level security;
alter table public.appointment_notes          enable row level security;

create policy appointment_type_templates_select_all on public.appointment_type_templates
  for select to authenticated using (true);
create policy holiday_templates_select_all on public.holiday_templates
  for select to authenticated using (true);

create policy appointment_types_select on public.appointment_types
  for select to authenticated
  using (public.appointments_can_read(org_id));
create policy appointment_types_insert on public.appointment_types
  for insert to authenticated
  with check (public.appointments_can_configure(org_id));
create policy appointment_types_update on public.appointment_types
  for update to authenticated
  using (public.appointments_can_configure(org_id))
  with check (public.appointments_can_configure(org_id));

create policy appointment_sessions_select on public.appointment_sessions
  for select to authenticated
  using (public.appointments_can_read(org_id));
create policy appointment_sessions_insert on public.appointment_sessions
  for insert to authenticated
  with check (public.appointments_can_configure(org_id)
              and (practitioner_membership_id is null
                   or public.is_practitioner(org_id, practitioner_membership_id)));
create policy appointment_sessions_update on public.appointment_sessions
  for update to authenticated
  using (public.appointments_can_configure(org_id))
  with check (public.appointments_can_configure(org_id)
              and (practitioner_membership_id is null
                   or public.is_practitioner(org_id, practitioner_membership_id)));

create policy appointment_breaks_select on public.appointment_breaks
  for select to authenticated
  using (public.appointments_can_read(org_id));
create policy appointment_breaks_insert on public.appointment_breaks
  for insert to authenticated
  with check (public.appointments_can_configure(org_id));
create policy appointment_breaks_update on public.appointment_breaks
  for update to authenticated
  using (public.appointments_can_configure(org_id))
  with check (public.appointments_can_configure(org_id));

create policy holidays_select on public.holidays
  for select to authenticated
  using (public.appointments_can_read(org_id));
create policy holidays_insert on public.holidays
  for insert to authenticated
  with check (public.appointments_can_configure(org_id));
create policy holidays_update on public.holidays
  for update to authenticated
  using (public.appointments_can_configure(org_id))
  with check (public.appointments_can_configure(org_id));

create policy appointments_select on public.appointments
  for select to authenticated
  using (public.appointments_can_read(org_id));

create policy appointment_notes_select on public.appointment_notes
  for select to authenticated
  using (public.appointments_can_medical(org_id));
