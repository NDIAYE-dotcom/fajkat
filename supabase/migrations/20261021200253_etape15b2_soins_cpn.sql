-- =============================================================================
-- Étape 15, partie B2 : CPN — bilan corrigé, soins préventifs, Td, examens
-- -----------------------------------------------------------------------------
-- 1. anc_status_compute corrigée (défaut de B1 : elle comptait les visites, pas les
--    contacts couverts). Une CPN couvre le contact dont la fenêtre contient son âge
--    gestationnel, recalculé avec la datation retenue aujourd'hui (le « SA du jour » de la
--    fiche reste figé) ; plusieurs CPN dans une fenêtre ne couvrent qu'un contact ; une CPN
--    hors de toute fenêtre est comptée et ne couvre rien. Manquées : fenêtres passées sans
--    CPN. Prochaine : premier contact non couvert dont la fenêtre n'est pas passée. Le
--    numéro de CPN reste l'ordre des visites. Copie JS : bilanContacts (src/modules/
--    maternite/cpn.js), mêmes cas de test (supabase/tests/etape15b2.sql et
--    e2e/maternite-bilan.spec.js).
-- 2. Soins préventifs de la grossesse : types paramétrables (fer et acide folique, TPI,
--    moustiquaire, déparasitage) avec leurs règles (âge gestationnel minimal, intervalle
--    minimal, nombre maximal, ligne d'ordonnance proposée), copiés par structure ;
--    maternal_interventions (faits ici, recopiés à la validation de la CPN ; TPI et
--    moustiquaire notés « faits ailleurs »). Doses numérotées d'office dans l'ordre des
--    dates.
-- 3. Situations de la grossesse qui bloquent un soin (maternal_condition_types) :
--    « Sous cotrimoxazole » bloque la SP (règle dans la table du type de soin, message
--    paramétrable). Table à part (pregnancy_conditions), jamais une colonne de la
--    grossesse. Sensible : notée dans la CPN, elle rend la consultation sensible (ouverture
--    déjà journalisée) ; décochée dans une CPN suivante avec un motif obligatoire. Lue seulement dans l'écran CPN des habilités
--    (get_encounter_anc_care). Partout ailleurs, et pour tout non-habilité, le statut du
--    TPI est calculé sans elle : une femme sous cotrimoxazole ressemble exactement à une
--    femme qui n'a pas encore reçu la SP.
-- 4. Conseils donnés pendant la CPN : thèmes paramétrables, cochés dans la CPN ; lus
--    seulement par les habilités (jamais par l'aide-soignant).
-- 5. Vaccins (réutilisés à l'étape 16) : vaccines, vaccine_doses (rang, intervalle minimal
--    depuis la dose précédente, durée de protection), immunizations en ajout seul : dose
--    faite ici (CPN validée) ou d'après le carnet (date exacte, au mois ou à l'année),
--    annulation motivée. Td seul pour l'instant. Lecture prudente d'une date
--    approximative : la dose est datée du premier jour possible (1er du mois, 1er janvier),
--    sa précision est gardée et l'écran l'affiche telle quelle (« mars 2024 », « 2025 »).
--    La dose suivante est donc proposée au plus tôt, et la protection finit au plus tôt :
--    on propose une dose de trop plutôt que d'en oublier une.
-- 6. Examens de la grossesse : liste paramétrable (Hb, glycémie, syphilis, VIH, hépatite B ;
--    à valider ; AgHBs devient sensible comme le VIH et la syphilis), résultats des examens
--    rapides des consultations de la grossesse et résultats d'un laboratoire extérieur
--    (papier apporté par la patiente ; saisi pendant une CPN, un résultat sensible la rend
--    sensible). Liste réservée en entier aux habilités ; une ligne READ par ouverture de
--    l'écran si elle contient un résultat sensible.
-- Toutes les valeurs proposées sont À VALIDER par une sage-femme (docs/plus-tard.md).
-- Aucune lecture directe des tables cliniques ; nouvelles tables inscrites dans
-- audit_medical_tables ; fusion de dossiers jamais refusée à cause d'une donnée médicale :
-- vaccins et résultats extérieurs rattachés au dossier gardé, dose de Td en double annulée
-- (« Doublon après fusion ») ; le reste suit la grossesse ou la consultation.
-- Deux grossesses en cours dans les deux dossiers : jamais de refus ni de message (section
-- 10). Une grossesse au-delà de sa DPA + N jours (réglage, 42 proposés, à valider) est une
-- autre grossesse, terminée ailleurs : close (« ended », issue non renseignée). Sinon c'est
-- la même, saisie deux fois : la plus remplie est gardée, tout ce qui dépend de l'autre lui
-- est rattaché, l'autre est retirée « Doublon après fusion » ; DDR différentes : repère
-- « Datation à vérifier (fusion) » pour les habilités.
-- Nouvelles structures : soins, conseils et examens recopiés à la création (trigger
-- organizations_seed_zz_anc_care) ; catalogue des vaccins commun à toutes.
-- =============================================================================


-- =============================================================================
-- 1. Bilan des CPN corrigé
-- =============================================================================

-- Bilan des CPN d'une grossesse, sans contrôle de droits. Interne.
--   contacts       : contacts du modèle, avec leurs dates et leur état (covered, missed,
--                    current, upcoming ; not_covered si la grossesse est terminée) ;
--   expected       : contacts dont la fenêtre est passée ;
--   covered        : contacts couverts par au moins une CPN ;
--   done           : CPN faites ici (validées) ou ailleurs (carnet) ;
--   missed         : contacts dont la fenêtre est passée sans aucune CPN ;
--   visit_ga_days  : âge gestationnel de chaque CPN d'après la datation retenue (copie JS) ;
--   next           : premier contact non couvert dont la fenêtre n'est pas passée, numéro
--                    que portera la CPN (ordre des visites), dates cible et fenêtre.
create or replace function public.anc_status_compute(p_pregnancy_id uuid)
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
  v_ongoing  boolean;
  v_visits   integer[];
  v_done     integer;
  v_here     integer;
  v_contacts jsonb;
  v_next     jsonb;
begin
  select * into v_g from public.pregnancies where id = p_pregnancy_id;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  v_today := public.org_local_date(v_g.org_id);
  v_ga := v_today - v_ref;
  v_ongoing := v_g.status = 'ongoing';

  select coalesce(array_agg(v.visit_date - v_ref order by v.visit_date, v.created_at, v.id),
                  '{}'::integer[]),
         count(*), count(*) filter (where v.origin = 'here')
    into v_visits, v_done, v_here
    from public.anc_visits v
   where v.pregnancy_id = v_g.id and v.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_number', c.contact_number,
           'target_ga_days', c.target_ga_days,
           'window_start_days', c.window_start_days,
           'window_end_days', c.window_end_days,
           'target_date', v_ref + c.target_ga_days,
           'window_start_date', v_ref + c.window_start_days,
           'window_end_date', v_ref + c.window_end_days,
           'state', case when c.covered then 'covered'
                         when not v_ongoing then 'not_covered'
                         when c.window_end_days < v_ga then 'missed'
                         when c.window_start_days <= v_ga then 'current'
                         else 'upcoming' end)
         order by c.contact_number), '[]'::jsonb)
    into v_contacts
    from (select k.*,
                 exists (select 1 from unnest(v_visits) ga
                          where ga between k.window_start_days and k.window_end_days) as covered
            from public.anc_schedule_contacts k
           where k.model_code = v_g.anc_model_code) c;

  if v_ongoing then
    select x into v_next
      from jsonb_array_elements(v_contacts) x
     where x ->> 'state' in ('current', 'upcoming')
     order by (x ->> 'contact_number')::integer
     limit 1;
  end if;

  return jsonb_build_object(
    'pregnancy_id', v_g.id,
    'model_code', v_g.anc_model_code,
    'model_label', (select label from public.anc_schedule_models where code = v_g.anc_model_code),
    'contacts_total', jsonb_array_length(v_contacts),
    'contacts', v_contacts,
    'ga_days', case when v_ongoing then v_ga end,
    'expected', case when v_ongoing then
      (select count(*) from jsonb_array_elements(v_contacts) x
        where (x ->> 'window_end_days')::integer < v_ga) end,
    'covered', (select count(*) from jsonb_array_elements(v_contacts) x
                 where x ->> 'state' = 'covered'),
    'done', v_done,
    'done_here', v_here,
    'done_elsewhere', v_done - v_here,
    'visit_ga_days', to_jsonb(v_visits),
    'missed', case when v_ongoing then
      (select count(*) from jsonb_array_elements(v_contacts) x where x ->> 'state' = 'missed') end,
    'next', case when v_next is not null then jsonb_build_object(
      'contact_number', (v_next ->> 'contact_number')::integer,
      'anc_number', v_done + 1,
      'target_ga_days', (v_next ->> 'target_ga_days')::integer,
      'target_date', greatest((v_next ->> 'target_date')::date, v_today),
      'window_start_date', (v_next ->> 'window_start_date')::date,
      'window_end_date', (v_next ->> 'window_end_date')::date) end);
end;
$$;


-- =============================================================================
-- 2. Situations qui bloquent un soin
-- =============================================================================

-- Fusion de dossiers, même grossesse saisie deux fois (section 10) : seul changement admis
-- sur une ligne figée, pregnancy_id vers la grossesse gardée, depuis la grossesse retirée
-- « Doublon après fusion ». Interne.
create function public.pregnancy_row_is_merge_relink(p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_old ? 'pregnancy_id'
     and (p_new ->> 'pregnancy_id') is distinct from (p_old ->> 'pregnancy_id')
     and (p_new - 'pregnancy_id' - 'updated_at') = (p_old - 'pregnancy_id' - 'updated_at')
     and exists (select 1 from public.pregnancies g
                  where g.id = (p_old ->> 'pregnancy_id')::uuid and g.deleted_at is not null
                    and g.removed_reason = 'Doublon après fusion')
     and exists (select 1 from public.pregnancies g
                  where g.id = (p_new ->> 'pregnancy_id')::uuid and g.deleted_at is null);
$$;

-- Référentiel commun (super-admin, étape 31).
create table public.maternal_condition_types (
  code         text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label        text not null check (char_length(btrim(label)) between 2 and 80),
  -- Sensible : notée dans une CPN, elle rend la consultation sensible.
  is_sensitive boolean not null default true,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger maternal_condition_types_set_updated_at before update on public.maternal_condition_types
  for each row execute function public.set_updated_at();

insert into public.maternal_condition_types (code, label, is_sensitive, sort_order) values
  ('cotrimoxazole', 'Sous cotrimoxazole', true, 10);

-- Situation d'une grossesse : table à part, jamais une colonne de pregnancies (que
-- l'aide-soignant lit pour l'onglet Grossesse). Cochée dans une CPN (started_encounter_id) ;
-- décochée dans une CPN suivante avec un motif obligatoire (ended_*) ; notée par erreur :
-- retirée avec un motif. Journal sans valeur à chaque changement.
create table public.pregnancy_conditions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id),
  pregnancy_id         uuid not null,
  condition_code       text not null references public.maternal_condition_types (code),
  started_encounter_id uuid not null,
  started_on           date not null,
  ended_encounter_id   uuid,
  ended_on             date,
  ended_reason         text check (char_length(btrim(ended_reason)) between 3 and 300),
  removed_reason       text check (char_length(removed_reason) between 3 and 300),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at           timestamptz,
  constraint pregnancy_conditions_removed_check check ((deleted_at is null) = (removed_reason is null)),
  constraint pregnancy_conditions_end_check
    check ((ended_on is null) = (ended_encounter_id is null)
           and (ended_on is null) = (ended_reason is null)
           and (ended_on is null or ended_on >= started_on)),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id),
  foreign key (started_encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (ended_encounter_id, org_id) references public.encounters (id, org_id)
);
create unique index pregnancy_conditions_active_unique
  on public.pregnancy_conditions (pregnancy_id, condition_code)
  where ended_on is null and deleted_at is null;

comment on table public.pregnancy_conditions is
  'Situation sensible de la grossesse : aucune lecture directe (get_encounter_anc_care, habilités).';

create trigger pregnancy_conditions_set_updated_at before update on public.pregnancy_conditions
  for each row execute function public.set_updated_at();

-- Ajoutée ou close seulement pendant la validation d'une CPN ; ensuite, seulement retirée
-- avec un motif.
create function public.pregnancy_conditions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une situation de la grossesse ne se supprime jamais.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (select status from public.encounters where id = new.started_encounter_id) is distinct from 'draft' then
      raise exception 'Consultation validée : ajoutez un avenant.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'Situation retirée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  -- Retrait motivé.
  if new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  -- Décochée, avec son motif, par une CPN en cours de validation.
  if old.ended_on is null and new.ended_on is not null
     and (select status from public.encounters where id = new.ended_encounter_id) = 'draft'
     and (to_jsonb(new) - 'ended_on' - 'ended_encounter_id' - 'ended_reason' - 'updated_at')
         = (to_jsonb(old) - 'ended_on' - 'ended_encounter_id' - 'ended_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'Situation enregistrée : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger pregnancy_conditions_guard before insert or update or delete on public.pregnancy_conditions
  for each row execute function public.pregnancy_conditions_guard();
create trigger pregnancy_conditions_audit after insert or update on public.pregnancy_conditions
  for each row execute function public.audit_trigger_redacted('pregnancy_id');

-- Codes des situations en cours d'une grossesse. Interne.
create function public.pregnancy_active_conditions(p_pregnancy_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(condition_code order by condition_code), '{}'::text[])
    from public.pregnancy_conditions
   where pregnancy_id = p_pregnancy_id and ended_on is null and deleted_at is null;
$$;

-- Situations cochées dans le brouillon de la CPN (maternite.conditions), codes connus et
-- actifs seulement ; null si la clé est absente (aucun changement). Interne.
create function public.anc_draft_conditions(p_m jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when jsonb_typeof(p_m -> 'conditions') = 'array' then
    coalesce((select array_agg(distinct t.code order by t.code)
                from jsonb_array_elements_text(p_m -> 'conditions') c
                join public.maternal_condition_types t on t.code = c and t.is_active),
             '{}'::text[]) end;
$$;

-- Remplace encounter_draft_sensitive (étape 14, 20261020090000_etape14_consultations.sql) :
-- recopie à l'identique, plus une situation sensible cochée dans la CPN, ou un résultat
-- extérieur sensible saisi pendant la CPN (comme un examen rapide).
create or replace function public.encounter_draft_sensitive(p_org_id uuid, p_type_id uuid, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.is_sensitive_default from public.encounter_types t
                    where t.id = p_type_id and t.org_id = p_org_id), false)
      or coalesce(case when jsonb_typeof(p_data -> 'is_sensitive') = 'boolean'
                       then (p_data ->> 'is_sensitive')::boolean end, false)
      or exists (select 1
                   from jsonb_array_elements(public.jsonb_array_or_empty(p_data -> 'diagnoses')) d
                   join public.diagnoses_catalog c on c.id = public.try_uuid(d ->> 'catalog_id')
                  where c.is_sensitive and (c.org_id is null or c.org_id = p_org_id))
      or exists (select 1
                   from jsonb_array_elements(public.jsonb_array_or_empty(p_data -> 'tests')) x
                   join public.rapid_test_types r on r.id = public.try_uuid(x ->> 'rapid_test_type_id')
                  where r.is_sensitive and r.org_id = p_org_id)
      or exists (select 1
                   from jsonb_array_elements_text(
                          case when jsonb_typeof(p_data -> 'maternite' -> 'conditions') = 'array'
                               then p_data -> 'maternite' -> 'conditions' else '[]'::jsonb end) c
                   join public.maternal_condition_types t on t.code = c
                  where t.is_sensitive)
      or exists (select 1
                   from jsonb_array_elements(
                          public.jsonb_array_or_empty(p_data -> 'maternite' -> 'external_tests')) x
                   join public.rapid_test_types r on r.id = public.try_uuid(x ->> 'rapid_test_type_id')
                  where r.is_sensitive and r.org_id = p_org_id);
$$;


-- =============================================================================
-- 3. Soins préventifs de la grossesse
-- =============================================================================

-- Ligne d'ordonnance proposée par « Ajouter à l'ordonnance » : mêmes clés que le brouillon
-- de l'ordonnance (product_name, dosage, form_code, route_code, dose_morning, dose_noon,
-- dose_evening, dose_night, duration_days, quantity, instructions). Contrôle écrit dans les
-- CHECK sans fonction (une fonction appelée par un CHECK devrait rester exécutable par
-- l'utilisateur qui modifie la table).

-- Modèles communs (super-admin, étape 31), recopiés par structure. Valeurs À VALIDER.
--   numbered          : doses numérotées (SP1, SP2…) dans l'ordre des dates ;
--   min_ga_days       : âge gestationnel minimal (jours) pour un soin fait ici ;
--   min_interval_days : délai minimal depuis le précédent du même type ;
--   max_count         : nombre maximal par grossesse (null : pas de maximum) ;
--   allow_elsewhere   : peut être noté « fait ailleurs » (d'après le carnet) ;
--   elsewhere_dated   : la date est exigée pour un soin fait ailleurs ;
--   blocked_by_condition / block_message : situation qui bloque le soin, et le message.
create table public.maternal_intervention_type_templates (
  code                 text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label                text not null check (char_length(btrim(label)) between 2 and 80),
  dose_label           text check (char_length(btrim(dose_label)) between 1 and 12),
  numbered             boolean not null default false,
  min_ga_days          smallint check (min_ga_days between 0 and 310),
  min_interval_days    smallint check (min_interval_days between 1 and 310),
  max_count            smallint check (max_count between 1 and 20),
  allow_elsewhere      boolean not null default false,
  elsewhere_dated      boolean not null default true,
  blocked_by_condition text references public.maternal_condition_types (code),
  block_message        text check (char_length(btrim(block_message)) between 5 and 300),
  prescription         jsonb check (
                         prescription is null
                         or (jsonb_typeof(prescription) = 'object'
                             and char_length(btrim(coalesce(prescription ->> 'product_name', '')))
                                 between 2 and 120
                             and prescription - array['product_name', 'dosage', 'form_code',
                                                      'route_code', 'dose_morning', 'dose_noon',
                                                      'dose_evening', 'dose_night',
                                                      'duration_days', 'quantity',
                                                      'instructions'] = '{}'::jsonb)),
  sort_order           integer not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((blocked_by_condition is null) = (block_message is null)),
  check (not numbered or dose_label is not null)
);

create trigger maternal_intervention_type_templates_set_updated_at
  before update on public.maternal_intervention_type_templates
  for each row execute function public.set_updated_at();

insert into public.maternal_intervention_type_templates
  (code, label, dose_label, numbered, min_ga_days, min_interval_days, max_count, allow_elsewhere,
   elsewhere_dated, blocked_by_condition, block_message, prescription, sort_order)
values
  -- Chaque jour pendant toute la grossesse ; aucune règle de date.
  ('fer_acide_folique', 'Fer et acide folique', null, false, null, null, null, false, true,
   null, null,
   '{"product_name": "Fer + acide folique", "dosage": "60 mg + 0,4 mg", "form_code": "comprime",
     "route_code": "orale", "dose_morning": 1, "duration_days": 30,
     "instructions": "Pendant le repas"}'::jsonb, 10),
  -- SP à partir de 13 SA, au moins un mois entre deux doses, à chaque CPN jusqu'à
  -- l'accouchement (OMS 2012 : pas de nombre maximal).
  ('tpi_sp', 'TPI (sulfadoxine-pyriméthamine)', 'SP', true, 91, 28, null, true, true,
   'cotrimoxazole',
   'Pas de SP pour une patiente sous cotrimoxazole : le cotrimoxazole protège déjà du paludisme.',
   '{"product_name": "Sulfadoxine-pyriméthamine", "dosage": "500 mg + 25 mg",
     "form_code": "comprime", "route_code": "orale", "dose_morning": 3, "duration_days": 1,
     "quantity": 3, "instructions": "Prise unique, devant le soignant"}'::jsonb, 20),
  -- Une par grossesse ; reçue ailleurs : une case, sans date.
  ('moustiquaire', 'Moustiquaire imprégnée (MILDA)', null, false, null, null, 1, true, false,
   null, null, null, 30),
  -- Une dose à partir du 2e trimestre.
  ('deparasitage', 'Déparasitage (mébendazole)', null, false, 98, null, 1, false, true,
   null, null,
   '{"product_name": "Mébendazole", "dosage": "500 mg", "form_code": "comprime",
     "route_code": "orale", "dose_morning": 1, "duration_days": 1, "quantity": 1}'::jsonb, 40);

-- Types de la structure : règles modifiées par owner, admin et sage-femme ; un réglage changé
-- ne vaut que pour les saisies suivantes (chaque soin garde son libellé du jour).
create table public.maternal_intervention_types (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id),
  template_code        text references public.maternal_intervention_type_templates (code),
  label                text not null check (char_length(btrim(label)) between 2 and 80),
  dose_label           text check (char_length(btrim(dose_label)) between 1 and 12),
  numbered             boolean not null default false,
  min_ga_days          smallint check (min_ga_days between 0 and 310),
  min_interval_days    smallint check (min_interval_days between 1 and 310),
  max_count            smallint check (max_count between 1 and 20),
  allow_elsewhere      boolean not null default false,
  elsewhere_dated      boolean not null default true,
  blocked_by_condition text references public.maternal_condition_types (code),
  block_message        text check (char_length(btrim(block_message)) between 5 and 300),
  prescription         jsonb check (
                         prescription is null
                         or (jsonb_typeof(prescription) = 'object'
                             and char_length(btrim(coalesce(prescription ->> 'product_name', '')))
                                 between 2 and 120
                             and prescription - array['product_name', 'dosage', 'form_code',
                                                      'route_code', 'dose_morning', 'dose_noon',
                                                      'dose_evening', 'dose_night',
                                                      'duration_days', 'quantity',
                                                      'instructions'] = '{}'::jsonb)),
  sort_order           integer not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at           timestamptz,
  unique (id, org_id),
  check ((blocked_by_condition is null) = (block_message is null)),
  check (not numbered or dose_label is not null)
);
create unique index maternal_intervention_types_template_unique
  on public.maternal_intervention_types (org_id, template_code) where template_code is not null;

create trigger maternal_intervention_types_set_updated_at before update on public.maternal_intervention_types
  for each row execute function public.set_updated_at();
create trigger maternal_intervention_types_audit after insert or update or delete on public.maternal_intervention_types
  for each row execute function public.audit_trigger();
create trigger maternal_intervention_types_no_delete before delete on public.maternal_intervention_types
  for each row execute function public.no_delete();

-- Soin d'une grossesse : fait ici (une CPN validée) ou ailleurs (d'après le carnet).
create table public.maternal_interventions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  pregnancy_id  uuid not null,
  type_id       uuid not null,
  -- Libellés du jour.
  label         text not null check (char_length(btrim(label)) between 2 and 80),
  dose_label    text check (char_length(btrim(dose_label)) between 1 and 12),
  origin        text not null check (origin in ('here', 'elsewhere')),
  encounter_id  uuid,
  -- Null seulement pour un soin fait ailleurs sans date (moustiquaire déjà reçue).
  given_on      date,
  -- Âge gestationnel du jour, d'après la datation retenue au moment de l'enregistrement.
  ga_days       smallint check (ga_days between -400 and 330),
  place         text check (char_length(btrim(place)) between 2 and 120),
  note          text check (char_length(note) <= 300),
  -- Identifiant créé sur l'appareil (soin fait ailleurs) : un envoi répété ne crée rien.
  client_id     uuid unique,
  removed_reason text check (char_length(removed_reason) between 3 and 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  constraint maternal_interventions_origin_fields_check check (
    (origin = 'here' and encounter_id is not null and given_on is not null and place is null)
    or (origin = 'elsewhere' and encounter_id is null)),
  constraint maternal_interventions_removed_check check ((deleted_at is null) = (removed_reason is null)),
  constraint maternal_interventions_removed_origin_check check (deleted_at is null or origin = 'elsewhere'),
  constraint maternal_interventions_encounter_type_unique unique (encounter_id, type_id),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id),
  foreign key (type_id, org_id) references public.maternal_intervention_types (id, org_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id)
);
create index maternal_interventions_pregnancy_idx
  on public.maternal_interventions (pregnancy_id, type_id, given_on) where deleted_at is null;

comment on table public.maternal_interventions is
  'Soins de la grossesse : secret médical. Aucune lecture directe (get_anc_care, get_encounter_anc_care).';

create trigger maternal_interventions_set_updated_at before update on public.maternal_interventions
  for each row execute function public.set_updated_at();

-- Fait ici : ajouté seulement pendant la validation de sa CPN, ensuite figé (avenant). Fait
-- ailleurs : ne change que pour être retiré (motif).
create function public.maternal_interventions_guard()
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
    raise exception 'Un soin noté ne se supprime jamais.' using errcode = '42501';
  end if;
  if public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.origin = 'elsewhere' and old.deleted_at is null and new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'Soin enregistré : il ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger maternal_interventions_guard before insert or update or delete on public.maternal_interventions
  for each row execute function public.maternal_interventions_guard();
create trigger maternal_interventions_audit after insert or update on public.maternal_interventions
  for each row execute function public.audit_trigger_redacted('pregnancy_id', 'encounter_id');

-- Thèmes de conseil de la CPN : modèles communs recopiés par structure. À VALIDER.
create table public.anc_counselling_topic_templates (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null check (char_length(btrim(label)) between 2 and 120),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.anc_counselling_topic_templates (code, label, sort_order) values
  ('signes_danger',  'Signes de danger pendant la grossesse',                  10),
  ('alimentation',   'Alimentation et repos',                                  20),
  ('plan_naissance', 'Plan d''accouchement (lieu, transport, argent, accompagnant)', 30),
  ('moustiquaire',   'Dormir chaque nuit sous moustiquaire',                   40),
  ('allaitement',    'Allaitement maternel exclusif',                          50),
  ('pf_post_partum', 'Planification familiale après l''accouchement',          60),
  ('depistage',      'Dépistage proposé à toutes les femmes enceintes',        70);

create table public.anc_counselling_topics (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  template_code text references public.anc_counselling_topic_templates (code),
  label         text not null check (char_length(btrim(label)) between 2 and 120),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id)
);
create unique index anc_counselling_topics_label_unique
  on public.anc_counselling_topics (org_id, lower(btrim(label))) where deleted_at is null;

create trigger anc_counselling_topics_set_updated_at before update on public.anc_counselling_topics
  for each row execute function public.set_updated_at();
create trigger anc_counselling_topics_audit after insert or update or delete on public.anc_counselling_topics
  for each row execute function public.audit_trigger();
create trigger anc_counselling_topics_no_delete before delete on public.anc_counselling_topics
  for each row execute function public.no_delete();

-- Conseils donnés pendant une CPN (libellé du jour), recopiés à la validation, figés.
create table public.anc_counselling_given (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id),
  encounter_id uuid not null,
  pregnancy_id uuid not null,
  topic_id     uuid not null,
  label        text not null check (char_length(btrim(label)) between 2 and 120),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at   timestamptz,
  unique (encounter_id, topic_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id),
  foreign key (topic_id, org_id) references public.anc_counselling_topics (id, org_id)
);
create index anc_counselling_given_pregnancy_idx on public.anc_counselling_given (pregnancy_id);

create function public.anc_counselling_given_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and (select status from public.encounters where id = new.encounter_id) = 'draft' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Consultation validée : ajoutez un avenant.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  raise exception 'Conseils enregistrés : ils ne se modifient plus.' using errcode = '42501';
end;
$$;

create trigger anc_counselling_given_guard before insert or update or delete on public.anc_counselling_given
  for each row execute function public.anc_counselling_given_guard();
create trigger anc_counselling_given_audit after insert on public.anc_counselling_given
  for each row execute function public.audit_trigger_redacted('pregnancy_id', 'encounter_id');

-- Recopie des modèles par structure, rejouable (types de soins, thèmes de conseil).
create function public.seed_anc_care(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.maternal_intervention_types
    (org_id, template_code, label, dose_label, numbered, min_ga_days, min_interval_days,
     max_count, allow_elsewhere, elsewhere_dated, blocked_by_condition, block_message,
     prescription, sort_order, created_by)
  select p_org_id, t.code, t.label, t.dose_label, t.numbered, t.min_ga_days, t.min_interval_days,
         t.max_count, t.allow_elsewhere, t.elsewhere_dated, t.blocked_by_condition,
         t.block_message, t.prescription, t.sort_order, null
    from public.maternal_intervention_type_templates t
   where t.is_active
     and not exists (select 1 from public.maternal_intervention_types x
                      where x.org_id = p_org_id and x.template_code = t.code);

  insert into public.anc_counselling_topics (org_id, template_code, label, sort_order, created_by)
  select p_org_id, t.code, t.label, t.sort_order, null
    from public.anc_counselling_topic_templates t
   where t.is_active
     and not exists (select 1 from public.anc_counselling_topics x
                      where x.org_id = p_org_id and x.template_code = t.code);

  perform public.seed_anc_tests(p_org_id);
end;
$$;


-- =============================================================================
-- 4. Vaccins (Td aujourd'hui ; calendrier de l'enfant à l'étape 16)
-- =============================================================================

-- Droits : lecture par les rôles médicaux (aide-soignant compris), saisie par les
-- soignants qui rédigent ; accueil, caissier et owner ou admin qui n'exerce pas : rien.
create function public.vaccination_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.org_has_feature(p_org_id, 'vaccination')
          or public.org_has_feature(p_org_id, 'maternite'))
     and public.patients_can_read_medical(p_org_id);
$$;

create function public.vaccination_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.org_has_feature(p_org_id, 'vaccination')
          or public.org_has_feature(p_org_id, 'maternite'))
     and public.patients_can_read_sensitive(p_org_id)
     and public.patients_org_writable(p_org_id);
$$;

-- Catalogue commun (super-admin, étape 31). Valeurs À VALIDER (PEV du Sénégal).
create table public.vaccines (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null check (char_length(btrim(label)) between 2 and 80),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Doses d'un vaccin :
--   min_interval_days : délai minimal depuis la dose précédente (null pour la 1re) ;
--   protection_days   : protection donnée par cette dose (0 : aucune ; null : à vie).
create table public.vaccine_doses (
  vaccine_code      text not null references public.vaccines (code),
  dose_rank         smallint not null check (dose_rank between 1 and 20),
  label             text not null check (char_length(btrim(label)) between 1 and 40),
  min_interval_days smallint check (min_interval_days between 1 and 3660),
  protection_days   integer check (protection_days between 0 and 36600),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (vaccine_code, dose_rank),
  check ((dose_rank = 1) = (min_interval_days is null))
);

create trigger vaccines_set_updated_at before update on public.vaccines
  for each row execute function public.set_updated_at();
create trigger vaccine_doses_set_updated_at before update on public.vaccine_doses
  for each row execute function public.set_updated_at();

insert into public.vaccines (code, label, sort_order) values ('td', 'Td (tétanos-diphtérie)', 10);

-- OMS : Td2 au moins 4 semaines après Td1 (protège 3 ans), Td3 au moins 6 mois après Td2
-- (5 ans), Td4 au moins 1 an après Td3 (10 ans), Td5 au moins 1 an après Td4 (à vie).
insert into public.vaccine_doses (vaccine_code, dose_rank, label, min_interval_days, protection_days)
values
  ('td', 1, 'Td 1', null,    0),
  ('td', 2, 'Td 2',   28, 1095),
  ('td', 3, 'Td 3',  182, 1826),
  ('td', 4, 'Td 4',  365, 3652),
  ('td', 5, 'Td 5',  365, null);

-- Une dose reçue par un patient : faite ici (consultation validée) ou d'après le carnet.
-- Date approximative : given_on est le premier jour possible (1er du mois, 1er janvier) ;
-- date_precision dit comment l'afficher.
create table public.immunizations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  patient_id     uuid not null,
  vaccine_code   text not null references public.vaccines (code),
  dose_rank      smallint not null,
  -- Libellé du jour.
  dose_label     text not null check (char_length(btrim(dose_label)) between 1 and 40),
  origin         text not null check (origin in ('here', 'card')),
  encounter_id   uuid,
  pregnancy_id   uuid,
  given_on       date not null,
  date_precision text not null default 'day' check (date_precision in ('day', 'month', 'year')),
  place          text check (char_length(btrim(place)) between 2 and 120),
  lot_number     text check (char_length(btrim(lot_number)) between 1 and 40),
  note           text check (char_length(note) <= 300),
  client_id      uuid unique,
  removed_reason text check (char_length(removed_reason) between 3 and 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  constraint immunizations_origin_fields_check check (
    (origin = 'here' and encounter_id is not null and date_precision = 'day' and place is null)
    or (origin = 'card' and encounter_id is null)),
  constraint immunizations_precision_check check (
    date_precision = 'day'
    or (date_precision = 'month' and extract(day from given_on) = 1)
    or (date_precision = 'year' and extract(day from given_on) = 1 and extract(month from given_on) = 1)),
  constraint immunizations_removed_check check ((deleted_at is null) = (removed_reason is null)),
  foreign key (vaccine_code, dose_rank) references public.vaccine_doses (vaccine_code, dose_rank),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id)
);
create unique index immunizations_dose_unique
  on public.immunizations (patient_id, vaccine_code, dose_rank) where deleted_at is null;
create unique index immunizations_encounter_unique
  on public.immunizations (encounter_id, vaccine_code) where deleted_at is null;

comment on table public.immunizations is
  'Vaccins reçus : secret médical. Aucune lecture directe (vaccine_status, get_anc_care).';

create trigger immunizations_set_updated_at before update on public.immunizations
  for each row execute function public.set_updated_at();

-- Faite ici : ajoutée seulement pendant la validation de sa consultation. Toute dose ne
-- change ensuite que pour être annulée avec un motif, ou rattachée au dossier gardé.
create function public.immunizations_guard()
returns trigger
language plpgsql
security definer
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
    raise exception 'Une dose de vaccin ne se supprime jamais : annulez-la avec un motif.'
      using errcode = '42501';
  end if;
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new))
     or public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'Dose enregistrée : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger immunizations_guard before insert or update or delete on public.immunizations
  for each row execute function public.immunizations_guard();
create trigger immunizations_audit after insert or update on public.immunizations
  for each row execute function public.audit_trigger_redacted('patient_id', 'encounter_id');

-- Dose suivante d'un vaccin pour un patient, lecture prudente. Interne.
--   rank          : rang suivant le plus haut rang noté (null : toutes les doses notées) ;
--   possible_from : date de la dernière dose (premier jour possible) + délai minimal ;
--   precision     : précision de la date de la dernière dose (affichage « à partir de
--                   juillet 2025 » plutôt qu'une date au jour près).
create function public.vaccine_next_dose(p_patient_id uuid, p_vaccine_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with last as (
    select i.dose_rank, i.given_on, i.date_precision
      from public.immunizations i
     where i.patient_id = p_patient_id and i.vaccine_code = p_vaccine_code
       and i.deleted_at is null
     order by i.dose_rank desc
     limit 1)
  select case when d.dose_rank is not null then jsonb_build_object(
           'rank', d.dose_rank, 'label', d.label,
           'possible_from', (select last.given_on + d.min_interval_days from last),
           'precision', (select last.date_precision from last)) end
    from (select 1) one
    left join public.vaccine_doses d
      on d.vaccine_code = p_vaccine_code
     and d.dose_rank = coalesce((select dose_rank from last), 0) + 1;
$$;

-- Doses d'un vaccin, dose suivante et protection (lecture prudente). Interne.
create function public.vaccine_status_compute(p_patient_id uuid, p_vaccine_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with doses as (
    select i.*, d.protection_days
      from public.immunizations i
      join public.vaccine_doses d on d.vaccine_code = i.vaccine_code and d.dose_rank = i.dose_rank
     where i.patient_id = p_patient_id and i.vaccine_code = p_vaccine_code
       and i.deleted_at is null),
  top as (select * from doses order by dose_rank desc limit 1)
  select jsonb_build_object(
    'vaccine_code', p_vaccine_code,
    'vaccine_label', (select label from public.vaccines where code = p_vaccine_code),
    'doses_total', (select count(*) from public.vaccine_doses where vaccine_code = p_vaccine_code),
    'doses', coalesce((select jsonb_agg(jsonb_build_object(
               'id', x.id, 'dose_rank', x.dose_rank, 'dose_label', x.dose_label,
               'origin', x.origin, 'given_on', x.given_on, 'date_precision', x.date_precision,
               'place', x.place, 'lot_number', x.lot_number,
               'author_name', public.user_display_name(x.created_by), 'created_at', x.created_at)
             order by x.dose_rank) from doses x), '[]'::jsonb),
    'next', public.vaccine_next_dose(p_patient_id, p_vaccine_code),
    -- Protection de la dose de plus haut rang : lifetime, until (date) ou none ; precision :
    -- celle de la date de cette dose. Une date approximative s'affiche à sa précision
    -- (« mars 2024 », « 2025 »), jamais comme un jour exact.
    'protection', (select case when top.protection_days is null then
                                 jsonb_build_object('kind', 'lifetime')
                               when top.protection_days = 0 then jsonb_build_object('kind', 'none')
                               else jsonb_build_object('kind', 'until',
                                      'until', top.given_on + top.protection_days,
                                      'precision', top.date_precision) end
                     from top));
$$;


-- =============================================================================
-- 5. Examens de la grossesse
-- =============================================================================

-- Liste proposée (codes des examens rapides de l'étape 14), recopiée par structure.
-- À VALIDER.
create table public.anc_test_templates (
  rapid_test_code text primary key references public.rapid_test_type_templates (code),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- L'hépatite B (AgHBs) est sensible, comme le VIH et la syphilis (décision du 21/10/2026) :
-- modèle et types des structures. Les examens déjà enregistrés gardent leur sensibilité du
-- jour (lignes figées) ; la liste des examens de la grossesse suit le type.
update public.rapid_test_type_templates set is_sensitive = true where code = 'tdr_hepatite_b';
update public.rapid_test_types set is_sensitive = true
 where template_code = 'tdr_hepatite_b' and not is_sensitive;

insert into public.anc_test_templates (rapid_test_code, sort_order) values
  ('hemoglobine',    10),
  ('glycemie',       20),
  ('tdr_syphilis',   30),
  ('tdr_vih',        40),
  ('tdr_hepatite_b', 50);

create table public.anc_tests (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  rapid_test_type_id uuid not null,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  unique (org_id, rapid_test_type_id),
  foreign key (rapid_test_type_id, org_id) references public.rapid_test_types (id, org_id)
);

create trigger anc_tests_set_updated_at before update on public.anc_tests
  for each row execute function public.set_updated_at();
create trigger anc_tests_audit after insert or update or delete on public.anc_tests
  for each row execute function public.audit_trigger();
create trigger anc_tests_no_delete before delete on public.anc_tests
  for each row execute function public.no_delete();

create function public.seed_anc_tests(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.anc_tests (org_id, rapid_test_type_id, sort_order, created_by)
  select p_org_id, r.id, t.sort_order, null
    from public.anc_test_templates t
    join lateral (select r.id from public.rapid_test_types r
                   where r.org_id = p_org_id and r.template_code = t.rapid_test_code
                     and r.deleted_at is null
                   order by r.created_at limit 1) r on true
   where t.is_active
     and not exists (select 1 from public.anc_tests x
                      where x.org_id = p_org_id and x.rapid_test_type_id = r.id);
end;
$$;

create function public.organizations_seed_anc_care()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_anc_care(new.id);
  return null;
end;
$$;

-- Après seed_encounter_settings (examens rapides) : ordre alphabétique des triggers.
create trigger organizations_seed_zz_anc_care
  after insert on public.organizations
  for each row execute function public.organizations_seed_anc_care();

select public.seed_anc_care(o.id) from public.organizations o;

-- Résultat d'un laboratoire extérieur, d'après le papier apporté par la patiente.
create table public.external_test_results (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  patient_id         uuid not null,
  pregnancy_id       uuid,
  rapid_test_type_id uuid not null,
  -- Saisi pendant une CPN (recopié du brouillon à la validation) ; null depuis l'onglet
  -- Grossesse.
  encounter_id       uuid,
  -- Recopiés du type le jour de la saisie.
  label              text not null check (char_length(btrim(label)) between 2 and 80),
  result_kind        text not null check (result_kind in ('binary', 'number', 'text')),
  unit               text check (char_length(unit) <= 20),
  is_sensitive       boolean not null default false,
  result             text check (result in ('positive', 'negative', 'invalid')),
  value_number       numeric(8,2),
  value_text         text check (char_length(value_text) <= 200),
  taken_on           date not null,
  lab_name           text not null check (char_length(btrim(lab_name)) between 2 and 120),
  note               text check (char_length(note) <= 300),
  client_id          uuid unique,
  removed_reason     text check (char_length(removed_reason) between 3 and 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint external_test_results_value_check check (
    (result_kind = 'binary' and result is not null)
    or (result_kind = 'number' and value_number is not null)
    or (result_kind = 'text' and nullif(btrim(value_text), '') is not null)),
  constraint external_test_results_removed_check check ((deleted_at is null) = (removed_reason is null)),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id),
  foreign key (rapid_test_type_id, org_id) references public.rapid_test_types (id, org_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id)
);
create index external_test_results_pregnancy_idx
  on public.external_test_results (pregnancy_id) where deleted_at is null;

comment on table public.external_test_results is
  'Résultats extérieurs : secret médical. Aucune lecture directe (get_pregnancy_tests, habilités).';

create trigger external_test_results_set_updated_at before update on public.external_test_results
  for each row execute function public.set_updated_at();

create function public.external_test_results_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un résultat ne se supprime jamais : retirez-le avec un motif.' using errcode = '42501';
  end if;
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new))
     or public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'Résultat enregistré : il ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger external_test_results_guard before update or delete on public.external_test_results
  for each row execute function public.external_test_results_guard();
create trigger external_test_results_audit after insert or update on public.external_test_results
  for each row execute function public.audit_trigger_redacted('patient_id', 'pregnancy_id');

insert into public.audit_medical_tables (table_name) values
  ('pregnancy_conditions'), ('maternal_interventions'), ('anc_counselling_given'),
  ('immunizations'), ('external_test_results')
on conflict do nothing;


-- =============================================================================
-- 6. Statut des soins
-- =============================================================================

-- Soins d'une grossesse numérotés dans l'ordre des dates, par type. Interne.
create function public.maternal_interventions_numbered(p_pregnancy_id uuid)
returns table (id uuid, dose_number integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, (row_number() over (partition by i.type_id
                                   order by i.given_on nulls first, i.created_at, i.id))::integer
    from public.maternal_interventions i
   where i.pregnancy_id = p_pregnancy_id and i.deleted_at is null;
$$;

-- Où en est chaque type de soin pour une grossesse. Interne.
--   p_conditions : situations en cours, pour l'écran CPN des habilités seulement ; null
--                  partout ailleurs (rien n'est alors bloqué : une femme sous
--                  cotrimoxazole ressemble à une femme qui n'a pas encore reçu la SP).
create function public.maternal_care_status(p_pregnancy_id uuid, p_conditions text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select p.id, p.org_id, d.reference_date as ref
      from public.pregnancies p
      join public.pregnancy_datings d on d.id = p.current_dating_id
     where p.id = p_pregnancy_id),
  t as (
    select t.*, g.ref,
           (select count(*) from public.maternal_interventions i
             where i.pregnancy_id = g.id and i.type_id = t.id and i.deleted_at is null) as n,
           (select max(i.given_on) from public.maternal_interventions i
             where i.pregnancy_id = g.id and i.type_id = t.id and i.deleted_at is null) as last_on
      from g
      join public.maternal_intervention_types t on t.org_id = g.org_id
     where t.deleted_at is null and t.is_active)
  select coalesce(jsonb_agg(jsonb_build_object(
           'type_id', t.id, 'code', t.template_code, 'label', t.label,
           'dose_label', t.dose_label, 'numbered', t.numbered, 'count', t.n,
           'last_on', t.last_on,
           'next_number', case when t.numbered then t.n + 1 end,
           'complete', t.max_count is not null and t.n >= t.max_count,
           'possible_from', greatest(t.ref + t.min_ga_days, t.last_on + t.min_interval_days),
           'allow_elsewhere', t.allow_elsewhere, 'elsewhere_dated', t.elsewhere_dated,
           'prescription', t.prescription,
           'blocked', coalesce(t.blocked_by_condition = any (p_conditions), false),
           'block_message', case when t.blocked_by_condition = any (p_conditions)
                                 then t.block_message end)
         order by t.sort_order, t.label), '[]'::jsonb)
    from t;
$$;

-- Soin fait ici, contrôlé d'après les règles de son type. Interne.
create function public.maternal_intervention_check(
  p_type public.maternal_intervention_types, p_pregnancy_id uuid, p_date date, p_ga integer,
  p_conditions text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n    integer;
  v_last date;
begin
  if p_type.blocked_by_condition = any (p_conditions) then
    raise exception '%', p_type.block_message using errcode = '22023';
  end if;
  if p_type.min_ga_days is not null and p_ga < p_type.min_ga_days then
    raise exception '% : à partir de % SA.', p_type.label, p_type.min_ga_days / 7
      using errcode = '22023';
  end if;
  select count(*), max(given_on) into v_n, v_last
    from public.maternal_interventions
   where pregnancy_id = p_pregnancy_id and type_id = p_type.id and deleted_at is null;
  if p_type.max_count is not null and v_n >= p_type.max_count then
    raise exception '% : déjà noté pour cette grossesse.', p_type.label using errcode = '22023';
  end if;
  if p_type.min_interval_days is not null and v_last is not null
     and p_date < v_last + p_type.min_interval_days then
    raise exception '% : prochaine dose possible à partir du %.', p_type.label,
      to_char(v_last + p_type.min_interval_days, 'DD/MM/YYYY') using errcode = '22023';
  end if;
end;
$$;


-- Résultat extérieur contrôlé et enregistré, pour une grossesse déjà verrouillée par
-- l'appelant (onglet Grossesse ou validation de la CPN). Un client_id déjà connu renvoie
-- la ligne existante. Interne.
create function public.external_test_result_insert(
  p_g public.pregnancies, p_rapid_test_type_id uuid, p_taken_on date, p_lab_name text,
  p_result text, p_value_number numeric, p_value_text text, p_note text, p_client_id uuid,
  p_encounter_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g    public.pregnancies := p_g;
  v_ref  date;
  v_t    public.rapid_test_types;
  v_lab  text := nullif(btrim(coalesce(p_lab_name, '')), '');
  v_text text := nullif(btrim(coalesce(p_value_text, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id   uuid;
begin
  if p_client_id is null then
    raise exception 'Identifiant d''envoi manquant : rechargez la page.' using errcode = '22023';
  end if;
  select id into v_id from public.external_test_results
   where client_id = p_client_id and pregnancy_id = v_g.id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_t from public.rapid_test_types
   where id = p_rapid_test_type_id and org_id = v_g.org_id and deleted_at is null;
  if v_t.id is null then
    raise exception 'Choisissez l''examen dans la liste.' using errcode = '22023';
  end if;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  if p_taken_on is null then
    raise exception 'Indiquez la date de l''examen, d''après le papier du laboratoire.' using errcode = '22023';
  end if;
  if p_taken_on > public.org_local_date(v_g.org_id) then
    raise exception 'La date ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  if p_taken_on < v_ref then
    raise exception 'Cette date est avant le début de la grossesse d''après la datation retenue : vérifiez la date.'
      using errcode = '22023';
  end if;
  if v_lab is null or char_length(v_lab) < 2 then
    raise exception 'Indiquez le laboratoire.' using errcode = '22023';
  end if;
  if char_length(v_lab) > 120 then
    raise exception 'Laboratoire : 120 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Remarque : 300 caractères au plus.' using errcode = '22023';
  end if;
  if v_t.result_kind = 'binary' and coalesce(p_result, '') not in ('positive', 'negative', 'invalid') then
    raise exception '% : choisissez positif, négatif ou invalide.', v_t.label using errcode = '22023';
  end if;
  if v_t.result_kind = 'number' and (p_value_number is null or abs(p_value_number) >= 1000000) then
    raise exception '% : tapez la valeur.', v_t.label using errcode = '22023';
  end if;
  if v_t.result_kind = 'text' and (v_text is null or char_length(v_text) > 200) then
    raise exception '% : écrivez le résultat (200 caractères au plus).', v_t.label using errcode = '22023';
  end if;
  insert into public.external_test_results (org_id, patient_id, pregnancy_id, rapid_test_type_id,
                                            label, result_kind, unit, is_sensitive, result,
                                            value_number, value_text, taken_on, lab_name, note,
                                            client_id, encounter_id)
  values (v_g.org_id, v_g.patient_id, v_g.id, v_t.id, v_t.label, v_t.result_kind, v_t.unit,
          v_t.is_sensitive,
          case when v_t.result_kind = 'binary' then p_result end,
          case when v_t.result_kind = 'number' then p_value_number end,
          case when v_t.result_kind = 'text' then v_text end,
          p_taken_on, v_lab, v_note, p_client_id, p_encounter_id)
  on conflict (client_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.external_test_results where client_id = p_client_id;
  end if;
  return v_id;
end;
$$;

-- =============================================================================
-- 7. Validation de la CPN
-- =============================================================================

-- Soins, situations, conseils et Td de la CPN, recopiés du brouillon (clé « maternite ») :
--   conditions    : ["cotrimoxazole"] situations en cours ce jour (pré-remplies par l'écran
--                   d'après la grossesse ; absentes : rien ne change) ;
--   condition_end_reasons : { "cotrimoxazole": "Traitement arrêté" } motif obligatoire de
--                   chaque situation décochée ;
--   interventions : [{ "type_id": "…", "note": "…" }] soins faits pendant la CPN ;
--   counselling   : ["<id du thème>", …] ;
--   td            : { "given": true, "lot_number": "…" } dose de Td faite pendant la CPN ;
--   external_tests: [{ "client_id", "rapid_test_type_id", "taken_on", "lab_name", "result",
--                   "value_number", "value_text", "note" }] résultats d'un laboratoire
--                   extérieur apportés à la CPN (un résultat sensible rend la CPN sensible).
-- Appelée après anc_visit_from_encounter (grossesse en cours vérifiée). Interne.
create function public.anc_care_from_encounter(p_enc public.encounters, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m     jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  v_g     public.pregnancies;
  v_ref   date;
  v_date  date;
  v_ga    integer;
  v_cond  text[];
  v_item  jsonb;
  v_type  public.maternal_intervention_types;
  v_seen  uuid[] := '{}';
  v_topic public.anc_counselling_topics;
  v_next  jsonb;
  v_fin   record;
  v_motif text;
begin
  select * into v_g from public.pregnancies
   where patient_id = p_enc.patient_id and status = 'ongoing' and deleted_at is null;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  v_date := (p_enc.started_at at time zone
             coalesce((select timezone from public.organizations where id = p_enc.org_id),
                      'Africa/Dakar'))::date;
  v_ga := v_date - v_ref;

  -- Situations : nouvelles cochées ajoutées ; décochées closes ce jour, avec leur motif.
  v_cond := public.anc_draft_conditions(v_m);
  if v_cond is not null then
    for v_fin in
      select c.id, t.label, c.condition_code
        from public.pregnancy_conditions c
        join public.maternal_condition_types t on t.code = c.condition_code
       where c.pregnancy_id = v_g.id and c.ended_on is null and c.deleted_at is null
         and c.condition_code <> all (v_cond)
    loop
      v_motif := nullif(btrim(coalesce(v_m -> 'condition_end_reasons' ->> v_fin.condition_code, '')), '');
      if v_motif is null or char_length(v_motif) < 3 then
        raise exception 'Indiquez pourquoi « % » est décoché.', v_fin.label using errcode = '22023';
      end if;
      if char_length(v_motif) > 300 then
        raise exception 'Motif : 300 caractères au plus.' using errcode = '22023';
      end if;
      update public.pregnancy_conditions
         set ended_on = v_date, ended_encounter_id = p_enc.id, ended_reason = v_motif
       where id = v_fin.id;
    end loop;
    insert into public.pregnancy_conditions (org_id, pregnancy_id, condition_code,
                                             started_encounter_id, started_on)
    select p_enc.org_id, v_g.id, c, p_enc.id, v_date
      from unnest(v_cond) c
     where c <> all (public.pregnancy_active_conditions(v_g.id));
  else
    v_cond := public.pregnancy_active_conditions(v_g.id);
  end if;

  -- Soins faits pendant la CPN.
  if jsonb_array_length(public.jsonb_array_or_empty(v_m -> 'interventions')) > 20 then
    raise exception 'Soins de la CPN : 20 au plus.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(public.jsonb_array_or_empty(v_m -> 'interventions')) loop
    select * into v_type from public.maternal_intervention_types
     where id = public.try_uuid(v_item ->> 'type_id') and org_id = p_enc.org_id
       and deleted_at is null and is_active;
    if v_type.id is null then
      raise exception 'Soin de la CPN : choisissez dans la liste.' using errcode = '22023';
    end if;
    if v_type.id = any (v_seen) then
      raise exception '% : noté deux fois dans cette CPN.', v_type.label using errcode = '22023';
    end if;
    v_seen := v_seen || v_type.id;
    perform public.maternal_intervention_check(v_type, v_g.id, v_date, v_ga, v_cond);
    insert into public.maternal_interventions (org_id, pregnancy_id, type_id, label, dose_label,
                                               origin, encounter_id, given_on, ga_days, note)
    values (p_enc.org_id, v_g.id, v_type.id, v_type.label, v_type.dose_label, 'here', p_enc.id,
            v_date, v_ga, public.encounter_text(v_item, 'note', 300, v_type.label));
  end loop;

  -- Conseils.
  if jsonb_array_length(public.jsonb_array_or_empty(v_m -> 'counselling')) > 30 then
    raise exception 'Conseils : 30 au plus.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(public.jsonb_array_or_empty(v_m -> 'counselling')) loop
    select * into v_topic from public.anc_counselling_topics
     where id = public.try_uuid(v_item #>> '{}') and org_id = p_enc.org_id and deleted_at is null;
    if v_topic.id is null then
      raise exception 'Conseils : choisissez dans la liste.' using errcode = '22023';
    end if;
    insert into public.anc_counselling_given (org_id, encounter_id, pregnancy_id, topic_id, label)
    values (p_enc.org_id, p_enc.id, v_g.id, v_topic.id, v_topic.label)
    on conflict (encounter_id, topic_id) do nothing;
  end loop;

  -- Résultats d'un laboratoire extérieur apportés à la CPN.
  if jsonb_array_length(public.jsonb_array_or_empty(v_m -> 'external_tests')) > 20 then
    raise exception 'Résultats extérieurs : 20 au plus.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(public.jsonb_array_or_empty(v_m -> 'external_tests')) loop
    perform public.external_test_result_insert(
      v_g, public.try_uuid(v_item ->> 'rapid_test_type_id'),
      case when (v_item ->> 'taken_on') ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'taken_on')::date end,
      v_item ->> 'lab_name', v_item ->> 'result',
      public.encounter_number(v_item, 'value_number', -999999, 999999, 'Résultat extérieur'),
      v_item ->> 'value_text', v_item ->> 'note',
      coalesce(public.try_uuid(v_item ->> 'client_id'), gen_random_uuid()), p_enc.id);
  end loop;

  -- Td fait pendant la CPN : rang suivant, délai minimal contrôlé (lecture prudente).
  if jsonb_typeof(v_m -> 'td') = 'object' and (v_m -> 'td' ->> 'given') = 'true' then
    if not public.vaccination_can_write(p_enc.org_id) then
      raise exception 'Les vaccins sont notés par les soignants.' using errcode = '42501';
    end if;
    v_next := public.vaccine_next_dose(p_enc.patient_id, 'td');
    if v_next is null then
      raise exception 'Toutes les doses de Td sont déjà notées pour cette patiente.' using errcode = '22023';
    end if;
    if (v_next ->> 'possible_from')::date > v_date then
      raise exception '% : possible à partir du %.', v_next ->> 'label',
        to_char((v_next ->> 'possible_from')::date, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    insert into public.immunizations (org_id, patient_id, vaccine_code, dose_rank, dose_label,
                                      origin, encounter_id, pregnancy_id, given_on, lot_number)
    values (p_enc.org_id, p_enc.patient_id, 'td', (v_next ->> 'rank')::smallint,
            v_next ->> 'label', 'here', p_enc.id, v_g.id, v_date,
            public.encounter_text(v_m -> 'td', 'lot_number', 40, 'Numéro de lot'));
  end if;
end;
$$;

-- Remplace encounter_validate_extensions (partie B1) : la CPN, puis ses soins.
create or replace function public.encounter_validate_extensions(p_enc public.encounters, p_data jsonb)
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
    perform public.anc_care_from_encounter(p_enc, p_data -> 'maternite');
  end if;
end;
$$;


-- =============================================================================
-- 8. Fonctions appelées par le client
-- =============================================================================

-- Section « Soins » de la CPN dans la consultation (habilités) : situations en cours (seul
-- endroit où elles se lisent), soins avec leur blocage, thèmes de conseil, Td. Consultation
-- validée : soins, conseils et Td enregistrés avec elle.
create function public.get_encounter_anc_care(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc  public.encounters;
  v_g    public.pregnancies;
  v_cond text[];
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  if not found or not public.encounters_can_write(v_enc.org_id)
     or not public.maternity_can_write(v_enc.org_id) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;
  select g.* into v_g from public.pregnancies g
   where g.id = coalesce((select pregnancy_id from public.anc_visits where encounter_id = v_enc.id),
                         (select id from public.pregnancies
                           where patient_id = v_enc.patient_id and status = 'ongoing'
                             and deleted_at is null));
  if v_g.id is null then
    return jsonb_build_object('pregnancy_id', null);
  end if;
  v_cond := public.pregnancy_active_conditions(v_g.id);

  return jsonb_build_object(
    'pregnancy_id', v_g.id,
    'conditions', (select coalesce(jsonb_agg(jsonb_build_object(
                     'code', t.code, 'label', t.label, 'active', t.code = any (v_cond))
                   order by t.sort_order), '[]'::jsonb)
                     from public.maternal_condition_types t where t.is_active),
    'care', public.maternal_care_status(v_g.id, v_cond),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label)
                 order by t.sort_order, t.label), '[]'::jsonb)
                 from public.anc_counselling_topics t
                where t.org_id = v_enc.org_id and t.deleted_at is null and t.is_active),
    'td', public.vaccine_status_compute(v_enc.patient_id, 'td'),
    'given', case when v_enc.status <> 'draft' then jsonb_build_object(
      'interventions', (select coalesce(jsonb_agg(jsonb_build_object(
                          'label', i.label, 'dose_label', i.dose_label,
                          'dose_number', n.dose_number, 'note', i.note)
                        order by i.label), '[]'::jsonb)
                          from public.maternal_interventions i
                          join public.maternal_interventions_numbered(v_g.id) n on n.id = i.id
                         where i.encounter_id = v_enc.id),
      'counselling', (select coalesce(jsonb_agg(c.label order by c.label), '[]'::jsonb)
                        from public.anc_counselling_given c where c.encounter_id = v_enc.id),
      'td', (select jsonb_build_object('dose_label', i.dose_label, 'lot_number', i.lot_number)
               from public.immunizations i
              where i.encounter_id = v_enc.id and i.vaccine_code = 'td' and i.deleted_at is null),
      'conditions_started', (select coalesce(jsonb_agg(t.label), '[]'::jsonb)
                               from public.pregnancy_conditions c
                               join public.maternal_condition_types t on t.code = c.condition_code
                              where c.started_encounter_id = v_enc.id and c.deleted_at is null),
      'conditions_ended', (select coalesce(jsonb_agg(t.label), '[]'::jsonb)
                             from public.pregnancy_conditions c
                             join public.maternal_condition_types t on t.code = c.condition_code
                            where c.ended_encounter_id = v_enc.id and c.deleted_at is null)) end);
end;
$$;

-- Soins de la grossesse pour l'onglet Grossesse (rôles médicaux, aide-soignant compris) :
-- même contenu pour tous, jamais les situations ni leur blocage, jamais d'examen.
-- Remarques des soins et conseils donnés seulement pour les habilités (un thème comme la
-- PTME ou la PF en dirait trop) : la clé « counselling » est absente pour les autres.
create function public.get_anc_care(p_pregnancy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_g        public.pregnancies;
  v_habilite boolean;
begin
  select * into v_g from public.pregnancies where id = p_pregnancy_id and deleted_at is null;
  if v_g.id is null or not public.maternity_can_read(v_g.org_id) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  v_habilite := public.maternity_can_write(v_g.org_id);
  return jsonb_build_object(
    'care', public.maternal_care_status(v_g.id, null),
    'interventions', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'type_id', i.type_id, 'label', i.label,
                        'dose_label', i.dose_label, 'dose_number', n.dose_number,
                        'origin', i.origin, 'given_on', i.given_on, 'ga_days', i.ga_days,
                        'place', i.place, 'note', case when v_habilite then i.note end,
                        'author_name', public.user_display_name(i.created_by))
                      order by i.given_on nulls first, i.created_at), '[]'::jsonb)
                        from public.maternal_interventions i
                        join public.maternal_interventions_numbered(v_g.id) n on n.id = i.id),
    'td', case when public.vaccination_can_read(v_g.org_id)
               then public.vaccine_status_compute(v_g.patient_id, 'td') end)
    || case when v_habilite then jsonb_build_object(
         'counselling', (select coalesce(jsonb_agg(jsonb_build_object(
                           'label', c.label, 'given_on', a.visit_date)
                         order by a.visit_date, c.label), '[]'::jsonb)
                           from public.anc_counselling_given c
                           join public.anc_visits a on a.encounter_id = c.encounter_id
                          where c.pregnancy_id = v_g.id))
       else '{}'::jsonb end;
end;
$$;

-- Soin fait ailleurs, d'après le carnet (TPI, moustiquaire…). p_client_id : identifiant
-- créé sur l'appareil ; un envoi répété renvoie la ligne déjà créée.
create function public.add_external_intervention(
  p_pregnancy_id uuid, p_type_id uuid, p_given_on date, p_place text, p_note text,
  p_client_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g    public.pregnancies;
  v_ref  date;
  v_type public.maternal_intervention_types;
  v_lieu text := nullif(btrim(coalesce(p_place, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id   uuid;
  v_n    integer;
begin
  if p_client_id is null then
    raise exception 'Identifiant d''envoi manquant : rechargez la page.' using errcode = '22023';
  end if;
  v_g := public.pregnancy_for_write(p_pregnancy_id);
  select id into v_id from public.maternal_interventions
   where client_id = p_client_id and pregnancy_id = v_g.id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_type from public.maternal_intervention_types
   where id = p_type_id and org_id = v_g.org_id and deleted_at is null;
  if v_type.id is null or not v_type.allow_elsewhere then
    raise exception 'Ce soin ne se note pas comme fait ailleurs.' using errcode = '22023';
  end if;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  if p_given_on is null and v_type.elsewhere_dated then
    raise exception 'Indiquez la date, d''après le carnet.' using errcode = '22023';
  end if;
  if p_given_on > public.org_local_date(v_g.org_id) then
    raise exception 'La date ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  -- Une dose numérotée (TPI) appartient à la grossesse : pas avant son début.
  if v_type.numbered and p_given_on < v_ref then
    raise exception 'Cette date est avant le début de la grossesse d''après la datation retenue : vérifiez la date.'
      using errcode = '22023';
  end if;
  if v_lieu is not null and char_length(v_lieu) > 120 then
    raise exception 'Lieu : 120 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Remarque : 300 caractères au plus.' using errcode = '22023';
  end if;
  select count(*) into v_n from public.maternal_interventions
   where pregnancy_id = v_g.id and type_id = v_type.id and deleted_at is null;
  if v_type.max_count is not null and v_n >= v_type.max_count then
    raise exception '% : déjà noté pour cette grossesse.', v_type.label using errcode = '22023';
  end if;
  if p_given_on is not null and exists (
       select 1 from public.maternal_interventions
        where pregnancy_id = v_g.id and type_id = v_type.id and given_on = p_given_on
          and deleted_at is null) then
    raise exception '% : déjà noté à cette date.', v_type.label using errcode = '22023';
  end if;
  insert into public.maternal_interventions (org_id, pregnancy_id, type_id, label, dose_label,
                                             origin, given_on, ga_days, place, note, client_id)
  values (v_g.org_id, v_g.id, v_type.id, v_type.label, v_type.dose_label, 'elsewhere',
          p_given_on, p_given_on - v_ref, v_lieu, v_note, p_client_id)
  on conflict (client_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.maternal_interventions where client_id = p_client_id;
  end if;
  return v_id;
end;
$$;

create function public.remove_external_intervention(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i public.maternal_interventions;
begin
  -- Même réponse que la ligne existe ou non, pour qui n'a pas le droit.
  select * into v_i from public.maternal_interventions where id = p_id and deleted_at is null;
  if v_i.id is null or not public.maternity_can_write(v_i.org_id) then
    raise exception 'Soin introuvable.' using errcode = '42501';
  end if;
  perform public.pregnancy_for_write(v_i.pregnancy_id);
  if v_i.origin <> 'elsewhere' then
    raise exception 'Un soin fait ici se corrige par un avenant à sa consultation.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi ce soin est retiré.' using errcode = '22023';
  end if;
  update public.maternal_interventions
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_i.id;
end;
$$;

-- Situation notée par erreur dans une CPN : retirée avec un motif (habilités).
create function public.remove_pregnancy_condition(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.pregnancy_conditions;
begin
  -- Même réponse que la ligne existe ou non, pour qui n'a pas le droit.
  select * into v_c from public.pregnancy_conditions where id = p_id and deleted_at is null;
  if v_c.id is null or not public.maternity_can_write(v_c.org_id) then
    raise exception 'Introuvable.' using errcode = '42501';
  end if;
  perform public.pregnancy_for_write(v_c.pregnancy_id);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi cette situation est retirée.' using errcode = '22023';
  end if;
  update public.pregnancy_conditions
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_c.id;
end;
$$;

-- Vaccins d'un patient (rôles médicaux).
create function public.vaccine_status(p_patient_id uuid, p_vaccine_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.patients where id = p_patient_id and deleted_at is null;
  if v_org is null or not public.vaccination_can_read(v_org) then
    raise exception 'Les vaccins sont réservés aux soignants.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vaccines where code = p_vaccine_code) then
    raise exception 'Vaccin inconnu.' using errcode = '22023';
  end if;
  return public.vaccine_status_compute(p_patient_id, p_vaccine_code);
end;
$$;

-- Dose reçue avant ou ailleurs, d'après le carnet. Date exacte (day), au mois (month) ou à
-- l'année (year) : ramenée au premier jour possible (lecture prudente). p_client_id :
-- identifiant créé sur l'appareil ; un envoi répété renvoie la ligne déjà créée.
create function public.add_immunization_from_card(
  p_patient_id uuid, p_vaccine_code text, p_dose_rank integer, p_given_on date,
  p_date_precision text, p_place text, p_note text, p_client_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_dose  public.vaccine_doses;
  v_date  date;
  v_lieu  text := nullif(btrim(coalesce(p_place, '')), '');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_id    uuid;
begin
  if p_client_id is null then
    raise exception 'Identifiant d''envoi manquant : rechargez la page.' using errcode = '22023';
  end if;
  select org_id into v_org from public.patients where id = p_patient_id and deleted_at is null;
  if v_org is null or not public.vaccination_can_write(v_org) then
    raise exception 'Les vaccins sont notés par les soignants.' using errcode = '42501';
  end if;
  select id into v_id from public.immunizations
   where client_id = p_client_id and patient_id = p_patient_id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_dose from public.vaccine_doses
   where vaccine_code = p_vaccine_code and dose_rank = p_dose_rank;
  if v_dose.vaccine_code is null then
    raise exception 'Choisissez la dose dans la liste.' using errcode = '22023';
  end if;
  if p_given_on is null then
    raise exception 'Indiquez la date, au moins l''année, d''après le carnet.' using errcode = '22023';
  end if;
  if coalesce(p_date_precision, '') not in ('day', 'month', 'year') then
    raise exception 'Précision de la date : jour, mois ou année.' using errcode = '22023';
  end if;
  v_date := case p_date_precision
              when 'month' then date_trunc('month', p_given_on)::date
              when 'year' then date_trunc('year', p_given_on)::date
              else p_given_on end;
  if v_date > public.org_local_date(v_org) then
    raise exception 'La date ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  if v_lieu is not null and char_length(v_lieu) > 120 then
    raise exception 'Lieu : 120 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Remarque : 300 caractères au plus.' using errcode = '22023';
  end if;
  if exists (select 1 from public.immunizations
              where patient_id = p_patient_id and vaccine_code = p_vaccine_code
                and dose_rank = p_dose_rank and deleted_at is null) then
    raise exception '% : déjà notée pour ce patient.', v_dose.label using errcode = '22023';
  end if;
  insert into public.immunizations (org_id, patient_id, vaccine_code, dose_rank, dose_label,
                                    origin, given_on, date_precision, place, note, client_id)
  values (v_org, p_patient_id, p_vaccine_code, p_dose_rank, v_dose.label, 'card', v_date,
          p_date_precision, v_lieu, v_note, p_client_id)
  on conflict (client_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.immunizations where client_id = p_client_id;
  end if;
  return v_id;
end;
$$;

-- Dose notée par erreur (ici ou d'après le carnet) : annulée avec un motif, jamais effacée.
create function public.void_immunization(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i public.immunizations;
begin
  -- Même réponse que la ligne existe ou non, pour qui n'a pas le droit.
  select * into v_i from public.immunizations where id = p_id and deleted_at is null;
  if v_i.id is null or not public.vaccination_can_write(v_i.org_id) then
    raise exception 'Dose introuvable.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi cette dose est annulée.' using errcode = '22023';
  end if;
  update public.immunizations
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_i.id;
end;
$$;

-- Résultat d'un laboratoire extérieur depuis l'onglet Grossesse (habilités). p_client_id :
-- comme plus haut.
create function public.add_external_test_result(
  p_pregnancy_id uuid, p_rapid_test_type_id uuid, p_taken_on date, p_lab_name text,
  p_result text, p_value_number numeric, p_value_text text, p_note text, p_client_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return public.external_test_result_insert(
    public.pregnancy_for_write(p_pregnancy_id), p_rapid_test_type_id, p_taken_on, p_lab_name,
    p_result, p_value_number, p_value_text, p_note, p_client_id, null);
end;
$$;

create function public.remove_external_test_result(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.external_test_results;
begin
  -- Même réponse que la ligne existe ou non, pour qui n'a pas le droit.
  select * into v_r from public.external_test_results where id = p_id and deleted_at is null;
  if v_r.id is null or v_r.pregnancy_id is null or not public.maternity_can_write(v_r.org_id) then
    raise exception 'Résultat introuvable.' using errcode = '42501';
  end if;
  perform public.pregnancy_for_write(v_r.pregnancy_id);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi ce résultat est retiré.' using errcode = '22023';
  end if;
  update public.external_test_results
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_r.id;
end;
$$;

-- Examens de la grossesse (habilités seulement, liste entière ou rien) : pour chaque examen
-- de la liste, résultats des consultations validées de la grossesse (examens rapides) et
-- des laboratoires extérieurs, le plus récent en premier ; groupe sanguin et rhésus.
-- Une ligne READ par ouverture si un résultat sensible est renvoyé : l'écran garde le même
-- p_opening_id tant qu'il reste ouvert (rechargements de React Query compris), une
-- réouverture en crée un nouveau (log_sensitive_opening, étape 14 C). Sans identifiant :
-- refusé, pour ne jamais journaliser chaque rechargement.
create function public.get_pregnancy_tests(p_pregnancy_id uuid, p_opening_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g     public.pregnancies;
  v_ref   date;
  v_max   integer;
  v_tz    text;
  v_items jsonb;
begin
  select * into v_g from public.pregnancies where id = p_pregnancy_id and deleted_at is null;
  if v_g.id is null or not public.maternity_can_write(v_g.org_id) then
    raise exception 'Les examens de la grossesse sont réservés aux soignants habilités.'
      using errcode = '42501';
  end if;
  if p_opening_id is null then
    raise exception 'Identifiant d''ouverture manquant : rechargez la page.' using errcode = '22023';
  end if;
  select reference_date into v_ref from public.pregnancy_datings where id = v_g.current_dating_id;
  select max_gestational_days into v_max from public.maternity_settings where org_id = v_g.org_id;
  v_tz := coalesce((select timezone from public.organizations where id = v_g.org_id), 'Africa/Dakar');

  with r as (
    select t.rapid_test_type_id as type_id, 'here'::text as source, e.id as encounter_id,
           null::uuid as external_id,
           (e.started_at at time zone v_tz)::date as on_date, null::text as lab_name,
           t.result, t.value_number, t.value_text, t.unit, t.is_sensitive, t.created_at
      from public.encounter_tests t
      join public.encounters e on e.id = t.encounter_id
     where e.patient_id = v_g.patient_id and e.status = 'validated' and e.deleted_at is null
       and t.deleted_at is null
       and (e.started_at at time zone v_tz)::date between v_ref and v_ref + v_max
    union all
    select x.rapid_test_type_id, 'external', null, x.id, x.taken_on, x.lab_name,
           x.result, x.value_number, x.value_text, x.unit, x.is_sensitive, x.created_at
      from public.external_test_results x
     where x.pregnancy_id = v_g.id and x.deleted_at is null)
  select coalesce(jsonb_agg(jsonb_build_object(
           'rapid_test_type_id', a.rapid_test_type_id, 'label', rt.label,
           'result_kind', rt.result_kind, 'unit', rt.unit, 'is_sensitive', rt.is_sensitive,
           'results', coalesce((select jsonb_agg(jsonb_build_object(
                         'source', r.source, 'encounter_id', r.encounter_id,
                         'external_id', r.external_id, 'date', r.on_date,
                         'lab_name', r.lab_name, 'result', r.result,
                         'value_number', r.value_number, 'value_text', r.value_text,
                         'unit', r.unit)
                       order by r.on_date desc, r.created_at desc)
                         from r where r.type_id = a.rapid_test_type_id), '[]'::jsonb))
         order by a.sort_order, rt.label), '[]'::jsonb)
    into v_items
    from public.anc_tests a
    join public.rapid_test_types rt on rt.id = a.rapid_test_type_id
   where a.org_id = v_g.org_id and a.deleted_at is null and a.is_active;

  if exists (select 1 from jsonb_array_elements(v_items) i
              where (i ->> 'is_sensitive')::boolean
                and jsonb_array_length(i -> 'results') > 0) then
    perform public.log_sensitive_opening(v_g.org_id, 'pregnancies', v_g.id, v_g.patient_id,
                                         p_opening_id);
  end if;

  return jsonb_build_object(
    'pregnancy_id', v_g.id,
    'blood_group', (select m.blood_group from public.patient_medical m
                     where m.patient_id = v_g.patient_id and m.deleted_at is null limit 1),
    'tests', v_items);
end;
$$;


-- =============================================================================
-- 9. Fusion de dossiers
-- =============================================================================

-- Fiabilité d'une dose : faite ici (2) avant le carnet (0), puis date au jour (2), au mois
-- (1), à l'année (0). Interne.
create function public.immunization_rank(p public.immunizations)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p.origin when 'here' then 10 else 0 end
       + case p.date_precision when 'day' then 2 when 'month' then 1 else 0 end;
$$;

-- Vaccins et résultats extérieurs suivent le dossier gardé. Jamais de refus à cause d'une
-- donnée médicale (le refus bloquerait l'accueil et lui révélerait des vaccins) : deux doses
-- du même rang, on garde la plus fiable (faite ici avant le carnet, puis la date la plus
-- précise, puis celle du dossier gardé) et l'autre est annulée avec le motif « Doublon après
-- fusion », journalisé, sans aucun message.
create function public.patients_merge_relink_anc_care()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doublon record;
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  for v_doublon in
    select case when public.immunization_rank(a) > public.immunization_rank(b) then b.id else a.id end
             as perdante
      from public.immunizations a
      join public.immunizations b
        on b.patient_id = new.merged_into_id and b.vaccine_code = a.vaccine_code
       and b.dose_rank = a.dose_rank and b.deleted_at is null
     where a.patient_id = new.id and a.deleted_at is null
  loop
    update public.immunizations
       set deleted_at = now(), removed_reason = 'Doublon après fusion'
     where id = v_doublon.perdante;
  end loop;
  update public.immunizations set patient_id = new.merged_into_id where patient_id = new.id;
  update public.external_test_results set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

create trigger patients_merge_relink_anc_care
  after update of merged_into_id on public.patients
  for each row execute function public.patients_merge_relink_anc_care();


-- =============================================================================
-- 10. Fusion de dossiers : deux grossesses en cours
-- =============================================================================

-- Délai après la DPA au-delà duquel une grossesse restée « en cours » est tenue pour
-- terminée ailleurs (fusion de dossiers). 42 jours (6 semaines) proposés, À VALIDER.
alter table public.maternity_setting_defaults
  add column overdue_closure_days smallint not null default 42
    check (overdue_closure_days between 0 and 120);
alter table public.maternity_settings
  add column overdue_closure_days smallint not null default 42
    check (overdue_closure_days between 0 and 120);
grant update (overdue_closure_days) on public.maternity_settings to authenticated;

-- Identique à la partie B1, plus le délai après la DPA.
create or replace function public.seed_maternity_settings(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.maternity_settings (org_id, edd_method, pregnancy_length_days,
                                         max_gestational_days, anc_model_code,
                                         overdue_closure_days, created_by)
  select o.id, d.edd_method, d.pregnancy_length_days, d.max_gestational_days, d.anc_model_code,
         d.overdue_closure_days, null
    from public.organizations o
    join public.maternity_setting_defaults d on d.plan_code = o.type
   where o.id = p_org_id
  on conflict (org_id) do nothing;
end;
$$;

-- Repère « Datation à vérifier (fusion) » : posé quand les deux grossesses fusionnées
-- n'avaient pas la même DDR retenue, levé par un habilité (confirm_pregnancy_dating).
alter table public.pregnancies add column dating_review_since timestamptz;

-- B1 : une CPN figée ; s'ajoute ici le rattachement à la grossesse gardée après fusion.
create or replace function public.anc_visits_guard()
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
  if public.pregnancy_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.origin = 'elsewhere' and old.deleted_at is null and new.deleted_at is not null
     and (to_jsonb(new) - 'deleted_at' - 'removed_reason' - 'updated_at')
         = (to_jsonb(old) - 'deleted_at' - 'removed_reason' - 'updated_at') then
    return new;
  end if;
  raise exception 'CPN enregistrée : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

-- Nombre de saisies d'une grossesse (datations, CPN, soins, conseils, résultats extérieurs,
-- situations, vaccins). Interne.
create function public.pregnancy_entry_count(p_pregnancy_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select ((select count(*) from public.pregnancy_datings where pregnancy_id = p_pregnancy_id)
        + (select count(*) from public.anc_visits where pregnancy_id = p_pregnancy_id and deleted_at is null)
        + (select count(*) from public.maternal_interventions where pregnancy_id = p_pregnancy_id and deleted_at is null)
        + (select count(*) from public.anc_counselling_given where pregnancy_id = p_pregnancy_id)
        + (select count(*) from public.external_test_results where pregnancy_id = p_pregnancy_id and deleted_at is null)
        + (select count(*) from public.pregnancy_conditions where pregnancy_id = p_pregnancy_id and deleted_at is null)
        + (select count(*) from public.immunizations where pregnancy_id = p_pregnancy_id and deleted_at is null))::integer;
$$;

-- Même grossesse saisie deux fois : p_lose rattachée à p_keep, puis retirée. Interne.
create function public.pregnancies_merge(p_keep uuid, p_lose uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref_keep date;
  v_ref_lose date;
begin
  select d.reference_date into v_ref_keep
    from public.pregnancies g join public.pregnancy_datings d on d.id = g.current_dating_id
   where g.id = p_keep;
  select d.reference_date into v_ref_lose
    from public.pregnancies g join public.pregnancy_datings d on d.id = g.current_dating_id
   where g.id = p_lose;

  -- Situation en cours dans les deux : celle de la grossesse retirée est retirée aussi
  -- (la grossesse gardée l'a déjà) ; sinon elle passe à la grossesse gardée.
  update public.pregnancy_conditions l
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
   where l.pregnancy_id = p_lose and l.ended_on is null and l.deleted_at is null
     and exists (select 1 from public.pregnancy_conditions k
                  where k.pregnancy_id = p_keep and k.condition_code = l.condition_code
                    and k.ended_on is null and k.deleted_at is null);

  update public.pregnancies
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
   where id = p_lose;

  -- Datations de la grossesse retirée recopiées dans l'historique de la grossesse gardée
  -- (la datation retenue ne change pas).
  insert into public.pregnancy_datings (org_id, pregnancy_id, kind, lmp_date, exam_date,
                                        ga_days_at_exam, edd_reported, edd_method, length_days,
                                        reference_date, edd, note, created_at, created_by)
  select d.org_id, p_keep, d.kind, d.lmp_date, d.exam_date, d.ga_days_at_exam, d.edd_reported,
         d.edd_method, d.length_days, d.reference_date, d.edd,
         left(coalesce(d.note || ' ', '') || '(reprise d''un dossier fusionné)', 300),
         d.created_at, d.created_by
    from public.pregnancy_datings d
   where d.pregnancy_id = p_lose and d.deleted_at is null;

  update public.anc_visits             set pregnancy_id = p_keep where pregnancy_id = p_lose;
  update public.maternal_interventions set pregnancy_id = p_keep where pregnancy_id = p_lose;
  update public.anc_counselling_given  set pregnancy_id = p_keep where pregnancy_id = p_lose;
  update public.external_test_results  set pregnancy_id = p_keep where pregnancy_id = p_lose;
  update public.pregnancy_conditions   set pregnancy_id = p_keep where pregnancy_id = p_lose;
  update public.immunizations          set pregnancy_id = p_keep where pregnancy_id = p_lose;

  -- Même fait noté dans les deux grossesses : la copie « faite ailleurs » est retirée
  -- « Doublon après fusion » (celle faite ici, sinon la plus ancienne saisie, reste).
  --   CPN : même date ;
  update public.anc_visits a
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
   where a.pregnancy_id = p_keep and a.origin = 'elsewhere' and a.deleted_at is null
     and exists (select 1 from public.anc_visits b
                  where b.pregnancy_id = p_keep and b.deleted_at is null and b.id <> a.id
                    and b.visit_date = a.visit_date
                    and (b.origin = 'here' or (b.created_at, b.id) < (a.created_at, a.id)));
  --   soins : même type et même date ;
  update public.maternal_interventions a
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
   where a.pregnancy_id = p_keep and a.origin = 'elsewhere' and a.deleted_at is null
     and a.given_on is not null
     and exists (select 1 from public.maternal_interventions b
                  where b.pregnancy_id = p_keep and b.deleted_at is null and b.id <> a.id
                    and b.type_id = a.type_id and b.given_on = a.given_on
                    and (b.origin = 'here' or (b.created_at, b.id) < (a.created_at, a.id)));
  --   soin à nombre maximal (moustiquaire : une seule, même sans date) : les « faits
  --   ailleurs » en trop.
  update public.maternal_interventions a
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
    from (select i.id,
                 row_number() over (partition by i.type_id
                                    order by (i.origin = 'here') desc, i.created_at, i.id) as rang,
                 t.max_count
            from public.maternal_interventions i
            join public.maternal_intervention_types t on t.id = i.type_id
           where i.pregnancy_id = p_keep and i.deleted_at is null
             and t.max_count is not null) x
   where a.id = x.id and a.origin = 'elsewhere' and x.rang > x.max_count;
  --   résultats extérieurs : même examen, même date, même résultat.
  update public.external_test_results a
     set deleted_at = now(), removed_reason = 'Doublon après fusion'
   where a.pregnancy_id = p_keep and a.deleted_at is null
     and exists (select 1 from public.external_test_results b
                  where b.pregnancy_id = p_keep and b.deleted_at is null and b.id <> a.id
                    and b.rapid_test_type_id = a.rapid_test_type_id and b.taken_on = a.taken_on
                    and b.result is not distinct from a.result
                    and b.value_number is not distinct from a.value_number
                    and b.value_text is not distinct from a.value_text
                    and (b.created_at, b.id) < (a.created_at, a.id));

  if v_ref_keep is distinct from v_ref_lose then
    update public.pregnancies set dating_review_since = now() where id = p_keep;
  end if;
end;
$$;

-- Remplace patients_merge_relink_maternity (partie A) : plus jamais de refus. Deux
-- grossesses en cours :
--   - l'une au-delà de sa DPA + overdue_closure_days : autre grossesse, terminée ailleurs,
--     close (« ended », issue non renseignée) ; les deux au-delà : la plus ancienne (DPA la
--     plus tôt) est close, l'autre reste en cours ;
--   - sinon, même grossesse : la plus remplie est gardée (égalité : celle du dossier gardé).
create or replace function public.patients_merge_relink_maternity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a     record;
  v_b     record;
  v_today date;
  v_delai integer;
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  -- a : grossesse en cours du dossier absorbé ; b : celle du dossier gardé.
  select g.id, d.edd, public.pregnancy_entry_count(g.id) as n into v_a
    from public.pregnancies g join public.pregnancy_datings d on d.id = g.current_dating_id
   where g.patient_id = new.id and g.status = 'ongoing' and g.deleted_at is null;
  select g.id, d.edd, public.pregnancy_entry_count(g.id) as n into v_b
    from public.pregnancies g join public.pregnancy_datings d on d.id = g.current_dating_id
   where g.patient_id = new.merged_into_id and g.status = 'ongoing' and g.deleted_at is null;

  if v_a.id is not null and v_b.id is not null then
    v_today := public.org_local_date(new.org_id);
    select overdue_closure_days into v_delai from public.maternity_settings where org_id = new.org_id;
    v_delai := coalesce(v_delai, 42);
    if v_today > v_a.edd + v_delai or v_today > v_b.edd + v_delai then
      update public.pregnancies set status = 'ended'
       where id = case when v_today > v_a.edd + v_delai and v_today > v_b.edd + v_delai
                       then case when v_a.edd < v_b.edd then v_a.id else v_b.id end
                       when v_today > v_a.edd + v_delai then v_a.id
                       else v_b.id end;
    elsif v_a.n > v_b.n then
      perform public.pregnancies_merge(v_a.id, v_b.id);
    else
      perform public.pregnancies_merge(v_b.id, v_a.id);
    end if;
  end if;

  update public.pregnancies set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

-- « J'ai vérifié la datation » : lève le repère posé par une fusion (habilités).
create function public.confirm_pregnancy_dating(p_pregnancy_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g public.pregnancies;
begin
  v_g := public.pregnancy_for_write(p_pregnancy_id);
  update public.pregnancies set dating_review_since = null where id = v_g.id;
end;
$$;

-- Remplace get_pregnancy (partie A) : recopie à l'identique, plus le repère
-- « Datation à vérifier (fusion) », pour les habilités seulement.
create or replace function public.get_pregnancy(p_pregnancy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_g     public.pregnancies;
  v_d     public.pregnancy_datings;
  v_today date;
begin
  select * into v_g from public.pregnancies where id = p_pregnancy_id and deleted_at is null;
  if v_g.id is null or not public.maternity_can_read(v_g.org_id) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  select * into v_d from public.pregnancy_datings where id = v_g.current_dating_id;
  v_today := public.org_local_date(v_g.org_id);
  return jsonb_build_object(
    'id', v_g.id,
    'patient_id', v_g.patient_id,
    'status', v_g.status,
    'opened_on', v_g.opened_on,
    'gravidity', v_g.gravidity,
    'parity', v_g.parity,
    'living_children', v_g.living_children,
    'today', v_today,
    'ga_days', case when v_g.status = 'ongoing' then v_today - v_d.reference_date end,
    'edd', v_d.edd,
    'reference_date', v_d.reference_date,
    'current_dating_id', v_d.id,
    'blood_group', (select m.blood_group from public.patient_medical m
                     where m.patient_id = v_g.patient_id and m.deleted_at is null limit 1),
    'datings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'kind', d.kind, 'lmp_date', d.lmp_date, 'exam_date', d.exam_date,
               'ga_days_at_exam', d.ga_days_at_exam, 'edd_reported', d.edd_reported,
               'edd_method', d.edd_method, 'length_days', d.length_days,
               'reference_date', d.reference_date, 'edd', d.edd, 'note', d.note,
               'created_at', d.created_at, 'author_name', public.user_display_name(d.created_by),
               'is_current', d.id = v_g.current_dating_id)
             order by d.created_at desc)
        from public.pregnancy_datings d where d.pregnancy_id = v_g.id), '[]'::jsonb))
    || case when public.maternity_can_write(v_g.org_id) and v_g.dating_review_since is not null
            then jsonb_build_object('dating_review_since', v_g.dating_review_since)
            else '{}'::jsonb end;
end;
$$;


-- =============================================================================
-- 11. Droits d'accès
-- =============================================================================

revoke all on public.maternal_condition_types, public.pregnancy_conditions,
              public.maternal_intervention_type_templates, public.maternal_intervention_types,
              public.maternal_interventions, public.anc_counselling_topic_templates,
              public.anc_counselling_topics, public.anc_counselling_given, public.vaccines,
              public.vaccine_doses, public.immunizations, public.anc_test_templates,
              public.anc_tests, public.external_test_results
from anon, authenticated;

-- Référentiels et listes : lus par les membres (aucune donnée de patient) ; listes de la
-- structure modifiées par owner, admin et sage-femme. Données des patientes : aucun accès
-- direct.
grant select on public.maternal_condition_types, public.maternal_intervention_type_templates,
                public.maternal_intervention_types, public.anc_counselling_topic_templates,
                public.anc_counselling_topics, public.vaccines, public.vaccine_doses,
                public.anc_test_templates, public.anc_tests to authenticated;
grant update (label, dose_label, min_ga_days, min_interval_days, max_count, block_message,
              prescription, sort_order, is_active)
  on public.maternal_intervention_types to authenticated;
grant insert (org_id, label, sort_order) on public.anc_counselling_topics to authenticated;
grant update (label, sort_order, is_active) on public.anc_counselling_topics to authenticated;
grant insert (org_id, rapid_test_type_id, sort_order) on public.anc_tests to authenticated;
grant update (sort_order, is_active) on public.anc_tests to authenticated;

alter table public.maternal_condition_types             enable row level security;
alter table public.pregnancy_conditions                 enable row level security;
alter table public.maternal_intervention_type_templates enable row level security;
alter table public.maternal_intervention_types          enable row level security;
alter table public.maternal_interventions               enable row level security;
alter table public.anc_counselling_topic_templates      enable row level security;
alter table public.anc_counselling_topics               enable row level security;
alter table public.anc_counselling_given                enable row level security;
alter table public.vaccines                             enable row level security;
alter table public.vaccine_doses                        enable row level security;
alter table public.immunizations                        enable row level security;
alter table public.anc_test_templates                   enable row level security;
alter table public.anc_tests                            enable row level security;
alter table public.external_test_results                enable row level security;

create policy maternal_condition_types_select on public.maternal_condition_types
  for select to authenticated using (true);
create policy maternal_intervention_type_templates_select on public.maternal_intervention_type_templates
  for select to authenticated using (true);
create policy maternal_intervention_types_select on public.maternal_intervention_types
  for select to authenticated using (public.is_member(org_id));
create policy maternal_intervention_types_update on public.maternal_intervention_types
  for update to authenticated
  using (public.maternity_can_configure(org_id))
  with check (public.maternity_can_configure(org_id));
create policy anc_counselling_topic_templates_select on public.anc_counselling_topic_templates
  for select to authenticated using (true);
create policy anc_counselling_topics_select on public.anc_counselling_topics
  for select to authenticated using (public.is_member(org_id));
create policy anc_counselling_topics_insert on public.anc_counselling_topics
  for insert to authenticated with check (public.maternity_can_configure(org_id));
create policy anc_counselling_topics_update on public.anc_counselling_topics
  for update to authenticated
  using (public.maternity_can_configure(org_id))
  with check (public.maternity_can_configure(org_id));
create policy vaccines_select on public.vaccines
  for select to authenticated using (true);
create policy vaccine_doses_select on public.vaccine_doses
  for select to authenticated using (true);
create policy anc_test_templates_select on public.anc_test_templates
  for select to authenticated using (true);
create policy anc_tests_select on public.anc_tests
  for select to authenticated using (public.is_member(org_id));
create policy anc_tests_insert on public.anc_tests
  for insert to authenticated with check (public.maternity_can_configure(org_id));
create policy anc_tests_update on public.anc_tests
  for update to authenticated
  using (public.maternity_can_configure(org_id))
  with check (public.maternity_can_configure(org_id));

-- Fonctions internes : jamais appelées par le client.
revoke execute on function
  public.pregnancy_conditions_guard(), public.pregnancy_active_conditions(uuid),
  public.anc_draft_conditions(jsonb),
  public.maternal_interventions_guard(), public.anc_counselling_given_guard(),
  public.seed_anc_care(uuid), public.seed_anc_tests(uuid), public.organizations_seed_anc_care(),
  public.vaccination_can_read(uuid), public.vaccination_can_write(uuid),
  public.immunizations_guard(), public.vaccine_next_dose(uuid, text),
  public.vaccine_status_compute(uuid, text), public.external_test_results_guard(),
  public.maternal_interventions_numbered(uuid), public.maternal_care_status(uuid, text[]),
  public.maternal_intervention_check(public.maternal_intervention_types, uuid, date, integer, text[]),
  public.anc_care_from_encounter(public.encounters, jsonb),
  public.external_test_result_insert(public.pregnancies, uuid, date, text, text, numeric, text, text, uuid, uuid),
  public.immunization_rank(public.immunizations), public.patients_merge_relink_anc_care(),
  public.pregnancy_row_is_merge_relink(jsonb, jsonb), public.pregnancy_entry_count(uuid),
  public.pregnancies_merge(uuid, uuid)
from public, anon, authenticated;

-- Fonctions appelées par le client : jamais par anon.
revoke execute on function
  public.get_encounter_anc_care(uuid), public.get_anc_care(uuid),
  public.add_external_intervention(uuid, uuid, date, text, text, uuid),
  public.remove_external_intervention(uuid, text), public.remove_pregnancy_condition(uuid, text),
  public.vaccine_status(uuid, text),
  public.add_immunization_from_card(uuid, text, integer, date, text, text, text, uuid),
  public.void_immunization(uuid, text),
  public.add_external_test_result(uuid, uuid, date, text, text, numeric, text, text, uuid),
  public.remove_external_test_result(uuid, text), public.get_pregnancy_tests(uuid, uuid),
  public.confirm_pregnancy_dating(uuid)
from public, anon;
grant execute on function
  public.get_encounter_anc_care(uuid), public.get_anc_care(uuid),
  public.add_external_intervention(uuid, uuid, date, text, text, uuid),
  public.remove_external_intervention(uuid, text), public.remove_pregnancy_condition(uuid, text),
  public.vaccine_status(uuid, text),
  public.add_immunization_from_card(uuid, text, integer, date, text, text, text, uuid),
  public.void_immunization(uuid, text),
  public.add_external_test_result(uuid, uuid, date, text, text, numeric, text, text, uuid),
  public.remove_external_test_result(uuid, text), public.get_pregnancy_tests(uuid, uuid),
  public.confirm_pregnancy_dating(uuid)
to authenticated;
