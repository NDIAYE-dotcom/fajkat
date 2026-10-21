-- =============================================================================
-- Étape 15, partie B1 : consultations prénatales (CPN), socle
-- -----------------------------------------------------------------------------
-- 1. Types de consultation « cpn », « postnatal » et « accouchement », proposés aux
--    nouvelles structures et ajoutés aux structures existantes. Un rendez-vous de type
--    CPN ou postnatal choisit d'office le type de consultation (start_encounter, étape 14 :
--    même code). « Accouchement » est créé désactivé : sa saisie vient en partie D.
-- 2. Rappels : plus aucun type de rendez-vous dans les messages aux patients (« un
--    rendez-vous au poste de santé de Kolda »), sauf si le type le demande
--    (appointment_types.name_in_reminder, faux par défaut, impossible pour un type discret).
-- 3. Modèles de CPN (anc_schedule_models / anc_schedule_contacts) : âge gestationnel cible
--    et fenêtre de chaque contact. « 4 CPN » pour les postes, « 8 contacts OMS » pour les
--    cliniques, À VALIDER (docs/plus-tard.md). Choisi dans maternity_settings ; chaque
--    grossesse garde le modèle de son ouverture (un réglage changé ne vaut que pour les
--    grossesses suivantes).
-- 4. Listes paramétrables de la CPN (présentation, œdèmes, protéinurie, glycosurie) :
--    anc_option_templates recopiées par structure dans anc_options.
-- 5. anc_visits : une ligne par CPN, faite ici (une consultation de type CPN validée) ou
--    ailleurs (notée d'après le carnet : date, lieu ; comptée comme faite). Numéro de CPN
--    calculé d'office dans l'ordre des dates (une CPN faite ailleurs notée après coup prend
--    sa place, le numéro continue). Âge gestationnel du jour figé à l'enregistrement.
--    Sans doublon : poids et tension viennent des constantes du passage (vital_signs),
--    examens de encounter_tests, groupe sanguin de patient_medical.
-- 6. anc_status : CPN attendues à ce jour (fenêtre passée), faites (validées ici + faites
--    ailleurs), manquées = attendues - faites (jamais négatif), prochaine attendue. Jamais
--    le statut des rendez-vous.
-- 7. Validation : validate_encounter recopiée à l'identique (étape 14), plus le seul appel
--    à encounter_validate_extensions(consultation, brouillon), qui recopie la clé
--    « maternite » du brouillon (CPN aujourd'hui ; accouchement et postnatal plus tard).
-- 8. Droits : lecture maternity_can_read (aide-soignant compris, lecture seule), écriture
--    maternity_can_write ; aucune lecture directe d'anc_visits. Lecteur non habilité
--    (aide-soignant) : rien ne diffère selon la sensibilité d'une CPN (mêmes champs pour
--    toutes, jamais la remarque ni la consultation) ; les consultations de maternité (cpn,
--    postnatal, accouchement) lui sont masquées comme les consultations sensibles
--    (get_encounter, get_encounter_followups, patient_timeline) : examens et diagnostics
--    d'une CPN jamais vus, quel que soit le résultat. Journal sans valeur ;
--    anc_visits inscrite dans audit_medical_tables. Fusion de dossiers : anc_visits suit
--    la grossesse et la consultation, déjà rattachées au dossier gardé.
-- =============================================================================


-- =============================================================================
-- 1. Types de consultation de la maternité
-- =============================================================================

insert into public.encounter_type_templates (code, plan_code, label, is_sensitive_default,
                                             sort_order, is_active)
values
  ('cpn',          null, 'Consultation prénatale (CPN)', false, 70, true),
  ('postnatal',    null, 'Consultation postnatale',      false, 80, true),
  -- Saisie de l'accouchement : partie D. Créé désactivé d'ici là.
  ('accouchement', null, 'Accouchement',                 false, 90, false)
on conflict (code) do nothing;

-- Nouvelles structures : seed_encounter_settings (étape 14) ne recopie que les modèles
-- actifs, et seulement dans une liste vide. Ce trigger, lancé après lui (ordre
-- alphabétique des triggers), ajoute les types de la maternité qui manquent, désactivé
-- pour « accouchement ».
create function public.seed_maternity_encounter_types(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.encounter_types (org_id, template_code, label, is_sensitive_default,
                                      is_active, sort_order, created_by)
  select p_org_id, t.code, t.label, t.is_sensitive_default, t.code <> 'accouchement',
         t.sort_order, null
    from public.encounter_type_templates t
   where t.code in ('cpn', 'postnatal', 'accouchement')
     and not exists (select 1 from public.encounter_types e
                      where e.org_id = p_org_id and e.template_code = t.code);
end;
$$;

create function public.organizations_seed_maternity_encounter_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_maternity_encounter_types(new.id);
  return null;
end;
$$;

create trigger organizations_seed_zz_maternity_encounter_types
  after insert on public.organizations
  for each row execute function public.organizations_seed_maternity_encounter_types();

-- Structures existantes.
select public.seed_maternity_encounter_types(o.id) from public.organizations o;


-- =============================================================================
-- 2. Rappels sans type
-- =============================================================================

alter table public.appointment_types
  add column name_in_reminder boolean not null default false,
  add constraint appointment_types_name_in_reminder_check
    check (not (is_discreet and name_in_reminder));

comment on column public.appointment_types.name_in_reminder is
  'Nommer le type dans le rappel envoyé au patient. Faux par défaut ; jamais pour un type discret.';

grant insert (name_in_reminder) on public.appointment_types to authenticated;
grant update (name_in_reminder) on public.appointment_types to authenticated;

-- Message au patient : « un rendez-vous au poste de santé de Kolda », sans type, sauf si
-- le type le demande (jamais un type discret). Le nom de la structure est repris tel
-- quel, première lettre en minuscule quand il commence par le mot générique (« Poste de
-- santé de Kolda » -> « au poste de santé de Kolda »).
create or replace function public.appointment_patient_label(p_appointment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'un rendez-vous '
         || case
              when o.type = 'clinique' and btrim(o.name) ~* '^clinique'
                then 'à la ' || lower(left(btrim(o.name), 1)) || substr(btrim(o.name), 2)
              when o.type = 'clinique' and btrim(o.name) ~* '^cabinet'
                then 'au ' || lower(left(btrim(o.name), 1)) || substr(btrim(o.name), 2)
              when o.type = 'clinique'
                then 'à la clinique ' || btrim(o.name)
              when btrim(o.name) ~* '^poste'
                then 'au ' || lower(left(btrim(o.name), 1)) || substr(btrim(o.name), 2)
              else 'au poste de santé ' || btrim(o.name)
            end
         || case when t.name_in_reminder and not t.is_discreet then ' (' || t.label || ')' else '' end
    from public.appointments a
    join public.appointment_types t on t.id = a.appointment_type_id
    join public.organizations o on o.id = a.org_id
   where a.id = p_appointment_id;
$$;


-- =============================================================================
-- 3. Modèles de CPN
-- =============================================================================

-- Référentiel commun (super-admin, étape 31). Valeurs À VALIDER par une sage-femme.
create table public.anc_schedule_models (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null check (char_length(btrim(label)) between 2 and 80),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un contact : âge gestationnel cible et fenêtre (en jours depuis la DDR). La fenêtre
-- passée sans CPN faite compte une CPN manquée.
create table public.anc_schedule_contacts (
  id                uuid primary key default gen_random_uuid(),
  model_code        text not null references public.anc_schedule_models (code),
  contact_number    smallint not null check (contact_number between 1 and 20),
  target_ga_days    smallint not null check (target_ga_days between 0 and 310),
  window_start_days smallint not null check (window_start_days between 0 and 310),
  window_end_days   smallint not null check (window_end_days between 0 and 310),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (model_code, contact_number),
  constraint anc_schedule_contacts_window_check
    check (window_start_days <= target_ga_days and target_ga_days <= window_end_days)
);

create trigger anc_schedule_models_set_updated_at before update on public.anc_schedule_models
  for each row execute function public.set_updated_at();
create trigger anc_schedule_contacts_set_updated_at before update on public.anc_schedule_contacts
  for each row execute function public.set_updated_at();

insert into public.anc_schedule_models (code, label, sort_order) values
  ('cpn4',      '4 CPN',             10),
  ('oms2016_8', '8 contacts (OMS)',  20);

-- 4 CPN : 1er trimestre (avant 16 SA), 24-28 SA, 32 SA, 36 SA. Fenêtres contiguës.
-- 8 contacts OMS (2016) : 12, 20, 26, 30, 34, 36, 38, 40 SA.
insert into public.anc_schedule_contacts (model_code, contact_number, target_ga_days,
                                          window_start_days, window_end_days)
values
  ('cpn4', 1,  84,   0, 118),   -- 12 SA, jusqu'à 16 SA + 6 j
  ('cpn4', 2, 182, 119, 202),   -- 26 SA, de 17 SA à 28 SA + 6 j
  ('cpn4', 3, 224, 203, 244),   -- 32 SA, de 29 SA à 34 SA + 6 j
  ('cpn4', 4, 252, 245, 272),   -- 36 SA, de 35 SA à 38 SA + 6 j
  ('oms2016_8', 1,  84,   0,  90),   -- 12 SA
  ('oms2016_8', 2, 140,  91, 146),   -- 20 SA
  ('oms2016_8', 3, 182, 147, 188),   -- 26 SA
  ('oms2016_8', 4, 210, 189, 216),   -- 30 SA
  ('oms2016_8', 5, 238, 217, 244),   -- 34 SA
  ('oms2016_8', 6, 252, 245, 258),   -- 36 SA
  ('oms2016_8', 7, 266, 259, 272),   -- 38 SA
  ('oms2016_8', 8, 280, 273, 286);   -- 40 SA

alter table public.maternity_setting_defaults
  add column anc_model_code text references public.anc_schedule_models (code);
update public.maternity_setting_defaults
   set anc_model_code = case plan_code when 'clinique' then 'oms2016_8' else 'cpn4' end;
alter table public.maternity_setting_defaults alter column anc_model_code set not null;

alter table public.maternity_settings
  add column anc_model_code text references public.anc_schedule_models (code);
update public.maternity_settings s
   set anc_model_code = d.anc_model_code
  from public.organizations o
  join public.maternity_setting_defaults d on d.plan_code = o.type
 where o.id = s.org_id;
-- Une structure sans offre reconnue (aucune aujourd'hui) : modèle des postes.
update public.maternity_settings set anc_model_code = 'cpn4' where anc_model_code is null;
alter table public.maternity_settings alter column anc_model_code set not null;

grant update (anc_model_code) on public.maternity_settings to authenticated;
grant select on public.anc_schedule_models, public.anc_schedule_contacts to authenticated;

-- Identique à la partie A, plus le modèle de CPN.
create or replace function public.seed_maternity_settings(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.maternity_settings (org_id, edd_method, pregnancy_length_days,
                                         max_gestational_days, anc_model_code, created_by)
  select o.id, d.edd_method, d.pregnancy_length_days, d.max_gestational_days, d.anc_model_code,
         null
    from public.organizations o
    join public.maternity_setting_defaults d on d.plan_code = o.type
   where o.id = p_org_id
  on conflict (org_id) do nothing;
end;
$$;

-- Chaque grossesse garde le modèle de CPN de son ouverture.
alter table public.pregnancies
  add column anc_model_code text references public.anc_schedule_models (code);
update public.pregnancies g
   set anc_model_code = s.anc_model_code
  from public.maternity_settings s
 where s.org_id = g.org_id;
alter table public.pregnancies alter column anc_model_code set not null;

create function public.pregnancies_set_anc_model()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.anc_model_code is null then
    select anc_model_code into new.anc_model_code
      from public.maternity_settings where org_id = new.org_id;
  end if;
  return new;
end;
$$;

create trigger pregnancies_set_anc_model before insert on public.pregnancies
  for each row execute function public.pregnancies_set_anc_model();


-- =============================================================================
-- 4. Listes de la CPN
-- =============================================================================

create table public.anc_option_templates (
  list_code  text not null check (list_code in ('presentation', 'oedema', 'proteinuria', 'glycosuria')),
  code       text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list_code, code)
);

insert into public.anc_option_templates (list_code, code, label, sort_order) values
  ('presentation', 'cephalique',         'Céphalique',         10),
  ('presentation', 'siege',              'Siège',              20),
  ('presentation', 'transverse',         'Transverse',         30),
  ('presentation', 'non_precisee',       'Non précisée',       40),
  ('oedema',       'absents',            'Absents',            10),
  ('oedema',       'membres_inferieurs', 'Membres inférieurs', 20),
  ('oedema',       'generalises',        'Généralisés',        30),
  ('proteinuria',  'negative',           'Négative',           10),
  ('proteinuria',  'traces',             'Traces',             20),
  ('proteinuria',  'une_croix',          '+',                  30),
  ('proteinuria',  'deux_croix',         '++',                 40),
  ('proteinuria',  'trois_croix',        '+++',                50),
  ('glycosuria',   'negative',           'Négative',           10),
  ('glycosuria',   'traces',             'Traces',             20),
  ('glycosuria',   'une_croix',          '+',                  30),
  ('glycosuria',   'deux_croix',         '++',                 40),
  ('glycosuria',   'trois_croix',        '+++',                50);

-- Choix de la structure : renommés, désactivés ou ajoutés (template_code nul) par owner,
-- admin et sage-femme. Jamais supprimés : une CPN garde le libellé du jour.
create table public.anc_options (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  list_code     text not null check (list_code in ('presentation', 'oedema', 'proteinuria', 'glycosuria')),
  template_code text check (template_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label         text not null check (char_length(btrim(label)) between 1 and 60),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id)
);
create unique index anc_options_label_unique
  on public.anc_options (org_id, list_code, lower(btrim(label))) where deleted_at is null;

create trigger anc_options_set_updated_at before update on public.anc_options
  for each row execute function public.set_updated_at();
create trigger anc_options_audit after insert or update or delete on public.anc_options
  for each row execute function public.audit_trigger();
create trigger anc_options_no_delete before delete on public.anc_options
  for each row execute function public.no_delete();

-- Rejouable : n'ajoute que les choix des modèles absents de la structure.
create function public.seed_anc_options(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.anc_options (org_id, list_code, template_code, label, sort_order, created_by)
  select p_org_id, t.list_code, t.code, t.label, t.sort_order, null
    from public.anc_option_templates t
   where t.is_active
     and not exists (select 1 from public.anc_options o
                      where o.org_id = p_org_id and o.list_code = t.list_code
                        and o.template_code = t.code);
end;
$$;

create function public.organizations_seed_anc_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_anc_options(new.id);
  return null;
end;
$$;

create trigger organizations_seed_anc_options
  after insert on public.organizations
  for each row execute function public.organizations_seed_anc_options();

select public.seed_anc_options(o.id) from public.organizations o;


-- =============================================================================
-- 5. CPN
-- =============================================================================

create table public.anc_visits (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id),
  pregnancy_id          uuid not null,
  -- here : consultation CPN validée ici ; elsewhere : faite ailleurs, d'après le carnet.
  origin                text not null check (origin in ('here', 'elsewhere')),
  encounter_id          uuid,
  visit_date            date not null,
  place                 text check (char_length(btrim(place)) between 2 and 120),
  -- Âge gestationnel du jour, d'après la datation retenue au moment de l'enregistrement.
  ga_days               smallint not null check (ga_days between 0 and 330),
  fundal_height_cm      numeric(4,1) check (fundal_height_cm between 5 and 50),
  -- Bruits du cœur fœtal : null non recherchés ; faux non perçus ; vrai perçus (fréquence
  -- facultative).
  fetal_heart_heard     boolean,
  fetal_heart_rate      smallint check (fetal_heart_rate between 60 and 220),
  -- Choix des listes : identifiant et libellé du jour.
  presentation_option_id uuid,
  presentation_label    text check (char_length(presentation_label) <= 60),
  oedema_option_id      uuid,
  oedema_label          text check (char_length(oedema_label) <= 60),
  proteinuria_option_id uuid,
  proteinuria_label     text check (char_length(proteinuria_label) <= 60),
  glycosuria_option_id  uuid,
  glycosuria_label      text check (char_length(glycosuria_label) <= 60),
  note                  text check (char_length(note) <= 500),
  -- CPN faite ailleurs notée par erreur : retirée avec un motif, jamais effacée.
  removed_reason        text check (char_length(removed_reason) between 3 and 300),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  constraint anc_visits_origin_fields_check check (
    (origin = 'here' and encounter_id is not null and place is null)
    or (origin = 'elsewhere' and encounter_id is null and place is not null)),
  constraint anc_visits_removed_check check ((deleted_at is null) = (removed_reason is null)),
  constraint anc_visits_removed_origin_check check (deleted_at is null or origin = 'elsewhere'),
  constraint anc_visits_heart_check check (fetal_heart_rate is null or fetal_heart_heard),
  constraint anc_visits_encounter_unique unique (encounter_id),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (presentation_option_id, org_id) references public.anc_options (id, org_id),
  foreign key (oedema_option_id, org_id) references public.anc_options (id, org_id),
  foreign key (proteinuria_option_id, org_id) references public.anc_options (id, org_id),
  foreign key (glycosuria_option_id, org_id) references public.anc_options (id, org_id)
);
create index anc_visits_pregnancy_idx on public.anc_visits (pregnancy_id, visit_date)
  where deleted_at is null;

comment on table public.anc_visits is
  'CPN : secret médical. Aucune lecture directe (list_anc_visits, get_encounter_anc, anc_status).';

create trigger anc_visits_set_updated_at before update on public.anc_visits
  for each row execute function public.set_updated_at();

-- Une CPN faite ici s'ajoute seulement pendant la validation de sa consultation ; ensuite
-- figée. Une CPN faite ailleurs ne change que pour être retirée (motif).
create function public.anc_visits_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'here'
       and (select status from public.encounters where id = new.encounter_id) is distinct from 'draft' then
      raise exception 'Consultation validée : ajoutez un avenant.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Une CPN ne se supprime jamais.' using errcode = '42501';
  end if;
  if old.origin = 'elsewhere' and old.deleted_at is null and new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'CPN enregistrée : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger anc_visits_guard before insert or update or delete on public.anc_visits
  for each row execute function public.anc_visits_guard();

-- Journal : noms des champs seulement, jamais les valeurs.
create trigger anc_visits_audit after insert or update on public.anc_visits
  for each row execute function public.audit_trigger_redacted('pregnancy_id', 'encounter_id');

insert into public.audit_medical_tables (table_name) values ('anc_visits') on conflict do nothing;


-- =============================================================================
-- 6. Calculs
-- =============================================================================

-- CPN faites d'une grossesse, numérotées dans l'ordre des dates. Interne.
create function public.anc_visits_numbered(p_pregnancy_id uuid)
returns table (id uuid, anc_number integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, (row_number() over (order by v.visit_date, v.created_at, v.id))::integer
    from public.anc_visits v
   where v.pregnancy_id = p_pregnancy_id and v.deleted_at is null;
$$;

-- Bilan des CPN d'une grossesse, sans contrôle de droits. Interne.
--   expected : contacts du modèle dont la fenêtre est passée ;
--   done     : CPN faites ici (validées) ou ailleurs (carnet) ;
--   missed   : expected - done, jamais négatif ;
--   next     : prochain contact attendu, numéro de CPN qu'elle portera, dates cible et
--              fenêtre (null au-delà du dernier contact, ou grossesse terminée).
create function public.anc_status_compute(p_pregnancy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_g        public.pregnancies;
  v_ref      date;
  v_today    date;
  v_ga       integer;
  v_done     integer;
  v_here     integer;
  v_expected integer;
  v_total    integer;
  v_next     public.anc_schedule_contacts;
begin
  select * into v_g from public.pregnancies where id = p_pregnancy_id;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  v_today := public.org_local_date(v_g.org_id);
  v_ga := v_today - v_ref;

  select count(*), count(*) filter (where origin = 'here')
    into v_done, v_here
    from public.anc_visits where pregnancy_id = v_g.id and deleted_at is null;
  select count(*), count(*) filter (where window_end_days < v_ga)
    into v_total, v_expected
    from public.anc_schedule_contacts where model_code = v_g.anc_model_code;

  if v_g.status = 'ongoing' then
    -- Le contact en cours (ou à venir), mais jamais avant le rang des CPN déjà faites.
    select * into v_next from public.anc_schedule_contacts
     where model_code = v_g.anc_model_code
       and contact_number > v_done
       and window_end_days >= v_ga
     order by contact_number
     limit 1;
  end if;

  return jsonb_build_object(
    'pregnancy_id', v_g.id,
    'model_code', v_g.anc_model_code,
    'model_label', (select label from public.anc_schedule_models where code = v_g.anc_model_code),
    'contacts_total', v_total,
    'ga_days', case when v_g.status = 'ongoing' then v_ga end,
    'expected', case when v_g.status = 'ongoing' then v_expected end,
    'done', v_done,
    'done_here', v_here,
    'done_elsewhere', v_done - v_here,
    'missed', case when v_g.status = 'ongoing' then greatest(v_expected - v_done, 0) end,
    'next', case when v_next.id is not null then jsonb_build_object(
      'contact_number', v_next.contact_number,
      'anc_number', v_done + 1,
      'target_ga_days', v_next.target_ga_days,
      'target_date', greatest(v_ref + v_next.target_ga_days, v_today),
      'window_start_date', v_ref + v_next.window_start_days,
      'window_end_date', v_ref + v_next.window_end_days) end);
end;
$$;

-- Constantes du passage d'une consultation : dernière mesure non annulée de chaque valeur.
-- Interne.
create function public.encounter_anc_vitals(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'weight_kg', (select s.weight_kg from public.vital_signs s
                   where s.visit_id = p_visit_id and s.deleted_at is null
                     and s.weight_kg is not null
                   order by s.measured_at desc, s.id limit 1),
    'systolic', (select s.systolic from public.vital_signs s
                  where s.visit_id = p_visit_id and s.deleted_at is null
                    and s.systolic is not null
                  order by s.measured_at desc, s.id limit 1),
    'diastolic', (select s.diastolic from public.vital_signs s
                   where s.visit_id = p_visit_id and s.deleted_at is null
                     and s.systolic is not null
                   order by s.measured_at desc, s.id limit 1));
$$;


-- =============================================================================
-- 7. Validation : extensions de la consultation
-- =============================================================================

-- Choix d'une liste de la CPN depuis le brouillon : identifiant de la structure, actif.
-- Renvoie la ligne (null si rien n'est choisi). Interne.
create function public.anc_option_from_draft(p_org_id uuid, p_list text, p_value text, p_label text)
returns public.anc_options
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.anc_options;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return null;
  end if;
  select * into v_o from public.anc_options
   where id = public.try_uuid(p_value) and org_id = p_org_id and list_code = p_list
     and deleted_at is null;
  if v_o.id is null then
    raise exception '% : choisissez dans la liste.', p_label using errcode = '22023';
  end if;
  return v_o;
end;
$$;

-- CPN faite ici : recopiée du brouillon (clé « maternite ») à la validation. Interne.
create function public.anc_visit_from_encounter(p_enc public.encounters, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m       jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  v_g       public.pregnancies;
  v_d       public.pregnancy_datings;
  v_max     integer;
  v_date    date;
  v_ga      integer;
  v_heard   boolean;
  v_rate    smallint;
  v_pres    public.anc_options;
  v_oed     public.anc_options;
  v_prot    public.anc_options;
  v_glyc    public.anc_options;
begin
  perform public.maternity_assert_write(p_enc.org_id);
  select * into v_g from public.pregnancies
   where patient_id = p_enc.patient_id and status = 'ongoing' and deleted_at is null
     for update;
  if v_g.id is null then
    raise exception 'Aucune grossesse en cours pour cette patiente : ouvrez le suivi de grossesse (onglet Grossesse), ou changez le type de consultation.'
      using errcode = '22023';
  end if;
  select * into v_d from public.pregnancy_datings where id = v_g.current_dating_id;
  select max_gestational_days into v_max from public.maternity_settings where org_id = p_enc.org_id;

  v_date := (p_enc.started_at at time zone
             coalesce((select timezone from public.organizations where id = p_enc.org_id),
                      'Africa/Dakar'))::date;
  v_ga := v_date - v_d.reference_date;
  if v_ga < 0 or v_ga > v_max then
    raise exception 'D''après la datation retenue, la grossesse aurait % SA le jour de cette CPN : vérifiez la datation.',
      v_ga / 7 using errcode = '22023';
  end if;

  v_heard := case when jsonb_typeof(v_m -> 'fetal_heart_heard') = 'boolean'
                  then (v_m ->> 'fetal_heart_heard')::boolean end;
  v_rate := public.encounter_number(v_m, 'fetal_heart_rate', 60, 220,
                                    'Bruits du cœur fœtal (battements par minute)')::smallint;
  if v_rate is not null and v_heard is distinct from true then
    raise exception 'Bruits du cœur fœtal : indiquez qu''ils sont perçus avant leur fréquence.'
      using errcode = '22023';
  end if;
  v_pres := public.anc_option_from_draft(p_enc.org_id, 'presentation', v_m ->> 'presentation_option_id', 'Présentation');
  v_oed  := public.anc_option_from_draft(p_enc.org_id, 'oedema', v_m ->> 'oedema_option_id', 'Œdèmes');
  v_prot := public.anc_option_from_draft(p_enc.org_id, 'proteinuria', v_m ->> 'proteinuria_option_id', 'Protéinurie');
  v_glyc := public.anc_option_from_draft(p_enc.org_id, 'glycosuria', v_m ->> 'glycosuria_option_id', 'Glycosurie');

  insert into public.anc_visits (org_id, pregnancy_id, origin, encounter_id, visit_date, ga_days,
                                 fundal_height_cm, fetal_heart_heard, fetal_heart_rate,
                                 presentation_option_id, presentation_label, oedema_option_id,
                                 oedema_label, proteinuria_option_id, proteinuria_label,
                                 glycosuria_option_id, glycosuria_label, note)
  values (p_enc.org_id, v_g.id, 'here', p_enc.id, v_date, v_ga,
          public.encounter_number(v_m, 'fundal_height_cm', 5, 50, 'Hauteur utérine (cm)'),
          v_heard, v_rate,
          v_pres.id, v_pres.label, v_oed.id, v_oed.label, v_prot.id, v_prot.label,
          v_glyc.id, v_glyc.label,
          public.encounter_text(v_m, 'note', 500, 'Remarque de la CPN'));
end;
$$;

-- Extensions de la consultation, selon son type : la CPN aujourd'hui ; l'accouchement et
-- le postnatal (parties D et F) s'ajouteront ici. Appelée par validate_encounter avant
-- que la consultation ne soit figée. Interne.
create function public.encounter_validate_extensions(p_enc public.encounters, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  select template_code into v_code from public.encounter_types where id = p_enc.encounter_type_id;
  if v_code = 'cpn' then
    perform public.anc_visit_from_encounter(p_enc, p_data -> 'maternite');
  end if;
end;
$$;

-- Remplace validate_encounter de l'étape 14 (20261020090000_etape14_consultations.sql) :
-- recopie à l'identique, plus le seul appel à encounter_validate_extensions.
create or replace function public.validate_encounter(p_encounter_id uuid, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc       public.encounters;
  v_data      jsonb;
  v_item      jsonb;
  v_n         integer := 0;
  v_cat       public.diagnoses_catalog;
  v_test      public.rapid_test_types;
  v_label     text;
  v_rang      text;
  v_principal integer := 0;
  v_diag_id   uuid;
  v_alerte    uuid;
  v_motif     text;
  v_sensible  boolean;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  perform public.encounter_assert_author(v_enc, p_version);
  v_data := coalesce(v_enc.draft_data, '{}'::jsonb);

  v_motif := public.encounter_text(v_data, 'reason', 500, 'Motif');
  if v_motif is null then
    raise exception 'Indiquez le motif de la consultation.' using errcode = '22023';
  end if;

  -- Diagnostics
  if jsonb_array_length(public.jsonb_array_or_empty(v_data -> 'diagnoses')) > 10 then
    raise exception '10 diagnostics au plus.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(public.jsonb_array_or_empty(v_data -> 'diagnoses')) loop
    v_n := v_n + 1;
    v_rang := coalesce(v_item ->> 'rank', 'secondary');
    if v_rang not in ('primary', 'secondary') then
      raise exception 'Diagnostic % : principal ou secondaire.', v_n using errcode = '22023';
    end if;
    if v_rang = 'primary' then
      v_principal := v_principal + 1;
      if v_principal > 1 then
        raise exception 'Choisissez un seul diagnostic principal.' using errcode = '22023';
      end if;
    end if;
    v_cat := null;
    if public.try_uuid(v_item ->> 'catalog_id') is not null then
      select * into v_cat from public.diagnoses_catalog
       where id = public.try_uuid(v_item ->> 'catalog_id') and deleted_at is null
         and (org_id is null or org_id = v_enc.org_id);
      if not found then
        raise exception 'Diagnostic % : introuvable dans le catalogue.', v_n using errcode = '22023';
      end if;
    end if;
    v_label := coalesce(v_cat.label, public.encounter_text(v_item, 'label', 200, 'Diagnostic ' || v_n));
    if v_label is null or char_length(v_label) < 2 then
      raise exception 'Diagnostic % : écrivez son libellé.', v_n using errcode = '22023';
    end if;
    insert into public.diagnoses (org_id, encounter_id, catalog_id, code, label, rank,
                                  is_sensitive, is_notifiable, notification_delay, sort_order)
    values (v_enc.org_id, v_enc.id, v_cat.id,
            coalesce(v_cat.code, public.encounter_text(v_item, 'code', 10, 'Code du diagnostic ' || v_n)),
            v_label, v_rang, coalesce(v_cat.is_sensitive, false),
            coalesce(v_cat.is_notifiable, false), v_cat.notification_delay, v_n)
    returning id into v_diag_id;
    if v_cat.is_notifiable then
      insert into public.surveillance_alerts (org_id, encounter_id, diagnosis_id, patient_id,
                                              code, label, notification_delay)
      values (v_enc.org_id, v_enc.id, v_diag_id, v_enc.patient_id, v_cat.code, v_cat.label,
              v_cat.notification_delay)
      returning id into v_alerte;
      if v_cat.notification_delay = 'immediate' then
        perform public.surveillance_notify_immediate(v_enc.org_id, v_alerte, v_cat.label);
      end if;
    end if;
  end loop;
  if v_n > 0 and v_principal <> 1 then
    raise exception 'Choisissez un seul diagnostic principal.' using errcode = '22023';
  end if;

  -- Examens rapides
  v_n := 0;
  if jsonb_array_length(public.jsonb_array_or_empty(v_data -> 'tests')) > 20 then
    raise exception '20 examens rapides au plus.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(public.jsonb_array_or_empty(v_data -> 'tests')) loop
    v_n := v_n + 1;
    select * into v_test from public.rapid_test_types
     where id = public.try_uuid(v_item ->> 'rapid_test_type_id') and org_id = v_enc.org_id;
    if not found then
      raise exception 'Examen rapide % : choisissez l''examen.', v_n using errcode = '22023';
    end if;
    if v_test.result_kind = 'binary'
       and coalesce(v_item ->> 'result', '') not in ('positive', 'negative', 'invalid') then
      raise exception '% : choisissez le résultat.', v_test.label using errcode = '22023';
    end if;
    if v_test.result_kind in ('number', 'text')
       and nullif(btrim(coalesce(v_item ->> 'value', '')), '') is null then
      raise exception '% : saisissez le résultat.', v_test.label using errcode = '22023';
    end if;
    insert into public.encounter_tests (org_id, encounter_id, rapid_test_type_id, label,
                                        result_kind, result, value_number, value_text, unit,
                                        note, is_sensitive, sort_order)
    values (v_enc.org_id, v_enc.id, v_test.id, v_test.label, v_test.result_kind,
            case when v_test.result_kind = 'binary' then v_item ->> 'result' end,
            case when v_test.result_kind = 'number'
                 then public.encounter_number(v_item, 'value', -100000, 100000, v_test.label) end,
            case when v_test.result_kind = 'text'
                 then public.encounter_text(v_item, 'value', 200, v_test.label) end,
            v_test.unit, public.encounter_text(v_item, 'note', 300, v_test.label || ' (note)'),
            v_test.is_sensitive, v_n);
  end loop;

  -- Ordonnance (texte libre ; catalogue de la pharmacie à l'étape 17)
  perform public.encounter_insert_prescription(
    v_enc, v_data #>> '{prescription,note}', v_data #> '{prescription,items}');

  -- Extensions selon le type (CPN…), avant que la consultation ne soit figée.
  perform public.encounter_validate_extensions(v_enc, v_data);

  v_sensible := v_enc.is_sensitive
                or public.encounter_draft_sensitive(v_enc.org_id, v_enc.encounter_type_id, v_data);

  update public.encounters
     set status = 'validated', validated_at = now(), validated_by = auth.uid(),
         reason = v_motif,
         history = public.encounter_text(v_data, 'history', 4000, 'Histoire de la maladie'),
         examination = public.encounter_text(v_data, 'examination', 4000, 'Examen clinique'),
         plan = public.encounter_text(v_data, 'plan', 4000, 'Conduite à tenir'),
         is_sensitive = v_sensible, draft_data = null, version = version + 1
   where id = v_enc.id
  returning * into v_enc;

  return public.encounter_header(v_enc);
end;
$$;


-- =============================================================================
-- 8. Fonctions appelées par le client
-- =============================================================================

-- CPN faite ailleurs, notée d'après le carnet : date, lieu, remarque. Comptée comme faite.
create function public.add_external_anc_visit(
  p_pregnancy_id uuid, p_visit_date date, p_place text, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g     public.pregnancies;
  v_d     public.pregnancy_datings;
  v_max   integer;
  v_ga    integer;
  v_lieu  text := nullif(btrim(coalesce(p_place, '')), '');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_id    uuid;
begin
  v_g := public.pregnancy_for_write(p_pregnancy_id);
  select * into v_d from public.pregnancy_datings where id = v_g.current_dating_id;
  select max_gestational_days into v_max from public.maternity_settings where org_id = v_g.org_id;
  if p_visit_date is null then
    raise exception 'Indiquez la date de la CPN, d''après le carnet.' using errcode = '22023';
  end if;
  if p_visit_date > public.org_local_date(v_g.org_id) then
    raise exception 'La date de la CPN ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  v_ga := p_visit_date - v_d.reference_date;
  if v_ga < 0 then
    raise exception 'Cette date est avant le début de la grossesse d''après la datation retenue : vérifiez la date.'
      using errcode = '22023';
  end if;
  if v_ga > v_max then
    raise exception 'D''après la datation retenue, la grossesse aurait % SA à cette date : vérifiez la date.',
      v_ga / 7 using errcode = '22023';
  end if;
  if v_lieu is null or char_length(v_lieu) < 2 then
    raise exception 'Indiquez où la CPN a été faite.' using errcode = '22023';
  end if;
  if char_length(v_lieu) > 120 then
    raise exception 'Lieu : 120 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Remarque : 500 caractères au plus.' using errcode = '22023';
  end if;
  if exists (select 1 from public.anc_visits
              where pregnancy_id = v_g.id and visit_date = p_visit_date and deleted_at is null) then
    raise exception 'Une CPN est déjà notée à cette date pour cette grossesse.' using errcode = '22023';
  end if;
  insert into public.anc_visits (org_id, pregnancy_id, origin, visit_date, place, ga_days, note)
  values (v_g.org_id, v_g.id, 'elsewhere', p_visit_date, v_lieu, v_ga, v_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- CPN faite ailleurs notée par erreur : retirée avec un motif. Une CPN faite ici fait
-- partie de sa consultation validée : elle se corrige par un avenant.
create function public.remove_external_anc_visit(p_anc_visit_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.anc_visits;
begin
  select * into v_a from public.anc_visits where id = p_anc_visit_id and deleted_at is null;
  if v_a.id is null then
    raise exception 'CPN introuvable.' using errcode = '22023';
  end if;
  perform public.pregnancy_for_write(v_a.pregnancy_id);
  if v_a.origin <> 'elsewhere' then
    raise exception 'Une CPN faite ici se corrige par un avenant à sa consultation.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi cette CPN est retirée.' using errcode = '22023';
  end if;
  update public.anc_visits
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_a.id;
end;
$$;

-- Bilan des CPN d'une grossesse (anc_status_compute), pour les rôles médicaux.
create function public.anc_status(p_pregnancy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.pregnancies where id = p_pregnancy_id and deleted_at is null;
  if v_org is null or not public.maternity_can_read(v_org) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  return public.anc_status_compute(p_pregnancy_id);
end;
$$;

-- Tableau des CPN d'une grossesse (onglet Grossesse), dans l'ordre des dates. Poids et
-- tension : constantes du passage de la consultation. Lecteur non habilité (aide-soignant) :
-- mêmes champs pour toutes les CPN, sensibles ou non (mesures obstétricales), jamais la
-- remarque ni la consultation : rien ne trahit une CPN sensible.
create function public.list_anc_visits(p_pregnancy_id uuid)
returns table (
  id                uuid,
  anc_number        integer,
  origin            text,
  visit_date        date,
  place             text,
  ga_days           smallint,
  encounter_id      uuid,
  weight_kg         numeric,
  systolic          smallint,
  diastolic         smallint,
  fundal_height_cm  numeric,
  fetal_heart_heard boolean,
  fetal_heart_rate  smallint,
  presentation      text,
  oedema            text,
  proteinuria       text,
  glycosuria        text,
  note              text,
  author_name       text,
  created_at        timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org      uuid;
  v_habilite boolean;
begin
  select org_id into v_org from public.pregnancies where id = p_pregnancy_id and deleted_at is null;
  if v_org is null or not public.maternity_can_read(v_org) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  v_habilite := public.encounters_can_write(v_org);
  return query
    select a.id, n.anc_number, a.origin, a.visit_date, a.place, a.ga_days,
           case when v_habilite then a.encounter_id end,
           (cv.c ->> 'weight_kg')::numeric, (cv.c ->> 'systolic')::smallint,
           (cv.c ->> 'diastolic')::smallint,
           a.fundal_height_cm, a.fetal_heart_heard, a.fetal_heart_rate, a.presentation_label,
           a.oedema_label, a.proteinuria_label, a.glycosuria_label,
           case when v_habilite then a.note end,
           public.user_display_name(coalesce(e.validated_by, a.created_by)),
           a.created_at
      from public.anc_visits a
      join public.anc_visits_numbered(p_pregnancy_id) n on n.id = a.id
      left join public.encounters e on e.id = a.encounter_id
      left join lateral (select public.encounter_anc_vitals(e.visit_id) as c
                          where e.visit_id is not null) cv on true
     order by n.anc_number;
end;
$$;

-- Section CPN d'une consultation : grossesse en cours, numéro que portera cette CPN (ou
-- qu'elle porte), constantes du passage, bilan des CPN ; valeurs enregistrées si la
-- consultation est validée. is_anc faux : la consultation n'est pas de type CPN.
create function public.get_encounter_anc(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc  public.encounters;
  v_code text;
  v_g    public.pregnancies;
  v_d    public.pregnancy_datings;
  v_a    public.anc_visits;
  v_num  integer;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  -- Saisie et lecture de la CPN dans la consultation : soignants habilités seulement
  -- (l'aide-soignant lit les CPN dans l'onglet Grossesse, list_anc_visits).
  if not found or not public.encounters_can_write(v_enc.org_id) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;
  if not public.maternity_can_read(v_enc.org_id) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  select template_code into v_code from public.encounter_types where id = v_enc.encounter_type_id;

  select * into v_a from public.anc_visits where encounter_id = v_enc.id;
  if v_a.id is not null then
    select * into v_g from public.pregnancies where id = v_a.pregnancy_id;
    select anc_number into v_num from public.anc_visits_numbered(v_g.id) where id = v_a.id;
  else
    select * into v_g from public.pregnancies
     where patient_id = v_enc.patient_id and status = 'ongoing' and deleted_at is null;
    if v_g.id is not null then
      v_num := (select count(*) from public.anc_visits
                 where pregnancy_id = v_g.id and deleted_at is null) + 1;
    end if;
  end if;
  if v_g.id is not null then
    select * into v_d from public.pregnancy_datings where id = v_g.current_dating_id;
  end if;

  return jsonb_build_object(
    'is_anc', coalesce(v_code = 'cpn', false),
    'pregnancy', case when v_g.id is not null then jsonb_build_object(
      'id', v_g.id, 'status', v_g.status, 'edd', v_d.edd,
      'ga_days', case when v_a.id is not null then v_a.ga_days
                      else public.org_local_date(v_g.org_id) - v_d.reference_date end) end,
    'anc_number', v_num,
    'vitals', case when v_enc.visit_id is not null then public.encounter_anc_vitals(v_enc.visit_id) end,
    'status', case when v_g.id is not null then public.anc_status_compute(v_g.id) end,
    'visit', case when v_a.id is not null then jsonb_build_object(
      'visit_date', v_a.visit_date, 'ga_days', v_a.ga_days,
      'fundal_height_cm', v_a.fundal_height_cm, 'fetal_heart_heard', v_a.fetal_heart_heard,
      'fetal_heart_rate', v_a.fetal_heart_rate, 'presentation', v_a.presentation_label,
      'oedema', v_a.oedema_label, 'proteinuria', v_a.proteinuria_label,
      'glycosuria', v_a.glycosuria_label, 'note', v_a.note) end);
end;
$$;


-- =============================================================================
-- 9. Consultations de maternité masquées au lecteur non habilité
-- =============================================================================

-- Type de consultation de la maternité (codes des modèles, comme
-- encounter_validate_extensions). Interne.
create function public.encounter_type_is_maternity(p_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.template_code in ('cpn', 'postnatal', 'accouchement')
                     from public.encounter_types t where t.id = p_type_id), false);
$$;

-- Consultation masquée à l'utilisateur connecté : sensible, ou de maternité, pour qui ne
-- lit pas le sensible (aide-soignant, owner ou admin qui exerce sans être habilité…).
-- Les informations de maternité se lisent dans l'onglet Grossesse, identiques pour toutes
-- les CPN. Interne.
create function public.encounter_reader_hidden(p_enc public.encounters)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.encounters_can_write(p_enc.org_id)
     and (p_enc.is_sensitive or public.encounter_type_is_maternity(p_enc.encounter_type_id));
$$;

-- get_encounter (étape 14 C), get_encounter_followups (14 G), patient_timeline (14 F) :
-- recopies à l'identique, sauf la condition de masquage (encounter_reader_hidden).

create or replace function public.get_encounter(p_encounter_id uuid, p_opening_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_res jsonb;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  if not found or not public.encounters_can_read(v_enc.org_id) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;
  -- Consultation sensible, ou de maternité (étape 15), et utilisateur non habilité : même
  -- réponse qu'une consultation inexistante, rien ne révèle qu'elle existe.
  if public.encounter_reader_hidden(v_enc) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;

  v_res := public.encounter_header(v_enc);
  -- Brouillon d'un autre soignant : en-tête seulement (qui, depuis quand), pour la reprise.
  if v_enc.status = 'draft' and v_enc.author_id is distinct from auth.uid() then
    return v_res;
  end if;
  -- Contenu d'une consultation sensible rendu (validée, ou brouillon de son auteur) :
  -- une ligne par ouverture.
  if v_enc.is_sensitive then
    perform public.log_sensitive_opening(v_enc.org_id, 'encounters', v_enc.id, v_enc.patient_id,
                                         p_opening_id);
  end if;
  if v_enc.status = 'draft' then
    v_res := v_res || jsonb_build_object('draft_data', v_enc.draft_data);
  else
    v_res := v_res || jsonb_build_object(
      'reason', v_enc.reason, 'history', v_enc.history, 'examination', v_enc.examination,
      'plan', v_enc.plan,
      'diagnoses', coalesce((select jsonb_agg(jsonb_build_object(
          'id', d.id, 'catalog_id', d.catalog_id, 'code', d.code, 'label', d.label,
          'rank', d.rank, 'is_notifiable', d.is_notifiable,
          'notification_delay', d.notification_delay) order by d.rank, d.sort_order)
        from public.diagnoses d where d.encounter_id = v_enc.id), '[]'::jsonb),
      'tests', coalesce((select jsonb_agg(jsonb_build_object(
          'id', t.id, 'label', t.label, 'result_kind', t.result_kind, 'result', t.result,
          'value_number', t.value_number, 'value_text', t.value_text, 'unit', t.unit,
          'note', t.note) order by t.sort_order)
        from public.encounter_tests t where t.encounter_id = v_enc.id), '[]'::jsonb),
      'addenda', coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id, 'body', a.body, 'created_at', a.created_at,
          'author_name', public.user_display_name(a.created_by)) order by a.created_at)
        from public.encounter_addenda a where a.encounter_id = v_enc.id), '[]'::jsonb));
  end if;

  -- Documents (ordonnances, références, certificats), constantes du passage, reprises.
  return v_res || jsonb_build_object(
    'prescriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'prescribed_at', p.prescribed_at, 'note', p.note,
        'prescriber_name', public.user_display_name(p.prescribed_by),
        'items', (select coalesce(jsonb_agg(to_jsonb(i) - 'org_id' - 'created_by' - 'updated_at'
                                            - 'deleted_at' order by i.sort_order), '[]'::jsonb)
                    from public.prescription_items i where i.prescription_id = p.id))
        order by p.prescribed_at)
      from public.prescriptions p where p.encounter_id = v_enc.id), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(to_jsonb(r) - 'org_id' - 'created_by' - 'deleted_at'
        || jsonb_build_object('referrer_name', public.user_display_name(r.referred_by))
        order by r.referred_at)
      from public.referrals r where r.encounter_id = v_enc.id), '[]'::jsonb),
    'certificates', coalesce((select jsonb_agg(to_jsonb(c) - 'org_id' - 'created_by' - 'deleted_at'
        || jsonb_build_object('issuer_name', public.user_display_name(c.issued_by))
        order by c.issued_at)
      from public.certificates c where c.encounter_id = v_enc.id), '[]'::jsonb),
    'vitals', coalesce((select jsonb_agg(to_jsonb(s) - 'org_id' - 'created_by' - 'updated_at'
        - 'deleted_at' - 'void_reason' order by s.measured_at)
      from public.vital_signs s
     where v_enc.visit_id is not null and s.visit_id = v_enc.visit_id and s.deleted_at is null), '[]'::jsonb),
    'handovers', coalesce((select jsonb_agg(jsonb_build_object(
        'from_name', case when h.from_user_id is not null then public.user_display_name(h.from_user_id) end,
        'to_name', public.user_display_name(h.to_user_id), 'created_at', h.created_at)
        order by h.created_at)
      from public.encounter_handovers h where h.encounter_id = v_enc.id), '[]'::jsonb));
end;
$$;

create or replace function public.get_encounter_followups(p_encounter_id uuid)
returns table (
  appointment_id    uuid,
  starts_at         timestamptz,
  status            text,
  type_label        text,
  practitioner_name text,
  rescheduled       boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  if not found or not public.encounters_can_read(v_enc.org_id)
     or public.encounter_reader_hidden(v_enc) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;
  return query
    with recursive chaine (origine, rdv, suivant) as (
      select f.appointment_id, a.id, a.rescheduled_to_id
        from public.encounter_followups f
        join public.appointments a on a.id = f.appointment_id
       where f.encounter_id = v_enc.id and f.deleted_at is null
      union all
      select c.origine, a.id, a.rescheduled_to_id
        from chaine c join public.appointments a on a.id = c.suivant
    )
    select a.id, a.starts_at, a.status,
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           case when m.user_id is not null then public.user_display_name(m.user_id) end,
           a.id <> c.origine
      from chaine c
      join public.appointments a on a.id = c.rdv
      left join public.memberships m on m.id = a.practitioner_membership_id
     where c.suivant is null and a.deleted_at is null
     order by a.starts_at;
end;
$$;

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
       -- Non habilité : ni consultation sensible, ni consultation de maternité (étape 15).
       and (v_sensible or not (e.is_sensitive or public.encounter_type_is_maternity(e.encounter_type_id)))
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
-- 10. Droits d'accès
-- =============================================================================

revoke all on public.anc_schedule_models, public.anc_schedule_contacts,
              public.anc_option_templates, public.anc_options, public.anc_visits
from anon, authenticated;

-- Référentiels et listes : lus par les membres (aucune donnée de patient) ; listes de la
-- structure modifiées par owner, admin et sage-femme. CPN : aucun accès direct.
grant select on public.anc_schedule_models, public.anc_schedule_contacts,
                public.anc_option_templates, public.anc_options to authenticated;
grant insert (org_id, list_code, label, sort_order) on public.anc_options to authenticated;
grant update (label, is_active, sort_order) on public.anc_options to authenticated;

alter table public.anc_schedule_models   enable row level security;
alter table public.anc_schedule_contacts enable row level security;
alter table public.anc_option_templates  enable row level security;
alter table public.anc_options           enable row level security;
alter table public.anc_visits            enable row level security;

create policy anc_schedule_models_select on public.anc_schedule_models
  for select to authenticated using (true);
create policy anc_schedule_contacts_select on public.anc_schedule_contacts
  for select to authenticated using (true);
create policy anc_option_templates_select on public.anc_option_templates
  for select to authenticated using (true);
create policy anc_options_select on public.anc_options
  for select to authenticated using (public.is_member(org_id));
create policy anc_options_insert on public.anc_options
  for insert to authenticated with check (public.maternity_can_configure(org_id));
create policy anc_options_update on public.anc_options
  for update to authenticated
  using (public.maternity_can_configure(org_id))
  with check (public.maternity_can_configure(org_id));

-- Fonctions internes : jamais appelées par le client.
revoke execute on function
  public.seed_maternity_encounter_types(uuid), public.organizations_seed_maternity_encounter_types(),
  public.pregnancies_set_anc_model(), public.seed_anc_options(uuid),
  public.organizations_seed_anc_options(), public.anc_visits_guard(),
  public.anc_visits_numbered(uuid), public.anc_status_compute(uuid),
  public.encounter_anc_vitals(uuid), public.anc_option_from_draft(uuid, text, text, text),
  public.anc_visit_from_encounter(public.encounters, jsonb),
  public.encounter_validate_extensions(public.encounters, jsonb),
  public.encounter_type_is_maternity(uuid), public.encounter_reader_hidden(public.encounters)
from public, anon, authenticated;

-- Fonctions appelées par le client : jamais par anon.
revoke execute on function
  public.add_external_anc_visit(uuid, date, text, text),
  public.remove_external_anc_visit(uuid, text), public.anc_status(uuid),
  public.list_anc_visits(uuid), public.get_encounter_anc(uuid)
from public, anon;
grant execute on function
  public.add_external_anc_visit(uuid, date, text, text),
  public.remove_external_anc_visit(uuid, text), public.anc_status(uuid),
  public.list_anc_visits(uuid), public.get_encounter_anc(uuid)
to authenticated;
