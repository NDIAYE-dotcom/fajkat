-- =============================================================================
-- Étape 12 — Accueil du jour, file d'attente, tickets et constantes
--            (features « file_attente » et « tickets_consultation »)
-- -----------------------------------------------------------------------------
-- 1. Aides             : droits (file, soignants, gestion, vente de tickets), journal
--                        sans valeurs, date du jour de la structure.
-- 2. Référentiels      : queue_priorities (ordre de passage), queue_service_templates
--                        (services de file proposés par type), vital_threshold_defaults
--                        (seuils d'alerte proposés). Rien de médical n'est codé ailleurs.
-- 3. Paramètres        : queue_services (lettre A, B, C…), rooms (salles), vital_thresholds
--                        (seuils de la structure), pré-remplis à la création de la structure.
-- 4. visits            : un passage du jour. Numéro A-001 par service et par jour, attribué
--                        par le serveur. Statuts : waiting / vitals / consultation / done /
--                        left. Le motif vit à part (visit_reasons) : soignants seulement.
-- 5. vital_signs       : constantes, en ajout seul (une correction = une nouvelle mesure,
--                        une erreur = mesure annulée avec motif). Alertes calculées par le
--                        serveur d'après vital_thresholds.
-- 6. Tickets de consultation (postes de santé) : vente + arrivée en un seul geste ; la
--                        recette attend son rattachement à la caisse (étape 19).
-- 7. Écran d'appel     : display_screens (lien à jeton, révocable). Chaque appel est
--                        poussé par la base sur un canal Realtime Broadcast public dont le
--                        nom est secret (realtime.send). Numéro, initiales et salle seulement.
-- 8. Suivi du ticket   : page publique ouverte par le QR du ticket (numéro, rang, salle).
-- 9. Fusion de dossiers : passages, constantes, tickets et recettes suivent le dossier gardé.
--
-- Qui fait quoi :
--   file (lecture, arrivée, déplacement, appel) : owner, admin, médecin, sage-femme,
--                         infirmier, aide-soignant, accueil, caissier ;
--   motif et constantes  : soignants (patients_can_read_medical de l'étape 11) ;
--   paramètres, seuils, écrans d'appel : owner et admin ;
--   ticket de consultation : owner, admin, accueil, caissier, infirmier ;
--   recettes en attente  : owner, admin, caissier, comptable (lecture).
--
-- Les refus métier lèvent le code 22023 avec un message en français, affiché tel quel.
-- =============================================================================


-- =============================================================================
-- 1. Aides
-- =============================================================================

-- Date du jour dans le fuseau de la structure, sans contrôle d'appartenance
-- (usage interne : triggers, fonctions publiques à jeton).
create function public.org_local_date(p_org_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.timezone)::date
    from public.organizations o where o.id = p_org_id;
$$;

create function public.queue_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'file_attente')
     and public.has_role(p_org_id, array[
           'owner', 'admin', 'medecin', 'sage_femme', 'infirmier', 'aide_soignant',
           'accueil', 'caissier']);
$$;

create function public.queue_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.queue_can_read(p_org_id) and public.patients_org_writable(p_org_id);
$$;

-- Motif de venue et constantes : secret médical.
create function public.queue_can_medical(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'file_attente')
     and public.patients_can_read_medical(p_org_id);
$$;

create function public.queue_can_manage(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'file_attente')
     and public.has_role(p_org_id, array['owner', 'admin']);
$$;

-- Paramètres (services de file, salles, seuils, écrans) : abonnement actif exigé.
create function public.queue_can_configure(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.queue_can_manage(p_org_id) and public.patients_org_writable(p_org_id);
$$;

create function public.tickets_can_sell(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'tickets_consultation')
     and public.queue_can_write(p_org_id)
     and public.has_role(p_org_id, array['owner', 'admin', 'accueil', 'caissier', 'infirmier']);
$$;

create function public.receipts_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(p_org_id, array['owner', 'admin', 'caissier', 'comptable']);
$$;

-- Droits de l'utilisateur connecté, pour le front (affichage seulement : la base décide).
create function public.queue_permissions(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'read',        public.queue_can_read(p_org_id),
    'write',       public.queue_can_write(p_org_id),
    'medical',     public.queue_can_medical(p_org_id),
    'manage',      public.queue_can_manage(p_org_id),
    'sell_ticket', public.tickets_can_sell(p_org_id));
$$;

-- Journal sans valeurs, pour les tables qui portent des données médicales (motif,
-- constantes) : audit_logs est lisible par owner et admin, qui ne sont pas forcément
-- soignants. Arguments : colonnes recopiées telles quelles (identifiants seulement).
create function public.audit_trigger_redacted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ligne  jsonb := coalesce(v_new, v_old);
  v_champs text[];
  v_garde  jsonb := '{}'::jsonb;
  v_col    text;
begin
  select coalesce(array_agg(k order by k), '{}') into v_champs
    from jsonb_object_keys(v_ligne) k
   where k not in ('updated_at', 'created_at')
     and (v_old is null or v_new is null or v_old -> k is distinct from v_new -> k);
  if tg_op = 'UPDATE' and cardinality(v_champs) = 0 then
    return null;
  end if;

  if tg_nargs > 0 then
    foreach v_col in array tg_argv loop
      v_garde := v_garde || jsonb_build_object(v_col, v_ligne -> v_col);
    end loop;
  end if;

  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values ((v_ligne ->> 'org_id')::uuid, auth.uid(), tg_op, tg_table_name, v_ligne ->> 'id',
          null, v_garde || jsonb_build_object('changed_fields', to_jsonb(v_champs)));
  return null;
end;
$$;


-- =============================================================================
-- 2. Référentiels
-- =============================================================================

-- Ordre de passage : rang le plus petit d'abord, puis l'heure d'arrivée.
create table public.queue_priorities (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  rank       smallint not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.queue_priorities is
  'Priorités de la file et leur rang (plus petit = passe avant). Paramétrable.';

create trigger queue_priorities_set_updated_at before update on public.queue_priorities
  for each row execute function public.set_updated_at();

insert into public.queue_priorities (code, label, rank, sort_order) values
  ('normal',     'Normale',                  2, 10),
  ('pregnant',   'Femme enceinte',           1, 20),
  ('under_five', 'Enfant de moins de 5 ans', 1, 30),
  ('elderly',    'Personne âgée',            1, 40),
  ('emergency',  'Urgence',                  0, 50)
on conflict (code) do nothing;

create table public.queue_service_templates (
  plan_code  text not null references public.plans (code) on update cascade,
  code       text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  letter     text not null check (letter ~ '^[A-Z]$'),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, code)
);

comment on table public.queue_service_templates is
  'Services de file proposés à la création d''une structure, par type.';

create trigger queue_service_templates_set_updated_at
  before update on public.queue_service_templates
  for each row execute function public.set_updated_at();

insert into public.queue_service_templates (plan_code, code, label, letter, sort_order) values
  ('poste_sante', 'consultation',  'Consultation',             'A', 10),
  ('poste_sante', 'cpn',           'Consultation prénatale',   'B', 20),
  ('poste_sante', 'vaccination',   'Vaccination',              'C', 30),
  ('poste_sante', 'soins',         'Pansement et soins',       'D', 40),
  ('poste_sante', 'pf',            'Planification familiale',  'E', 50),
  ('poste_sante', 'laboratoire',   'Laboratoire',              'F', 60),
  ('clinique',    'consultation',  'Consultation',             'A', 10),
  ('clinique',    'cpn',           'Consultation prénatale',   'B', 20),
  ('clinique',    'vaccination',   'Vaccination',              'C', 30),
  ('clinique',    'soins',         'Pansement et soins',       'D', 40),
  ('clinique',    'laboratoire',   'Laboratoire',              'E', 50),
  ('clinique',    'imagerie',      'Imagerie',                 'F', 60)
on conflict (plan_code, code) do nothing;

-- Mesures reconnues. Unités : kg, cm, °C, mmHg, battements/min, %, g/L, mm.
create function public.vital_measure_valid(p_measure text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_measure in ('weight_kg', 'height_cm', 'temperature_c', 'systolic', 'diastolic',
                       'pulse', 'spo2', 'glucose_g_l', 'muac_mm');
$$;

-- Seuils proposés à la création d'une structure. Chaque structure les relit et les
-- modifie (vital_thresholds) : ce sont des valeurs de départ, pas des règles.
--   below       : alerte si la valeur est STRICTEMENT inférieure ;
--   at_or_above : alerte si la valeur est supérieure OU ÉGALE ;
--   âge         : min_age_months inclus, max_age_months exclu (null = sans borne).
create table public.vital_threshold_defaults (
  code            text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  measure         text not null check (public.vital_measure_valid(measure)),
  min_age_months  integer check (min_age_months >= 0),
  max_age_months  integer check (max_age_months > 0),
  below           numeric(6,2),
  at_or_above     numeric(6,2),
  level           text not null check (level in ('warning', 'alert')),
  label           text not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (num_nonnulls(below, at_or_above) = 1),
  check (max_age_months is null or min_age_months is null or max_age_months > min_age_months)
);

comment on table public.vital_threshold_defaults is
  'Seuils d''alerte des constantes proposés à la création d''une structure.';

create trigger vital_threshold_defaults_set_updated_at
  before update on public.vital_threshold_defaults
  for each row execute function public.set_updated_at();

insert into public.vital_threshold_defaults
  (code, measure, min_age_months, max_age_months, below, at_or_above, level, label, sort_order)
values
  ('systolic_high',      'systolic',      180,  null, null, 140,  'warning', 'Tension élevée',                 10),
  ('systolic_very_high', 'systolic',      180,  null, null, 180,  'alert',   'Tension très élevée',            20),
  ('systolic_low',       'systolic',      180,  null, 90,   null, 'alert',   'Tension basse',                  30),
  ('diastolic_high',     'diastolic',     180,  null, null, 90,   'warning', 'Tension élevée',                 40),
  ('diastolic_very_high','diastolic',     180,  null, null, 110,  'alert',   'Tension très élevée',            50),
  ('fever',              'temperature_c', null, null, null, 38,   'warning', 'Fièvre',                         60),
  ('high_fever',         'temperature_c', null, null, null, 39.5, 'alert',   'Fièvre élevée',                  70),
  ('hypothermia',        'temperature_c', null, null, 35.5, null, 'alert',   'Température basse',              80),
  ('pulse_fast',         'pulse',         180,  null, null, 120,  'alert',   'Pouls rapide',                   90),
  ('pulse_slow',         'pulse',         180,  null, 50,   null, 'alert',   'Pouls lent',                    100),
  ('spo2_low',           'spo2',          null, null, 95,   null, 'warning', 'Saturation basse',              110),
  ('spo2_very_low',      'spo2',          null, null, 90,   null, 'alert',   'Saturation très basse',         120),
  ('glucose_low',        'glucose_g_l',   null, null, 0.7,  null, 'alert',   'Glycémie basse',                130),
  ('glucose_high',       'glucose_g_l',   null, null, null, 2,    'warning', 'Glycémie élevée',               140),
  ('glucose_very_high',  'glucose_g_l',   null, null, null, 3,    'alert',   'Glycémie très élevée',          150),
  ('muac_moderate',      'muac_mm',       6,    60,   125,  null, 'warning', 'Malnutrition aiguë modérée',    160),
  ('muac_severe',        'muac_mm',       6,    60,   115,  null, 'alert',   'Malnutrition aiguë sévère',     170)
on conflict (code) do nothing;


-- =============================================================================
-- 3. Paramètres de la structure
-- =============================================================================

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  label       text not null check (char_length(btrim(label)) between 2 and 60),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at  timestamptz,
  constraint rooms_id_org_unique unique (id, org_id)
);

create unique index rooms_org_label_unique
  on public.rooms (org_id, lower(btrim(label))) where deleted_at is null;

comment on table public.rooms is 'Salles et bureaux annoncés à l''écran d''appel.';

create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function public.audit_trigger();

create table public.queue_services (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id),
  template_code    text,
  label            text not null check (char_length(btrim(label)) between 2 and 60),
  letter           text not null check (letter ~ '^[A-Z]$'),
  default_room_id  uuid,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at       timestamptz,
  constraint queue_services_id_org_unique unique (id, org_id),
  foreign key (default_room_id, org_id) references public.rooms (id, org_id)
);

-- Une lettre et un libellé une seule fois par structure : A-001 ne désigne qu'un service.
create unique index queue_services_org_letter_unique
  on public.queue_services (org_id, letter) where deleted_at is null;
create unique index queue_services_org_label_unique
  on public.queue_services (org_id, lower(btrim(label))) where deleted_at is null;

comment on table public.queue_services is
  'Services de la file d''attente et leur lettre de ticket (A-001, B-001…).';

create trigger queue_services_set_updated_at before update on public.queue_services
  for each row execute function public.set_updated_at();
create trigger queue_services_audit after insert or update or delete on public.queue_services
  for each row execute function public.audit_trigger();

create table public.vital_thresholds (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  template_code   text,
  measure         text not null check (public.vital_measure_valid(measure)),
  min_age_months  integer check (min_age_months >= 0),
  max_age_months  integer check (max_age_months > 0),
  below           numeric(6,2),
  at_or_above     numeric(6,2),
  level           text not null check (level in ('warning', 'alert')),
  label           text not null check (char_length(btrim(label)) between 2 and 80),
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at      timestamptz,
  constraint vital_thresholds_one_bound check (num_nonnulls(below, at_or_above) = 1),
  constraint vital_thresholds_age_check
    check (max_age_months is null or min_age_months is null or max_age_months > min_age_months)
);

create index vital_thresholds_org_idx on public.vital_thresholds (org_id) where deleted_at is null;

comment on table public.vital_thresholds is
  'Seuils d''alerte des constantes de la structure (below : < ; at_or_above : >=).';

create trigger vital_thresholds_set_updated_at before update on public.vital_thresholds
  for each row execute function public.set_updated_at();
create trigger vital_thresholds_audit after insert or update or delete on public.vital_thresholds
  for each row execute function public.audit_trigger();

-- Pré-remplissage, rejouable : rien n'est ajouté à une structure déjà paramétrée.
create function public.seed_queue_settings(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select type into v_type from public.organizations where id = p_org_id;

  if not exists (select 1 from public.rooms where org_id = p_org_id) then
    insert into public.rooms (org_id, label, sort_order, created_by)
    values (p_org_id, 'Salle de consultation', 10, null),
           (p_org_id, 'Salle de soins', 20, null);
  end if;

  if not exists (select 1 from public.queue_services where org_id = p_org_id) then
    insert into public.queue_services (org_id, template_code, label, letter, sort_order,
                                       default_room_id, created_by)
    select p_org_id, t.code, t.label, t.letter, t.sort_order,
           (select r.id from public.rooms r
             where r.org_id = p_org_id and r.deleted_at is null
               and r.label = case when t.code in ('soins', 'vaccination')
                                  then 'Salle de soins' else 'Salle de consultation' end),
           null
      from public.queue_service_templates t
     where t.plan_code = v_type and t.is_active;
  end if;

  if not exists (select 1 from public.vital_thresholds where org_id = p_org_id) then
    insert into public.vital_thresholds (org_id, template_code, measure, min_age_months,
                                         max_age_months, below, at_or_above, level, label,
                                         sort_order, created_by)
    select p_org_id, d.code, d.measure, d.min_age_months, d.max_age_months, d.below,
           d.at_or_above, d.level, d.label, d.sort_order, null
      from public.vital_threshold_defaults d
     where d.is_active;
  end if;
end;
$$;

create function public.organizations_seed_queue_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_queue_settings(new.id);
  return null;
end;
$$;

create trigger organizations_seed_queue_settings
  after insert on public.organizations
  for each row execute function public.organizations_seed_queue_settings();

select public.seed_queue_settings(o.id) from public.organizations o;


-- =============================================================================
-- 4. Passages du jour
-- =============================================================================

create table public.queue_counters (
  queue_service_id uuid not null references public.queue_services (id),
  day              date not null,
  last_value       integer not null default 0,
  primary key (queue_service_id, day)
);

comment on table public.queue_counters is
  'Dernier numéro de ticket attribué, par service et par jour. Serveur uniquement.';

create table public.visits (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  patient_id        uuid not null,
  queue_service_id  uuid not null,
  -- Jour du passage dans le fuseau de la structure : les numéros repartent à 1 chaque jour.
  visit_date        date not null,
  ticket_seq        integer not null check (ticket_seq > 0),
  ticket_number     text not null,
  priority          text not null default 'normal' references public.queue_priorities (code),
  status            text not null default 'waiting',
  room_id           uuid,
  source            text not null default 'reception',
  -- Code du QR imprimé sur le ticket : suivi du rang sans connexion, sans nom.
  public_code       text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  arrived_at        timestamptz not null default now(),
  vitals_at         timestamptz,
  consultation_at   timestamptz,
  finished_at       timestamptz,
  left_at           timestamptz,
  status_changed_at timestamptz not null default now(),
  -- Appel à l'écran : chaque appel (ou rappel) pousse le numéro vers les écrans.
  last_called_at    timestamptz,
  call_count        smallint not null default 0,
  called_by         uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,

  constraint visits_id_org_unique unique (id, org_id),
  constraint visits_public_code_unique unique (public_code),
  constraint visits_ticket_unique unique (queue_service_id, visit_date, ticket_seq),
  constraint visits_status_check
    check (status in ('waiting', 'vitals', 'consultation', 'done', 'left')),
  constraint visits_source_check check (source in ('reception', 'consultation_ticket')),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (queue_service_id, org_id) references public.queue_services (id, org_id),
  foreign key (room_id, org_id) references public.rooms (id, org_id)
);

create index visits_org_day_idx on public.visits (org_id, visit_date, status);
create index visits_patient_idx on public.visits (patient_id);

comment on table public.visits is
  'Passages du jour (file d''attente). Aucun motif ici : il vit dans visit_reasons.';

create trigger visits_set_updated_at before update on public.visits
  for each row execute function public.set_updated_at();
create trigger visits_audit after insert or update or delete on public.visits
  for each row execute function public.audit_trigger();

-- Motif de venue : peut être sensible (dépistage…). Saisi à l'accueil, lu par les soignants.
create table public.visit_reasons (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  visit_id    uuid not null,
  reason      text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at  timestamptz,
  constraint visit_reasons_visit_unique unique (visit_id),
  foreign key (visit_id, org_id) references public.visits (id, org_id)
);

comment on table public.visit_reasons is
  'Motif de venue : secret médical, lisible par les soignants seulement.';

create trigger visit_reasons_set_updated_at before update on public.visit_reasons
  for each row execute function public.set_updated_at();
create trigger visit_reasons_audit after insert or update or delete on public.visit_reasons
  for each row execute function public.audit_trigger_redacted('visit_id');

create function public.next_ticket_seq(p_queue_service_id uuid, p_day date)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.queue_counters as c (queue_service_id, day, last_value)
  values (p_queue_service_id, p_day, 1)
  on conflict (queue_service_id, day) do update set last_value = c.last_value + 1
  returning c.last_value;
$$;

-- Création commune à l'arrivée simple et à la vente d'un ticket de consultation.
-- Les droits sont vérifiés par l'appelant.
create function public.visit_create(
  p_org_id           uuid,
  p_patient_id       uuid,
  p_queue_service_id uuid,
  p_priority         text,
  p_reason           text,
  p_source           text)
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_patient public.patients;
  v_service public.queue_services;
  v_jour    date := public.org_local_date(p_org_id);
  v_seq     integer;
  v_ligne   public.visits;
  v_deja    text;
begin
  select * into v_patient from public.patients
   where id = p_patient_id and org_id = p_org_id;
  if not found then
    raise exception 'Ce patient est introuvable dans le registre.' using errcode = '22023';
  end if;
  if v_patient.merged_into_id is not null then
    raise exception 'Ce dossier a été fusionné : ouvrez le dossier conservé.' using errcode = '22023';
  end if;
  if v_patient.deleted_at is not null then
    raise exception 'Ce dossier n''est plus actif.' using errcode = '22023';
  end if;

  select * into v_service from public.queue_services
   where id = p_queue_service_id and org_id = p_org_id
     and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez un service de la file.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.queue_priorities
                  where code = coalesce(p_priority, 'normal') and is_active) then
    raise exception 'Priorité inconnue.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Le motif ne doit pas dépasser 500 caractères.' using errcode = '22023';
  end if;

  -- Un patient n'attend qu'une fois par service : on évite le double ticket.
  -- (Verrou sur le dossier : deux postes d'accueil ne créent pas deux passages.)
  perform 1 from public.patients where id = p_patient_id for update;
  select ticket_number into v_deja from public.visits
   where patient_id = p_patient_id and queue_service_id = p_queue_service_id
     and visit_date = v_jour and status in ('waiting', 'vitals', 'consultation')
     and deleted_at is null
   limit 1;
  if v_deja is not null then
    raise exception 'Ce patient est déjà dans la file de ce service (ticket %).', v_deja
      using errcode = '22023';
  end if;

  v_seq := public.next_ticket_seq(p_queue_service_id, v_jour);
  insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                             ticket_number, priority, source)
  values (p_org_id, p_patient_id, p_queue_service_id, v_jour, v_seq,
          v_service.letter || '-' || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0'),
          coalesce(p_priority, 'normal'), p_source)
  returning * into v_ligne;

  if nullif(btrim(coalesce(p_reason, '')), '') is not null then
    insert into public.visit_reasons (org_id, visit_id, reason)
    values (p_org_id, v_ligne.id, btrim(p_reason));
  end if;
  return v_ligne;
end;
$$;

create function public.register_arrival(
  p_org_id           uuid,
  p_patient_id       uuid,
  p_queue_service_id uuid,
  p_priority         text default 'normal',
  p_reason           text default null)
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.queue_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas d''enregistrer une arrivée.' using errcode = '42501';
  end if;
  if not public.queue_can_write(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  return public.visit_create(p_org_id, p_patient_id, p_queue_service_id, p_priority,
                             p_reason, 'reception');
end;
$$;

-- Déplacement sur le tableau (bouton ou glisser-déposer). Aucun appel à l'écran ici.
--   waiting / vitals / consultation : libres entre eux (erreur de glissement corrigée) ;
--   -> done ou left : clôture ; done ou left -> waiting : seulement le jour même.
create function public.move_visit(p_visit_id uuid, p_status text, p_room_id uuid default null)
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne public.visits;
begin
  select * into v_ligne from public.visits
   where id = p_visit_id and deleted_at is null
     for update;
  if not found or not public.queue_can_read(v_ligne.org_id) then
    raise exception 'Ce passage est introuvable.' using errcode = '22023';
  end if;
  if not public.queue_can_write(v_ligne.org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if p_status not in ('waiting', 'vitals', 'consultation', 'done', 'left') then
    raise exception 'Étape inconnue.' using errcode = '22023';
  end if;
  if p_room_id is not null and not exists (
       select 1 from public.rooms where id = p_room_id and org_id = v_ligne.org_id
          and is_active and deleted_at is null) then
    raise exception 'Cette salle est introuvable.' using errcode = '22023';
  end if;
  if p_status = v_ligne.status and p_room_id is null then
    return v_ligne;
  end if;
  if v_ligne.status in ('done', 'left') and p_status <> 'waiting'
     and p_status <> v_ligne.status then
    raise exception 'Ce passage est clos : remettez-le d''abord en attente.' using errcode = '22023';
  end if;
  if v_ligne.status in ('done', 'left') and p_status = 'waiting'
     and v_ligne.visit_date <> public.org_local_date(v_ligne.org_id) then
    raise exception 'Un passage d''un autre jour ne peut pas être rouvert : enregistrez une nouvelle arrivée.'
      using errcode = '22023';
  end if;

  update public.visits v set
    status = p_status,
    room_id = coalesce(p_room_id, v.room_id),
    vitals_at = case when p_status = 'vitals' then coalesce(v.vitals_at, now()) else v.vitals_at end,
    consultation_at = case when p_status = 'consultation' then coalesce(v.consultation_at, now())
                           else v.consultation_at end,
    finished_at = case when p_status = 'done' then now()
                       when p_status = 'waiting' then null else v.finished_at end,
    left_at = case when p_status = 'left' then now()
                   when p_status = 'waiting' then null else v.left_at end,
    status_changed_at = case when p_status <> v.status then now() else v.status_changed_at end
   where v.id = p_visit_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- Appel d'un patient précis vers les constantes ou la consultation (ou rappel s'il y est
-- déjà). La salle par défaut du service est reprise si aucune n'est choisie.
create function public.call_visit(p_visit_id uuid, p_target text, p_room_id uuid default null)
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne public.visits;
  v_salle uuid;
begin
  select * into v_ligne from public.visits
   where id = p_visit_id and deleted_at is null
     for update;
  if not found or not public.queue_can_read(v_ligne.org_id) then
    raise exception 'Ce passage est introuvable.' using errcode = '22023';
  end if;
  if not public.queue_can_write(v_ligne.org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if p_target not in ('vitals', 'consultation') then
    raise exception 'Appel vers une étape inconnue.' using errcode = '22023';
  end if;
  if v_ligne.status in ('done', 'left') then
    raise exception 'Ce passage est clos : remettez-le d''abord en attente.' using errcode = '22023';
  end if;
  if v_ligne.visit_date <> public.org_local_date(v_ligne.org_id) then
    raise exception 'Ce passage date d''un autre jour.' using errcode = '22023';
  end if;

  v_salle := coalesce(p_room_id,
                      case when v_ligne.status = p_target then v_ligne.room_id end,
                      (select s.default_room_id from public.queue_services s
                        where s.id = v_ligne.queue_service_id));
  if v_salle is null then
    raise exception 'Choisissez la salle où le patient est attendu.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.rooms where id = v_salle and org_id = v_ligne.org_id
                    and is_active and deleted_at is null) then
    raise exception 'Cette salle est introuvable.' using errcode = '22023';
  end if;

  update public.visits v set
    status = p_target,
    room_id = v_salle,
    vitals_at = case when p_target = 'vitals' then coalesce(v.vitals_at, now()) else v.vitals_at end,
    consultation_at = case when p_target = 'consultation' then coalesce(v.consultation_at, now())
                           else v.consultation_at end,
    status_changed_at = case when p_target <> v.status then now() else v.status_changed_at end,
    last_called_at = clock_timestamp(),
    call_count = v.call_count + 1,
    called_by = auth.uid()
   where v.id = p_visit_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- « Appeler le suivant » : priorité, puis heure d'arrivée. Vers les constantes : parmi
-- ceux qui attendent ; vers la consultation : parmi ceux qui attendent ou ont eu leurs
-- constantes. Renvoie null si personne n'attend.
create function public.call_next(
  p_org_id            uuid,
  p_target            text,
  p_room_id           uuid default null,
  p_queue_service_ids uuid[] default null)
returns public.visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.queue_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas d''appeler un patient.' using errcode = '42501';
  end if;
  if not public.queue_can_write(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if p_target not in ('vitals', 'consultation') then
    raise exception 'Appel vers une étape inconnue.' using errcode = '22023';
  end if;

  select v.id into v_id
    from public.visits v
    join public.queue_priorities p on p.code = v.priority
   where v.org_id = p_org_id
     and v.visit_date = public.org_local_date(p_org_id)
     and v.deleted_at is null
     and (v.status = 'waiting' or (p_target = 'consultation' and v.status = 'vitals'))
     and (p_queue_service_ids is null or v.queue_service_id = any (p_queue_service_ids))
   order by p.rank, v.arrived_at, v.ticket_seq
   limit 1
     for update of v skip locked;

  if v_id is null then
    return null;
  end if;
  return public.call_visit(v_id, p_target, p_room_id);
end;
$$;

-- Le motif, après coup : soignants seulement.
create function public.update_visit_reason(p_visit_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.visits where id = p_visit_id and deleted_at is null;
  if v_org is null or not public.queue_can_medical(v_org) then
    raise exception 'Le motif de venue est réservé aux soignants.' using errcode = '42501';
  end if;
  if not public.queue_can_write(v_org) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Le motif ne doit pas dépasser 500 caractères.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    update public.visit_reasons set deleted_at = now()
     where visit_id = p_visit_id and deleted_at is null;
    return;
  end if;
  insert into public.visit_reasons (org_id, visit_id, reason)
  values (v_org, p_visit_id, btrim(p_reason))
  on conflict (visit_id) do update set reason = excluded.reason, deleted_at = null;
end;
$$;


-- =============================================================================
-- 5. Constantes
-- =============================================================================

create table public.vital_signs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  visit_id       uuid not null,
  patient_id     uuid not null,
  -- Bornes techniques contre les fautes de frappe (1200 au lieu de 120), pas des seuils
  -- médicaux : ceux-ci vivent dans vital_thresholds.
  weight_kg      numeric(5,2) check (weight_kg between 0.3 and 400),
  height_cm      numeric(4,1) check (height_cm between 20 and 250),
  temperature_c  numeric(3,1) check (temperature_c between 30 and 45),
  systolic       smallint check (systolic between 40 and 300),
  diastolic      smallint check (diastolic between 20 and 200),
  pulse          smallint check (pulse between 20 and 300),
  spo2           smallint check (spo2 between 40 and 100),
  glucose_g_l    numeric(4,2) check (glucose_g_l between 0.1 and 9.99),
  muac_mm        smallint check (muac_mm between 50 and 400),
  note           text check (char_length(note) <= 300),
  -- Alertes calculées par le serveur au moment de la mesure, d'après vital_thresholds.
  alerts         jsonb not null default '[]'::jsonb,
  measured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  -- Mesure annulée (erreur de saisie) : jamais effacée.
  deleted_at     timestamptz,
  void_reason    text check (char_length(void_reason) <= 200),
  constraint vital_signs_some_value check (num_nonnulls(weight_kg, height_cm, temperature_c,
    systolic, diastolic, pulse, spo2, glucose_g_l, muac_mm) > 0),
  constraint vital_signs_bp_pair check ((systolic is null) = (diastolic is null)),
  constraint vital_signs_bp_order check (systolic > diastolic),
  constraint vital_signs_void_check check ((deleted_at is null) = (void_reason is null)),
  foreign key (visit_id, org_id) references public.visits (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);

create index vital_signs_visit_idx on public.vital_signs (visit_id, measured_at desc);
create index vital_signs_patient_idx on public.vital_signs (patient_id, measured_at desc);

comment on table public.vital_signs is
  'Constantes, en ajout seul. Une mesure fausse est annulée (deleted_at + void_reason).';

-- Une mesure ne se modifie pas : seuls l'annulation et le rattachement d'une fusion passent.
create function public.vital_signs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'deleted_at', 'void_reason', 'patient_id'])
     is distinct from (to_jsonb(old) - array['updated_at', 'deleted_at', 'void_reason', 'patient_id'])
     or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Une mesure enregistrée ne se modifie pas : saisissez une nouvelle mesure.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vital_signs_guard before update on public.vital_signs
  for each row execute function public.vital_signs_guard();
create trigger vital_signs_set_updated_at before update on public.vital_signs
  for each row execute function public.set_updated_at();
create trigger vital_signs_audit after insert or update or delete on public.vital_signs
  for each row execute function public.audit_trigger_redacted('visit_id', 'patient_id');

-- Âge en mois révolus au jour donné. Sans date exacte : milieu de l'année estimée.
create function public.patient_age_months(p_patient_id uuid, p_on date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (extract(year from a) * 12 + extract(month from a))::integer
    from public.patients p,
         lateral age(p_on, coalesce(p.birth_date, make_date(p.birth_year, 7, 1))) a
   where p.id = p_patient_id;
$$;

-- Alertes : pour chaque mesure et chaque sens (trop bas / trop haut), le seuil le plus
-- grave atteint, puis le plus extrême. Exemple : 185 de systolique donne « Tension très
-- élevée » seulement, pas aussi « Tension élevée ».
create function public.vital_alerts_compute(p_org_id uuid, p_age_months integer, p_values jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'measure', a.measure, 'level', a.level, 'label', a.label,
           'value', a.valeur, 'direction', a.sens,
           'threshold', coalesce(a.below, a.at_or_above))
         order by a.level = 'alert' desc, a.sort_order), '[]'::jsonb)
    from (
      select distinct on (t.measure, case when t.below is not null then 'low' else 'high' end)
             t.measure, t.level, t.label, t.below, t.at_or_above, t.sort_order,
             (p_values ->> t.measure)::numeric as valeur,
             case when t.below is not null then 'low' else 'high' end as sens
        from public.vital_thresholds t
       where t.org_id = p_org_id and t.is_active and t.deleted_at is null
         and p_values ? t.measure and jsonb_typeof(p_values -> t.measure) = 'number'
         and (t.min_age_months is null or p_age_months >= t.min_age_months)
         and (t.max_age_months is null or p_age_months < t.max_age_months)
         and ((t.below is not null and (p_values ->> t.measure)::numeric < t.below)
              or (t.at_or_above is not null and (p_values ->> t.measure)::numeric >= t.at_or_above))
       order by t.measure, case when t.below is not null then 'low' else 'high' end,
                t.level = 'alert' desc, t.below asc nulls last, t.at_or_above desc nulls last
    ) a;
$$;

-- Aperçu des alertes pendant la saisie (même calcul que l'enregistrement).
create function public.vital_alerts(p_patient_id uuid, p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.queue_can_medical(v_org) then
    raise exception 'Les constantes sont réservées aux soignants.' using errcode = '42501';
  end if;
  return public.vital_alerts_compute(
    v_org, public.patient_age_months(p_patient_id, public.org_local_date(v_org)),
    coalesce(p_values, '{}'::jsonb));
end;
$$;

-- Enregistre une série de mesures. Clés de p_values : weight_kg, height_cm,
-- temperature_c, systolic, diastolic, pulse, spo2, glucose_g_l, muac_mm, note.
-- Un patient qui attendait passe dans la colonne « Constantes ».
create function public.save_vitals(p_visit_id uuid, p_values jsonb)
returns public.vital_signs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_visite public.visits;
  v_valeurs jsonb := coalesce(p_values, '{}'::jsonb);
  v_ligne public.vital_signs;
  v_cle   text;
begin
  select * into v_visite from public.visits
   where id = p_visit_id and deleted_at is null
     for update;
  if not found or not public.queue_can_medical(v_visite.org_id) then
    raise exception 'Les constantes sont réservées aux soignants.' using errcode = '42501';
  end if;
  if not public.queue_can_write(v_visite.org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;

  for v_cle in select jsonb_object_keys(v_valeurs) loop
    if v_cle <> 'note' and (not public.vital_measure_valid(v_cle)
                            or jsonb_typeof(v_valeurs -> v_cle) not in ('number', 'null')) then
      raise exception 'Mesure illisible : %.', v_cle using errcode = '22023';
    end if;
  end loop;
  v_valeurs := jsonb_strip_nulls(v_valeurs);

  insert into public.vital_signs (org_id, visit_id, patient_id, weight_kg, height_cm,
                                  temperature_c, systolic, diastolic, pulse, spo2,
                                  glucose_g_l, muac_mm, note, alerts)
  values (v_visite.org_id, v_visite.id, v_visite.patient_id,
          (v_valeurs ->> 'weight_kg')::numeric, (v_valeurs ->> 'height_cm')::numeric,
          (v_valeurs ->> 'temperature_c')::numeric, (v_valeurs ->> 'systolic')::numeric,
          (v_valeurs ->> 'diastolic')::numeric, (v_valeurs ->> 'pulse')::numeric,
          (v_valeurs ->> 'spo2')::numeric, (v_valeurs ->> 'glucose_g_l')::numeric,
          (v_valeurs ->> 'muac_mm')::numeric,
          nullif(btrim(coalesce(v_valeurs ->> 'note', '')), ''),
          public.vital_alerts_compute(
            v_visite.org_id,
            public.patient_age_months(v_visite.patient_id, public.org_local_date(v_visite.org_id)),
            v_valeurs - 'note'))
  returning * into v_ligne;

  if v_visite.status = 'waiting' then
    update public.visits set status = 'vitals', vitals_at = coalesce(vitals_at, now()),
                             status_changed_at = now()
     where id = v_visite.id;
  end if;
  return v_ligne;
end;
$$;

create function public.void_vitals(p_vital_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne public.vital_signs;
begin
  select * into v_ligne from public.vital_signs where id = p_vital_id for update;
  if not found or not public.queue_can_medical(v_ligne.org_id) then
    raise exception 'Les constantes sont réservées aux soignants.' using errcode = '42501';
  end if;
  if not public.queue_can_write(v_ligne.org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if v_ligne.deleted_at is not null then
    raise exception 'Cette mesure est déjà annulée.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then
    raise exception 'Indiquez pourquoi la mesure est annulée.' using errcode = '22023';
  end if;
  update public.vital_signs set deleted_at = now(), void_reason = btrim(p_reason)
   where id = p_vital_id;
end;
$$;


-- =============================================================================
-- 6. Tickets de consultation et recettes en attente
-- =============================================================================

create table public.receipt_counters (
  org_id      uuid not null references public.organizations (id),
  year        smallint not null,
  last_value  integer not null default 0,
  primary key (org_id, year)
);

comment on table public.receipt_counters is
  'Dernier numéro de reçu, par structure et par année. Serveur uniquement.';

-- Argent reçu hors de la caisse complète (étape 19), en attente de rattachement à une
-- séance de caisse. Montants en FCFA entiers.
create table public.pending_receipts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  receipt_number     text not null,
  patient_id         uuid,
  source_type        text not null check (source_type in ('consultation_ticket')),
  source_id          uuid not null,
  label              text not null,
  amount             bigint not null check (amount > 0),
  payment_method     text not null
                       check (payment_method in ('cash', 'wave', 'orange_money', 'free_money')),
  payment_reference  text check (char_length(payment_reference) <= 60),
  received_at        timestamptz not null default now(),
  received_by        uuid default auth.uid() references auth.users (id) on delete set null,
  status             text not null default 'pending'
                       check (status in ('pending', 'attached', 'cancelled')),
  -- Rempli à l'étape 19 (caisse) : séance ou écriture de caisse qui reprend la recette.
  cash_entry_id      uuid,
  attached_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint pending_receipts_number_unique unique (org_id, receipt_number),
  constraint pending_receipts_id_org_unique unique (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);

create index pending_receipts_org_status_idx
  on public.pending_receipts (org_id, status, received_at desc);

comment on table public.pending_receipts is
  'Recettes encaissées en attente de rattachement à la caisse (étape 19).';

create trigger pending_receipts_set_updated_at before update on public.pending_receipts
  for each row execute function public.set_updated_at();
create trigger pending_receipts_audit after insert or update or delete on public.pending_receipts
  for each row execute function public.audit_trigger();

create table public.consultation_tickets (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  visit_id          uuid not null,
  patient_id        uuid not null,
  service_id        uuid not null references public.services (id),
  -- Libellé et tarif du jour de la vente : un changement de tarif ne réécrit rien.
  service_label     text not null,
  unit_price        bigint not null check (unit_price >= 0),
  amount            bigint not null check (amount >= 0),
  exemption_reason  text check (char_length(exemption_reason) <= 200),
  receipt_id        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,
  constraint consultation_tickets_visit_unique unique (visit_id),
  constraint consultation_tickets_payment_check
    check ((amount = 0) = (receipt_id is null)
           and (amount = 0) = (exemption_reason is not null)),
  foreign key (visit_id, org_id) references public.visits (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (receipt_id, org_id) references public.pending_receipts (id, org_id)
);

create index consultation_tickets_org_idx on public.consultation_tickets (org_id, created_at desc);

comment on table public.consultation_tickets is
  'Tickets de consultation vendus à l''entrée (postes de santé).';

create trigger consultation_tickets_set_updated_at before update on public.consultation_tickets
  for each row execute function public.set_updated_at();
create trigger consultation_tickets_audit
  after insert or update or delete on public.consultation_tickets
  for each row execute function public.audit_trigger();

create function public.next_receipt_number(p_org_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_annee smallint := extract(year from public.org_local_date(p_org_id))::smallint;
  v_n     integer;
begin
  insert into public.receipt_counters as c (org_id, year, last_value)
  values (p_org_id, v_annee, 1)
  on conflict (org_id, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_n;
  return 'R-' || v_annee || '-' || lpad(v_n::text, greatest(6, length(v_n::text)), '0');
end;
$$;

-- Vente du ticket + arrivée dans la file, en une seule action. Tarif lu dans services ;
-- gratuité possible avec un motif (aucune règle de gratuité codée ici).
create function public.sell_consultation_ticket(
  p_org_id            uuid,
  p_patient_id        uuid,
  p_service_id        uuid,
  p_queue_service_id  uuid,
  p_priority          text default 'normal',
  p_reason            text default null,
  p_payment_method    text default 'cash',
  p_payment_reference text default null,
  p_exemption_reason  text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service  public.services;
  v_visite   public.visits;
  v_recu     public.pending_receipts;
  v_ticket   public.consultation_tickets;
  v_gratuit  boolean := nullif(btrim(coalesce(p_exemption_reason, '')), '') is not null;
begin
  if not public.has_role(p_org_id, array['owner', 'admin', 'accueil', 'caissier', 'infirmier'])
     or not public.org_has_feature(p_org_id, 'tickets_consultation')
     or not public.queue_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de vendre un ticket de consultation.'
      using errcode = '42501';
  end if;
  if not public.tickets_can_sell(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;

  select * into v_service from public.services
   where id = p_service_id and org_id = p_org_id and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez la prestation vendue.' using errcode = '22023';
  end if;
  if v_service.price is null then
    raise exception 'Le tarif de « % » n''est pas encore saisi : renseignez-le dans Paramètres, Services.',
      v_service.label using errcode = '22023';
  end if;
  if v_gratuit and char_length(btrim(p_exemption_reason)) < 3 then
    raise exception 'Précisez le motif de la gratuité.' using errcode = '22023';
  end if;
  if not v_gratuit and v_service.price = 0 then
    raise exception 'Cette prestation est à 0 FCFA : indiquez le motif de la gratuité.'
      using errcode = '22023';
  end if;
  if not v_gratuit and coalesce(p_payment_method, '') not in
       ('cash', 'wave', 'orange_money', 'free_money') then
    raise exception 'Choisissez le mode de paiement.' using errcode = '22023';
  end if;

  v_visite := public.visit_create(p_org_id, p_patient_id, p_queue_service_id, p_priority,
                                  p_reason, 'consultation_ticket');

  if not v_gratuit then
    insert into public.pending_receipts (org_id, receipt_number, patient_id, source_type,
                                         source_id, label, amount, payment_method,
                                         payment_reference)
    values (p_org_id, public.next_receipt_number(p_org_id), p_patient_id,
            'consultation_ticket', v_visite.id, 'Ticket de consultation : ' || v_service.label,
            v_service.price, p_payment_method,
            nullif(btrim(coalesce(p_payment_reference, '')), ''))
    returning * into v_recu;
  end if;

  insert into public.consultation_tickets (org_id, visit_id, patient_id, service_id,
                                           service_label, unit_price, amount,
                                           exemption_reason, receipt_id)
  values (p_org_id, v_visite.id, p_patient_id, v_service.id, v_service.label,
          v_service.price, case when v_gratuit then 0 else v_service.price end,
          case when v_gratuit then btrim(p_exemption_reason) end, v_recu.id)
  returning * into v_ticket;

  return jsonb_build_object(
    'visit_id', v_visite.id,
    'ticket_number', v_visite.ticket_number,
    'public_code', v_visite.public_code,
    'consultation_ticket_id', v_ticket.id,
    'amount', v_ticket.amount,
    'receipt_number', v_recu.receipt_number,
    'payment_method', v_recu.payment_method);
end;
$$;


-- =============================================================================
-- 7. Écran d'appel (télévision de la salle d'attente)
-- =============================================================================

create table public.display_screens (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  label              text not null check (char_length(btrim(label)) between 2 and 60),
  token_hash         text not null,
  -- Nom du canal Realtime Broadcast : secret, connu seulement d'un écran au lien valable.
  channel_topic      text not null,
  -- null : tous les services.
  queue_service_ids  uuid[],
  last_seen_at       timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint display_screens_token_unique unique (token_hash),
  constraint display_screens_topic_unique unique (channel_topic)
);

create index display_screens_org_idx on public.display_screens (org_id)
  where revoked_at is null and deleted_at is null;

comment on table public.display_screens is
  'Écrans d''appel ouverts par un lien à jeton (jeton haché, révocable).';

create trigger display_screens_set_updated_at before update on public.display_screens
  for each row execute function public.set_updated_at();
create trigger display_screens_audit after insert or update or delete on public.display_screens
  for each row execute function public.audit_trigger_redacted('label', 'revoked_at');

-- « F. N. » : jamais le nom complet à l'écran.
create function public.patient_initials(p_first_name text, p_last_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(' ',
    nullif(upper(left(btrim(coalesce(p_first_name, '')), 1)), '') || '.',
    nullif(upper(left(btrim(coalesce(p_last_name, '')), 1)), '') || '.');
$$;

-- Ce que voit l'écran pour un appel : numéro, initiales, salle, service. Rien d'autre.
create function public.display_call_payload(p_visit public.visits)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'visit_id', p_visit.id,
    'ticket_number', p_visit.ticket_number,
    'initials', public.patient_initials(p.first_name, p.last_name),
    'room', r.label,
    'service', s.label,
    'called_at', p_visit.last_called_at,
    'call_count', p_visit.call_count)
    from public.patients p
    left join public.rooms r on r.id = p_visit.room_id
    join public.queue_services s on s.id = p_visit.queue_service_id
   where p.id = p_visit.patient_id;
$$;

-- Envoi par la base sur un canal Broadcast PUBLIC (l'écran n'a pas de session) : le
-- secret est le nom du canal. Le message part à la validation de la transaction.
-- Sans Realtime (base locale de test), rien n'est envoyé.
create function public.display_send(p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
    perform realtime.send(p_payload, p_event, p_topic, false);
  end if;
end;
$$;

create function public.visits_broadcast_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ecran   record;
  v_message jsonb;
begin
  if new.last_called_at is null or new.last_called_at is not distinct from old.last_called_at then
    return null;
  end if;
  v_message := public.display_call_payload(new);
  for v_ecran in
    select d.channel_topic from public.display_screens d
     where d.org_id = new.org_id and d.revoked_at is null and d.deleted_at is null
       and (d.queue_service_ids is null or new.queue_service_id = any (d.queue_service_ids))
  loop
    perform public.display_send(v_ecran.channel_topic, 'call', v_message);
  end loop;
  return null;
end;
$$;

create trigger visits_broadcast_call
  after update of last_called_at on public.visits
  for each row execute function public.visits_broadcast_call();

-- Création : le jeton n'est rendu qu'une fois (le lien à ouvrir sur la télévision).
create function public.create_display_screen(
  p_org_id uuid, p_label text, p_queue_service_ids uuid[] default null)
returns table (id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id    uuid;
begin
  if not public.queue_can_manage(p_org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs gèrent les écrans d''appel.'
      using errcode = '42501';
  end if;
  if not public.patients_org_writable(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 2 and 60 then
    raise exception 'Donnez un nom à cet écran (par exemple « Télé de la salle d''attente »).'
      using errcode = '22023';
  end if;
  if p_queue_service_ids is not null and exists (
       select 1 from unnest(p_queue_service_ids) s(id)
        where not exists (select 1 from public.queue_services q
                           where q.id = s.id and q.org_id = p_org_id and q.deleted_at is null)) then
    raise exception 'Un des services choisis est introuvable.' using errcode = '22023';
  end if;

  insert into public.display_screens (org_id, label, token_hash, channel_topic, queue_service_ids)
  values (p_org_id, btrim(p_label), public.invitation_token_hash(v_jeton),
          'ecran-' || replace(gen_random_uuid()::text, '-', ''),
          nullif(p_queue_service_ids, '{}'))
  returning display_screens.id into v_id;

  return query select v_id, v_jeton;
end;
$$;

create function public.revoke_display_screen(p_screen_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ecran public.display_screens;
begin
  select * into v_ecran from public.display_screens
   where id = p_screen_id and deleted_at is null
     for update;
  if not found or not public.queue_can_manage(v_ecran.org_id) then
    raise exception 'Seuls le propriétaire et les administrateurs gèrent les écrans d''appel.'
      using errcode = '42501';
  end if;
  if v_ecran.revoked_at is not null then
    return;
  end if;
  update public.display_screens set revoked_at = now(), revoked_by = auth.uid()
   where id = p_screen_id;
  -- L'écran ouvert l'apprend aussitôt et s'arrête.
  perform public.display_send(v_ecran.channel_topic, 'revoked', '{}'::jsonb);
end;
$$;

-- Page publique de l'écran (sans connexion). status : valid | revoked | unavailable | unknown.
-- Rend le nom du canal et les derniers appels du jour ; appelée au démarrage, à chaque
-- reconnexion et en secours toutes les 60 s.
create function public.get_display_board(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ecran public.display_screens;
  v_org   public.organizations;
  v_jour  date;
begin
  select * into v_ecran from public.display_screens
   where token_hash = public.invitation_token_hash(p_token) and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;
  if v_ecran.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;

  select * into v_org from public.organizations where id = v_ecran.org_id;
  if v_org.deleted_at is not null or v_org.status = 'suspended'
     or not public.org_has_feature(v_org.id, 'file_attente') then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- Une écriture par minute au plus : « vu pour la dernière fois » pour l'administrateur.
  if v_ecran.last_seen_at is null or v_ecran.last_seen_at < now() - interval '1 minute' then
    update public.display_screens set last_seen_at = now() where id = v_ecran.id;
  end if;

  v_jour := public.org_local_date(v_org.id);
  return jsonb_build_object(
    'status', 'valid',
    'org_name', v_org.name,
    'screen_label', v_ecran.label,
    'topic', v_ecran.channel_topic,
    'server_time', now(),
    'calls', coalesce((
      select jsonb_agg(c.payload order by c.last_called_at desc)
        from (select public.display_call_payload(v) as payload, v.last_called_at
                from public.visits v
               where v.org_id = v_org.id and v.visit_date = v_jour
                 and v.last_called_at is not null and v.deleted_at is null
                 and (v_ecran.queue_service_ids is null
                      or v.queue_service_id = any (v_ecran.queue_service_ids))
               order by v.last_called_at desc
               limit 6) c), '[]'::jsonb));
end;
$$;


-- =============================================================================
-- 8. Suivi du ticket (QR imprimé, sans connexion)
-- =============================================================================

-- status : waiting | called | done | expired | unknown. Ni nom, ni motif.
create function public.get_ticket_public(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visite public.visits;
  v_org    public.organizations;
  v_rang   integer;
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
    return jsonb_build_object('status', 'expired', 'ticket_number', v_visite.ticket_number);
  end if;

  -- Personnes qui passeront avant, dans le même service (même ordre que call_next).
  if v_visite.status = 'waiting' then
    select count(*) into v_rang
      from public.visits v
      join public.queue_priorities p on p.code = v.priority
      join public.queue_priorities moi on moi.code = v_visite.priority
     where v.queue_service_id = v_visite.queue_service_id
       and v.visit_date = v_visite.visit_date and v.deleted_at is null
       and v.status = 'waiting' and v.id <> v_visite.id
       and (p.rank, v.arrived_at, v.ticket_seq) < (moi.rank, v_visite.arrived_at, v_visite.ticket_seq);
  end if;

  return jsonb_build_object(
    'status', case when v_visite.status = 'waiting' then 'waiting'
                   when v_visite.status in ('done', 'left') then 'done'
                   else 'called' end,
    'org_name', v_org.name,
    'ticket_number', v_visite.ticket_number,
    'service', (select label from public.queue_services where id = v_visite.queue_service_id),
    'ahead', v_rang,
    'room', (select label from public.rooms where id = v_visite.room_id),
    'arrived_at', v_visite.arrived_at);
end;
$$;


-- =============================================================================
-- 9. Tableau de la salle d'attente, fusion de dossiers
-- =============================================================================

-- Une ligne par passage du jour. Motif et alerte des constantes : soignants seulement
-- (null pour les autres rôles).
create function public.get_queue_board(p_org_id uuid, p_date date default null)
returns table (
  visit_id          uuid,
  ticket_number     text,
  status            text,
  priority          text,
  priority_label    text,
  priority_rank     smallint,
  queue_service_id  uuid,
  service_label     text,
  room_id           uuid,
  room_label        text,
  patient_id        uuid,
  file_number       text,
  last_name         text,
  first_name        text,
  sex               text,
  birth_date        date,
  birth_date_estimated boolean,
  birth_year        smallint,
  source            text,
  arrived_at        timestamptz,
  vitals_at         timestamptz,
  consultation_at   timestamptz,
  finished_at       timestamptz,
  left_at           timestamptz,
  status_changed_at timestamptz,
  last_called_at    timestamptz,
  call_count        smallint,
  has_vitals        boolean,
  vitals_level      text,
  reason            text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_medical boolean;
begin
  if not public.queue_can_read(p_org_id) then
    raise exception 'Votre rôle ne donne pas accès à la file d''attente.' using errcode = '42501';
  end if;
  v_medical := public.queue_can_medical(p_org_id);

  return query
  select v.id, v.ticket_number, v.status, v.priority, pr.label, pr.rank,
         v.queue_service_id, s.label, v.room_id, r.label,
         p.id, p.file_number, p.last_name, p.first_name, p.sex, p.birth_date,
         p.birth_date_estimated, p.birth_year, v.source,
         v.arrived_at, v.vitals_at, v.consultation_at, v.finished_at, v.left_at,
         v.status_changed_at, v.last_called_at, v.call_count,
         vs.id is not null,
         case when v_medical then
           case when vs.alerts @> '[{"level": "alert"}]' then 'alert'
                when vs.alerts @> '[{"level": "warning"}]' then 'warning' end
         end,
         case when v_medical then vr.reason end
    from public.visits v
    join public.patients p on p.id = v.patient_id
    join public.queue_priorities pr on pr.code = v.priority
    join public.queue_services s on s.id = v.queue_service_id
    left join public.rooms r on r.id = v.room_id
    left join public.visit_reasons vr on vr.visit_id = v.id and vr.deleted_at is null
    left join lateral (
      select x.id, x.alerts from public.vital_signs x
       where x.visit_id = v.id and x.deleted_at is null
       order by x.measured_at desc limit 1) vs on true
   where v.org_id = p_org_id
     and v.visit_date = coalesce(p_date, public.org_local_date(p_org_id))
     and v.deleted_at is null
   order by pr.rank, v.arrived_at, v.ticket_seq;
end;
$$;

-- Fusion de deux dossiers (merge_patients) : l'activité du doublon suit le dossier gardé.
create function public.patients_merge_relink_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  update public.visits set patient_id = new.merged_into_id where patient_id = new.id;
  update public.vital_signs set patient_id = new.merged_into_id where patient_id = new.id;
  update public.consultation_tickets set patient_id = new.merged_into_id where patient_id = new.id;
  update public.pending_receipts set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

create trigger patients_merge_relink_queue
  after update of merged_into_id on public.patients
  for each row execute function public.patients_merge_relink_queue();


-- =============================================================================
-- 10. Droits d'accès
-- =============================================================================

revoke all on
  public.queue_priorities, public.queue_service_templates, public.vital_threshold_defaults,
  public.rooms, public.queue_services, public.vital_thresholds, public.queue_counters,
  public.visits, public.visit_reasons, public.vital_signs, public.receipt_counters,
  public.pending_receipts, public.consultation_tickets, public.display_screens
from anon, authenticated;

grant select on public.queue_priorities, public.queue_service_templates,
                public.vital_threshold_defaults to authenticated;

grant select on public.rooms to authenticated;
grant insert (id, org_id, label, is_active, sort_order) on public.rooms to authenticated;
grant update (label, is_active, sort_order, deleted_at) on public.rooms to authenticated;

grant select on public.queue_services to authenticated;
grant insert (id, org_id, label, letter, default_room_id, is_active, sort_order)
  on public.queue_services to authenticated;
grant update (label, letter, default_room_id, is_active, sort_order, deleted_at)
  on public.queue_services to authenticated;

grant select on public.vital_thresholds to authenticated;
grant insert (id, org_id, measure, min_age_months, max_age_months, below, at_or_above, level,
              label, is_active, sort_order) on public.vital_thresholds to authenticated;
grant update (measure, min_age_months, max_age_months, below, at_or_above, level, label,
              is_active, sort_order, deleted_at) on public.vital_thresholds to authenticated;

-- Passages, motifs, constantes, tickets, recettes : lecture seulement, écriture par RPC.
grant select on public.visits, public.visit_reasons, public.vital_signs,
                public.consultation_tickets, public.pending_receipts to authenticated;

-- Écrans : ni le jeton haché ni le nom du canal.
grant select (id, org_id, label, queue_service_ids, last_seen_at, revoked_at, revoked_by,
              created_at, updated_at, created_by)
  on public.display_screens to authenticated;

revoke execute on function
  public.org_local_date(uuid),
  public.queue_can_read(uuid),
  public.queue_can_write(uuid),
  public.queue_can_medical(uuid),
  public.queue_can_manage(uuid),
  public.queue_can_configure(uuid),
  public.tickets_can_sell(uuid),
  public.receipts_can_read(uuid),
  public.queue_permissions(uuid),
  public.audit_trigger_redacted(),
  public.vital_measure_valid(text),
  public.seed_queue_settings(uuid),
  public.organizations_seed_queue_settings(),
  public.next_ticket_seq(uuid, date),
  public.visit_create(uuid, uuid, uuid, text, text, text),
  public.register_arrival(uuid, uuid, uuid, text, text),
  public.move_visit(uuid, text, uuid),
  public.call_visit(uuid, text, uuid),
  public.call_next(uuid, text, uuid, uuid[]),
  public.update_visit_reason(uuid, text),
  public.vital_signs_guard(),
  public.patient_age_months(uuid, date),
  public.vital_alerts_compute(uuid, integer, jsonb),
  public.vital_alerts(uuid, jsonb),
  public.save_vitals(uuid, jsonb),
  public.void_vitals(uuid, text),
  public.next_receipt_number(uuid),
  public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, text),
  public.patient_initials(text, text),
  public.display_call_payload(public.visits),
  public.display_send(text, text, jsonb),
  public.visits_broadcast_call(),
  public.create_display_screen(uuid, text, uuid[]),
  public.revoke_display_screen(uuid),
  public.get_display_board(text),
  public.get_ticket_public(text),
  public.get_queue_board(uuid, date),
  public.patients_merge_relink_queue()
from public, anon, authenticated;

-- Aides appelées par les policies, et RPC du module.
grant execute on function
  public.queue_can_read(uuid),
  public.queue_can_write(uuid),
  public.queue_can_medical(uuid),
  public.queue_can_manage(uuid),
  public.queue_can_configure(uuid),
  public.tickets_can_sell(uuid),
  public.receipts_can_read(uuid),
  public.queue_permissions(uuid),
  public.vital_measure_valid(text),
  public.register_arrival(uuid, uuid, uuid, text, text),
  public.move_visit(uuid, text, uuid),
  public.call_visit(uuid, text, uuid),
  public.call_next(uuid, text, uuid, uuid[]),
  public.update_visit_reason(uuid, text),
  public.vital_alerts(uuid, jsonb),
  public.save_vitals(uuid, jsonb),
  public.void_vitals(uuid, text),
  public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, text),
  public.create_display_screen(uuid, text, uuid[]),
  public.revoke_display_screen(uuid),
  public.get_queue_board(uuid, date)
to authenticated;

-- Écran d'appel et suivi du ticket : sans connexion.
grant execute on function
  public.get_display_board(text),
  public.get_ticket_public(text)
to anon, authenticated;


-- =============================================================================
-- 11. Row Level Security
-- =============================================================================

alter table public.queue_priorities         enable row level security;
alter table public.queue_service_templates  enable row level security;
alter table public.vital_threshold_defaults enable row level security;
alter table public.rooms                    enable row level security;
alter table public.queue_services           enable row level security;
alter table public.vital_thresholds         enable row level security;
alter table public.queue_counters           enable row level security;
alter table public.visits                   enable row level security;
alter table public.visit_reasons            enable row level security;
alter table public.vital_signs              enable row level security;
alter table public.receipt_counters         enable row level security;
alter table public.pending_receipts         enable row level security;
alter table public.consultation_tickets     enable row level security;
alter table public.display_screens          enable row level security;

-- queue_counters, receipt_counters : aucune policy, aucun droit (serveur uniquement).

create policy queue_priorities_select_all on public.queue_priorities
  for select to authenticated using (true);
create policy queue_service_templates_select_all on public.queue_service_templates
  for select to authenticated using (true);
create policy vital_threshold_defaults_select_all on public.vital_threshold_defaults
  for select to authenticated using (true);

create policy rooms_select on public.rooms
  for select to authenticated
  using (public.queue_can_read(org_id));
create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (public.queue_can_configure(org_id));
create policy rooms_update on public.rooms
  for update to authenticated
  using (public.queue_can_configure(org_id))
  with check (public.queue_can_configure(org_id));

create policy queue_services_select on public.queue_services
  for select to authenticated
  using (public.queue_can_read(org_id));
create policy queue_services_insert on public.queue_services
  for insert to authenticated
  with check (public.queue_can_configure(org_id));
create policy queue_services_update on public.queue_services
  for update to authenticated
  using (public.queue_can_configure(org_id))
  with check (public.queue_can_configure(org_id));

-- Les seuils sont lisibles par les soignants (aperçu des alertes) et par la direction.
create policy vital_thresholds_select on public.vital_thresholds
  for select to authenticated
  using (public.queue_can_medical(org_id) or public.queue_can_manage(org_id));
create policy vital_thresholds_insert on public.vital_thresholds
  for insert to authenticated
  with check (public.queue_can_configure(org_id));
create policy vital_thresholds_update on public.vital_thresholds
  for update to authenticated
  using (public.queue_can_configure(org_id))
  with check (public.queue_can_configure(org_id));

create policy visits_select on public.visits
  for select to authenticated
  using (public.queue_can_read(org_id));

create policy visit_reasons_select on public.visit_reasons
  for select to authenticated
  using (public.queue_can_medical(org_id));

create policy vital_signs_select on public.vital_signs
  for select to authenticated
  using (public.queue_can_medical(org_id));

create policy consultation_tickets_select on public.consultation_tickets
  for select to authenticated
  using (public.org_has_feature(org_id, 'tickets_consultation')
         and (public.has_role(org_id, array['owner', 'admin', 'accueil', 'caissier', 'infirmier'])
              or public.receipts_can_read(org_id)));

create policy pending_receipts_select on public.pending_receipts
  for select to authenticated
  using (public.receipts_can_read(org_id));

create policy display_screens_select on public.display_screens
  for select to authenticated
  using (public.queue_can_manage(org_id));


-- =============================================================================
-- 12. Temps réel du tableau (postgres_changes, filtré par la RLS de visits)
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.visits;
  end if;
end $$;
