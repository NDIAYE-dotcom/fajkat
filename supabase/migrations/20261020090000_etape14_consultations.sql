-- =============================================================================
-- Étape 14, partie A : consultation et dossier médical (base, aucun écran)
-- -----------------------------------------------------------------------------
-- 1. Droits : lire une consultation = soignants (médecin, sage-femme, infirmier,
--    aide-soignant, owner ou admin qui exerce) ; écrire = les mêmes sans l'aide-soignant.
--    Une consultation sensible n'est lue que par ceux qui écrivent. Accueil, caissier,
--    comptable, pharmacien et owner qui n'exerce pas : rien, ni à l'écran ni par l'API.
--    Aucune table médicale n'est lisible directement : tout passe par des fonctions.
-- 2. Référentiels paramétrables, recopiés dans chaque structure : types de consultation,
--    examens rapides, modèles de certificat ; voies d'administration (référentiel commun) ;
--    établissements de référence (propres à la structure).
-- 3. Catalogue des diagnostics (diagnoses_catalog) : référentiel commun (org_id nul,
--    rempli par la migration etape14_catalogue) et ajouts propres à une structure ;
--    maladies à déclaration obligatoire (is_notifiable, notification_delay) et
--    diagnostics sensibles (is_sensitive) marqués dans la table, rien en dur. Favoris par
--    soignant (diagnosis_favorites).
-- 4. Consultation (encounters) : tant qu'elle est en brouillon, son contenu vit dans
--    draft_data (un seul document jsonb, enregistré toutes les 10 secondes), lisible et
--    modifiable par son seul auteur (author_id). À la validation, le contenu est recopié
--    dans les colonnes et dans les tables diagnoses, encounter_tests, prescriptions et
--    prescription_items ; draft_data est vidé.
--    Concurrence : un seul brouillon ouvert par passage ; seul l'auteur l'écrit ; chaque
--    enregistrement envoie la version lue, une version dépassée est refusée (autre
--    appareil). Relève d'équipe : un autre soignant « reprend » le brouillon
--    (take_over_encounter) : contenu gardé, auteur changé, encounter_handovers et
--    notification à l'auteur précédent.
-- 5. Verrous dans la base, valables pour tout le monde (triggers) : une consultation
--    validée ne se modifie plus, ses diagnostics, examens et ordonnances non plus ; rien
--    ne se supprime ; une consultation (ou un antécédent) sensible ne redevient jamais non
--    sensible. Seule exception : la fusion de dossiers (patient_id vers le dossier gardé).
--    Corrections : avenants datés (encounter_addenda), en ajout seul.
-- 6. Ordonnance : texte libre aujourd'hui ; prescription_items.product_id est prévu pour
--    le catalogue de la pharmacie (étape 17 : clé étrangère et contrôle du stock). Une
--    ordonnance est figée dès son enregistrement (à la validation, ou ajoutée après).
-- 7. Références (feature « references ») et certificats : documents figés dès leur
--    émission ; seule la contre-référence se saisit après coup, une fois.
-- 8. Maladie à déclaration obligatoire : la validation crée une alerte dans
--    surveillance_alerts (module de surveillance, étape 28) ; jamais pendant le brouillon.
-- 9. Journal : audit_logs reçoit l'action « READ » pour chaque lecture d'une consultation
--    ou d'un antécédent sensible (sans contenu). Ces lignes ne sont lues que par un owner
--    ou un admin qui exerce ; les autres owners et admins ont un résumé sans patient
--    (sensitive_reads_summary). Il en va de même des lignes INSERT / UPDATE des tables
--    médicales (encounters, ordonnances, références, certificats, antécédents…).
--    Maladie à déclaration immédiate : notification aux soignants habilités et à l'owner,
--    sans nom de patient. Les enregistrements automatiques du brouillon ne sont pas
--    journalisés (un toutes les 10 secondes) ; création, reprise, validation, sensibilité
--    et abandon le sont.
-- =============================================================================


-- =============================================================================
-- 1. Droits
-- =============================================================================

create function public.encounters_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'consultations')
     and public.patients_can_read_medical(p_org_id);
$$;

-- Écrire une consultation, et lire les consultations sensibles : médecin, sage-femme,
-- infirmier, owner ou admin qui exerce. L'aide-soignant lit seulement.
create function public.encounters_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'consultations')
     and public.patients_can_read_sensitive(p_org_id);
$$;

create function public.encounters_can_configure(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'consultations')
     and public.has_role(p_org_id, array['owner', 'admin']);
$$;

-- Droits de l'utilisateur connecté, pour le front (affichage seulement : la base décide).
create function public.encounter_permissions(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'read',       public.encounters_can_read(p_org_id),
    'write',      public.encounters_can_write(p_org_id),
    'sensitive',  public.encounters_can_write(p_org_id),
    'configure',  public.encounters_can_configure(p_org_id),
    'references', public.org_has_feature(p_org_id, 'references')
                  and public.encounters_can_write(p_org_id));
$$;

create function public.user_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nullif(btrim(full_name), '') from public.profiles where id = p_user_id),
                  'Membre sans nom');
$$;

-- Conversion sans erreur : un identifiant illisible dans un brouillon vaut « absent ».
create function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create function public.jsonb_array_or_empty(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;


-- =============================================================================
-- 2. Référentiels
-- =============================================================================

-- Types de consultation proposés à la création d'une structure. plan_code nul : les deux
-- offres. is_sensitive_default : consultation sensible d'office (PF, dépistage).
create table public.encounter_type_templates (
  code                 text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  plan_code            text check (plan_code in ('poste_sante', 'clinique')),
  label                text not null check (char_length(btrim(label)) between 2 and 80),
  is_sensitive_default boolean not null default false,
  sort_order           integer not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

insert into public.encounter_type_templates (code, plan_code, label, is_sensitive_default, sort_order)
values
  ('consultation',    null, 'Consultation',                       false, 10),
  ('controle',        null, 'Consultation de contrôle',           false, 20),
  ('suivi_chronique', null, 'Suivi d''une maladie chronique',     false, 30),
  ('soins',           null, 'Soins',                              false, 40),
  ('pf',              null, 'Planification familiale',           true,  50),
  ('depistage',       null, 'Dépistage',                          true,  60);

create table public.encounter_types (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id),
  template_code        text references public.encounter_type_templates (code),
  label                text not null check (char_length(btrim(label)) between 2 and 80),
  is_sensitive_default boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at           timestamptz,
  unique (id, org_id)
);
create index encounter_types_org_idx on public.encounter_types (org_id);

-- Examens rapides au lit du patient. result_kind : binary (positif / négatif / invalide),
-- number (valeur et unité), text (lecture libre, par exemple la bandelette urinaire).
create table public.rapid_test_type_templates (
  code         text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label        text not null check (char_length(btrim(label)) between 2 and 80),
  result_kind  text not null check (result_kind in ('binary', 'number', 'text')),
  unit         text check (char_length(unit) <= 20),
  is_sensitive boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.rapid_test_type_templates (code, label, result_kind, unit, is_sensitive, sort_order)
values
  ('tdr_palu',       'TDR paludisme',                 'binary', null,    false, 10),
  ('test_grossesse', 'Test de grossesse urinaire',    'binary', null,    false, 20),
  ('glycemie',       'Glycémie capillaire',           'number', 'g/L',   false, 30),
  ('hemoglobine',    'Hémoglobine (Hemocue)',         'number', 'g/dL',  false, 40),
  ('bandelette',     'Bandelette urinaire',           'text',   null,    false, 50),
  ('tdr_vih',        'TDR VIH',                       'binary', null,    true,  60),
  ('tdr_syphilis',   'TDR syphilis',                  'binary', null,    true,  70),
  ('tdr_hepatite_b', 'TDR hépatite B (AgHBs)',        'binary', null,    false, 80);

create table public.rapid_test_types (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  template_code text references public.rapid_test_type_templates (code),
  label         text not null check (char_length(btrim(label)) between 2 and 80),
  result_kind   text not null check (result_kind in ('binary', 'number', 'text')),
  unit          text check (char_length(unit) <= 20),
  is_sensitive  boolean not null default false,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id)
);
create index rapid_test_types_org_idx on public.rapid_test_types (org_id);

-- Voies d'administration (référentiel commun).
create table public.drug_routes (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  label      text not null check (char_length(btrim(label)) between 2 and 60),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.drug_routes (code, label, sort_order) values
  ('orale',       'Par la bouche',              10),
  ('sublinguale', 'Sous la langue',             20),
  ('cutanee',     'Sur la peau',                30),
  ('oculaire',    'Dans l''œil',                40),
  ('auriculaire', 'Dans l''oreille',            50),
  ('nasale',      'Dans le nez',                60),
  ('inhalee',     'Inhalation',                 70),
  ('rectale',     'Par voie rectale',           80),
  ('vaginale',    'Par voie vaginale',          90),
  ('im',          'Injection intramusculaire', 100),
  ('iv',          'Injection intraveineuse',   110),
  ('sc',          'Injection sous-cutanée',    120);

-- Modèles de certificat. Mots entre accolades remplacés à l'écran avant l'émission :
-- {patient}, {date_naissance}, {structure}, {praticien}, {date}, {jours}, {debut}, {fin}.
-- Le texte final est celui que le soignant a relu et modifié ; jamais le diagnostic par
-- défaut (includes_diagnosis faux).
create table public.certificate_template_defaults (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label      text not null check (char_length(btrim(label)) between 2 and 80),
  body       text not null check (char_length(btrim(body)) between 10 and 4000),
  has_days   boolean not null default false,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.certificate_template_defaults (code, label, body, has_days, sort_order) values
  ('repos', 'Certificat de repos',
   'Je soussigné(e), {praticien}, certifie avoir examiné ce jour {patient}, né(e) le {date_naissance}, '
   || 'dont l''état de santé nécessite un repos de {jours} jour(s), du {debut} au {fin} inclus.'
   || E'\n\nCertificat établi à la demande de l''intéressé(e) et remis en main propre pour servir et valoir ce que de droit.',
   true, 10),
  ('aptitude', 'Certificat d''aptitude',
   'Je soussigné(e), {praticien}, certifie avoir examiné ce jour {patient}, né(e) le {date_naissance}, '
   || 'et n''avoir constaté aucun signe clinique apparent contre-indiquant la pratique de : ……'
   || E'\n\nCertificat établi à la demande de l''intéressé(e) et remis en main propre pour servir et valoir ce que de droit.',
   false, 20),
  ('medical', 'Certificat médical',
   'Je soussigné(e), {praticien}, certifie avoir examiné ce jour {patient}, né(e) le {date_naissance}.'
   || E'\n\n……'
   || E'\n\nCertificat établi à la demande de l''intéressé(e) et remis en main propre pour servir et valoir ce que de droit.',
   false, 30);

create table public.certificate_templates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  template_code text references public.certificate_template_defaults (code),
  label         text not null check (char_length(btrim(label)) between 2 and 80),
  body          text not null check (char_length(btrim(body)) between 10 and 4000),
  has_days      boolean not null default false,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id)
);
create index certificate_templates_org_idx on public.certificate_templates (org_id);

-- Établissements vers lesquels la structure réfère (centre de santé, hôpital régional…).
create table public.referral_destinations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  name       text not null check (char_length(btrim(name)) between 2 and 120),
  kind       text not null default 'autre'
               check (kind in ('centre_sante', 'hopital', 'clinique', 'autre')),
  phone      text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  address    text check (char_length(address) <= 200),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  unique (id, org_id)
);
create index referral_destinations_org_idx on public.referral_destinations (org_id);

create trigger encounter_type_templates_set_updated_at before update on public.encounter_type_templates
  for each row execute function public.set_updated_at();
create trigger encounter_types_set_updated_at before update on public.encounter_types
  for each row execute function public.set_updated_at();
create trigger rapid_test_type_templates_set_updated_at before update on public.rapid_test_type_templates
  for each row execute function public.set_updated_at();
create trigger rapid_test_types_set_updated_at before update on public.rapid_test_types
  for each row execute function public.set_updated_at();
create trigger drug_routes_set_updated_at before update on public.drug_routes
  for each row execute function public.set_updated_at();
create trigger certificate_template_defaults_set_updated_at before update on public.certificate_template_defaults
  for each row execute function public.set_updated_at();
create trigger certificate_templates_set_updated_at before update on public.certificate_templates
  for each row execute function public.set_updated_at();
create trigger referral_destinations_set_updated_at before update on public.referral_destinations
  for each row execute function public.set_updated_at();
create trigger encounter_types_audit after insert or update or delete on public.encounter_types
  for each row execute function public.audit_trigger();
create trigger rapid_test_types_audit after insert or update or delete on public.rapid_test_types
  for each row execute function public.audit_trigger();
create trigger certificate_templates_audit after insert or update or delete on public.certificate_templates
  for each row execute function public.audit_trigger();
create trigger referral_destinations_audit after insert or update or delete on public.referral_destinations
  for each row execute function public.audit_trigger();

-- Pré-remplissage, rejouable : rien n'est ajouté à une liste déjà remplie.
create function public.seed_encounter_settings(p_org_id uuid)
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

  if not exists (select 1 from public.encounter_types where org_id = p_org_id) then
    insert into public.encounter_types (org_id, template_code, label, is_sensitive_default,
                                        sort_order, created_by)
    select p_org_id, t.code, t.label, t.is_sensitive_default, t.sort_order, null
      from public.encounter_type_templates t
     where t.is_active and (t.plan_code is null or t.plan_code = v_type);
  end if;

  if not exists (select 1 from public.rapid_test_types where org_id = p_org_id) then
    insert into public.rapid_test_types (org_id, template_code, label, result_kind, unit,
                                         is_sensitive, sort_order, created_by)
    select p_org_id, t.code, t.label, t.result_kind, t.unit, t.is_sensitive, t.sort_order, null
      from public.rapid_test_type_templates t
     where t.is_active;
  end if;

  if not exists (select 1 from public.certificate_templates where org_id = p_org_id) then
    insert into public.certificate_templates (org_id, template_code, label, body, has_days,
                                              sort_order, created_by)
    select p_org_id, d.code, d.label, d.body, d.has_days, d.sort_order, null
      from public.certificate_template_defaults d
     where d.is_active;
  end if;
end;
$$;

create function public.organizations_seed_encounter_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_encounter_settings(new.id);
  return null;
end;
$$;

create trigger organizations_seed_encounter_settings
  after insert on public.organizations
  for each row execute function public.organizations_seed_encounter_settings();

select public.seed_encounter_settings(o.id) from public.organizations o;


-- =============================================================================
-- 3. Catalogue des diagnostics
-- =============================================================================

create table public.diagnoses_catalog (
  id                 uuid primary key default gen_random_uuid(),
  -- Nul : référentiel commun (migration etape14_catalogue, relu par un soignant) ;
  -- sinon, diagnostic ajouté par une structure.
  org_id             uuid references public.organizations (id),
  code               text check (code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$'),
  label              text not null check (char_length(btrim(label)) between 2 and 160),
  -- Autres noms cherchés : « palu », « crise de palu », « tension »…
  synonyms           text check (char_length(synonyms) <= 500),
  chapter            text check (char_length(chapter) <= 60),
  is_notifiable      boolean not null default false,
  -- immediate : déclaration sans délai (choléra, rougeole…) ; weekly : rapport hebdomadaire.
  notification_delay text check (notification_delay in ('immediate', 'weekly')),
  is_sensitive       boolean not null default false,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  search_text        text generated always as (
                       public.patient_normalize(coalesce(code, '') || ' ' || label || ' '
                                                || coalesce(synonyms, ''))) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint diagnoses_catalog_notifiable_check
    check (is_notifiable = (notification_delay is not null)),
  -- Une structure ne décide pas seule d'une maladie à déclaration obligatoire.
  constraint diagnoses_catalog_local_check check (org_id is null or not is_notifiable)
);

create unique index diagnoses_catalog_common_code_unique
  on public.diagnoses_catalog (code) where org_id is null and code is not null and deleted_at is null;
create index diagnoses_catalog_org_idx on public.diagnoses_catalog (org_id);
create index diagnoses_catalog_search_idx
  on public.diagnoses_catalog using gin (search_text extensions.gin_trgm_ops);

comment on table public.diagnoses_catalog is
  'Diagnostics (CIM-10) : référentiel commun (org_id nul) et ajouts d''une structure. '
  'À relire par un soignant avant la mise en production (docs/plus-tard.md).';

create trigger diagnoses_catalog_set_updated_at before update on public.diagnoses_catalog
  for each row execute function public.set_updated_at();
create trigger diagnoses_catalog_audit after insert or update or delete on public.diagnoses_catalog
  for each row execute function public.audit_trigger();

create table public.diagnosis_favorites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  catalog_id  uuid not null references public.diagnoses_catalog (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at  timestamptz,
  unique (org_id, user_id, catalog_id)
);

create trigger diagnosis_favorites_set_updated_at before update on public.diagnosis_favorites
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 4. Consultations et documents
-- =============================================================================

create table public.encounters (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  patient_id        uuid not null,
  visit_id          uuid,
  appointment_id    uuid,
  encounter_type_id uuid not null,
  -- Soignant qui tient la consultation (change lors d'une reprise) ; seul à écrire le
  -- brouillon. created_by garde celui qui l'a commencée.
  author_id         uuid not null default auth.uid() references auth.users (id),
  started_at        timestamptz not null default now(),
  status            text not null default 'draft' check (status in ('draft', 'validated')),
  -- Brouillon : un seul document, remplacé à chaque enregistrement. Vidé à la validation.
  draft_data        jsonb check (draft_data is null
                                 or (jsonb_typeof(draft_data) = 'object'
                                     and octet_length(draft_data::text) <= 200000)),
  version           integer not null default 1 check (version > 0),
  reason            text check (char_length(reason) <= 500),
  history           text check (char_length(history) <= 4000),
  examination       text check (char_length(examination) <= 4000),
  plan              text check (char_length(plan) <= 4000),
  is_sensitive      boolean not null default false,
  validated_at      timestamptz,
  validated_by      uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  -- Brouillon abandonné par son auteur ; jamais une consultation validée.
  deleted_at        timestamptz,
  unique (id, org_id),
  constraint encounters_validated_check check (
    (status = 'draft' and validated_at is null and validated_by is null)
    or (status = 'validated' and validated_at is not null and draft_data is null
        and nullif(btrim(reason), '') is not null)),
  constraint encounters_deleted_check check (deleted_at is null or status = 'draft'),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (visit_id, org_id) references public.visits (id, org_id),
  foreign key (appointment_id, org_id) references public.appointments (id, org_id),
  foreign key (encounter_type_id, org_id) references public.encounter_types (id, org_id)
);

-- Un seul brouillon ouvert par passage : deux soignants n'écrivent jamais la même
-- consultation en même temps.
create unique index encounters_visit_draft_unique
  on public.encounters (visit_id) where status = 'draft' and deleted_at is null and visit_id is not null;
create index encounters_patient_idx on public.encounters (patient_id, started_at desc);
create index encounters_author_draft_idx
  on public.encounters (org_id, author_id) where status = 'draft' and deleted_at is null;

comment on table public.encounters is
  'Consultations : secret médical. Aucune lecture directe (get_encounter, patient_timeline).';

create trigger encounters_set_updated_at before update on public.encounters
  for each row execute function public.set_updated_at();

-- Reprises d'un brouillon par un autre soignant (relève d'équipe). Ajout seul.
create table public.encounter_handovers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id),
  encounter_id uuid not null,
  from_user_id uuid references auth.users (id),
  to_user_id   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at   timestamptz,
  foreign key (encounter_id, org_id) references public.encounters (id, org_id)
);
create index encounter_handovers_encounter_idx on public.encounter_handovers (encounter_id);

-- Avenants : correction datée d'une consultation validée, avec son auteur. Ajout seul.
create table public.encounter_addenda (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id),
  encounter_id uuid not null,
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid not null default auth.uid() references auth.users (id),
  deleted_at   timestamptz,
  foreign key (encounter_id, org_id) references public.encounters (id, org_id)
);
create index encounter_addenda_encounter_idx on public.encounter_addenda (encounter_id, created_at);

-- Diagnostics d'une consultation validée. Code et libellé recopiés au moment du choix :
-- une correction ultérieure du catalogue ne change pas un dossier.
create table public.diagnoses (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  encounter_id       uuid not null,
  catalog_id         uuid references public.diagnoses_catalog (id),
  code               text check (char_length(code) <= 10),
  label              text not null check (char_length(btrim(label)) between 2 and 200),
  rank               text not null check (rank in ('primary', 'secondary')),
  is_sensitive       boolean not null default false,
  is_notifiable      boolean not null default false,
  notification_delay text check (notification_delay in ('immediate', 'weekly')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  foreign key (encounter_id, org_id) references public.encounters (id, org_id)
);
create unique index diagnoses_primary_unique
  on public.diagnoses (encounter_id) where rank = 'primary' and deleted_at is null;
create index diagnoses_encounter_idx on public.diagnoses (encounter_id);

-- Examens rapides réalisés pendant la consultation (libellé recopié).
create table public.encounter_tests (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  encounter_id       uuid not null,
  rapid_test_type_id uuid not null,
  label              text not null check (char_length(btrim(label)) between 2 and 80),
  result_kind        text not null check (result_kind in ('binary', 'number', 'text')),
  result             text check (result in ('positive', 'negative', 'invalid')),
  value_number       numeric(8,2),
  value_text         text check (char_length(value_text) <= 200),
  unit               text check (char_length(unit) <= 20),
  note               text check (char_length(note) <= 300),
  is_sensitive       boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint encounter_tests_value_check check (
    (result_kind = 'binary' and result is not null)
    or (result_kind = 'number' and value_number is not null)
    or (result_kind = 'text' and nullif(btrim(value_text), '') is not null)),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (rapid_test_type_id, org_id) references public.rapid_test_types (id, org_id)
);
create index encounter_tests_encounter_idx on public.encounter_tests (encounter_id);

-- Ordonnance : figée dès son enregistrement (locked_at), à la validation ou ajoutée après.
create table public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  encounter_id  uuid not null,
  patient_id    uuid not null,
  prescribed_by uuid not null default auth.uid() references auth.users (id),
  prescribed_at timestamptz not null default now(),
  note          text check (char_length(note) <= 500),
  locked_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  unique (id, org_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);
create index prescriptions_encounter_idx on public.prescriptions (encounter_id);
create index prescriptions_patient_idx on public.prescriptions (patient_id, prescribed_at desc);

-- Ligne d'ordonnance : produit du catalogue de la pharmacie (product_id, étape 17 : clé
-- étrangère ajoutée alors) ou texte libre (product_id nul). product_name toujours rempli :
-- c'est ce qui est imprimé. Posologie structurée matin / midi / soir / nuit.
create table public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  prescription_id uuid not null,
  product_id      uuid,
  product_name    text not null check (char_length(btrim(product_name)) between 2 and 120),
  dosage          text check (char_length(dosage) <= 60),
  form            text check (char_length(form) <= 60),
  route_code      text references public.drug_routes (code),
  dose_morning    numeric(5,2) check (dose_morning between 0 and 100),
  dose_noon       numeric(5,2) check (dose_noon between 0 and 100),
  dose_evening    numeric(5,2) check (dose_evening between 0 and 100),
  dose_night      numeric(5,2) check (dose_night between 0 and 100),
  dose_unit       text check (char_length(dose_unit) <= 30),
  as_needed       boolean not null default false,
  duration_days   smallint check (duration_days between 1 and 365),
  quantity        integer check (quantity between 1 and 10000),
  quantity_unit   text check (char_length(quantity_unit) <= 30),
  instructions    text check (char_length(instructions) <= 300),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at      timestamptz,
  foreign key (prescription_id, org_id) references public.prescriptions (id, org_id)
);
create index prescription_items_prescription_idx on public.prescription_items (prescription_id);

-- Lettre de référence (feature « references ») ; contre-référence saisie une fois, après.
create table public.referrals (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations (id),
  encounter_id             uuid not null,
  patient_id               uuid not null,
  destination_id           uuid,
  destination_name         text not null check (char_length(btrim(destination_name)) between 2 and 120),
  urgency                  text not null default 'routine' check (urgency in ('routine', 'urgent')),
  reason                   text not null check (char_length(btrim(reason)) between 2 and 1000),
  summary                  text check (char_length(summary) <= 4000),
  treatments_given         text check (char_length(treatments_given) <= 2000),
  referred_by              uuid not null default auth.uid() references auth.users (id),
  referred_at              timestamptz not null default now(),
  counter_referral         text check (char_length(counter_referral) <= 4000),
  counter_referral_on      date,
  counter_referral_at      timestamptz,
  counter_referral_by      uuid references auth.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at               timestamptz,
  constraint referrals_counter_check check (
    (counter_referral is null) = (counter_referral_at is null)
    and (counter_referral is null) = (counter_referral_by is null)),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (destination_id, org_id) references public.referral_destinations (id, org_id)
);
create index referrals_encounter_idx on public.referrals (encounter_id);
create index referrals_patient_idx on public.referrals (patient_id, referred_at desc);

-- Certificat : texte final relu par le soignant, figé à l'émission.
create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  encounter_id       uuid not null,
  patient_id         uuid not null,
  template_id        uuid,
  title              text not null check (char_length(btrim(title)) between 2 and 80),
  body               text not null check (char_length(btrim(body)) between 10 and 4000),
  rest_days          smallint check (rest_days between 1 and 365),
  starts_on          date,
  ends_on            date,
  includes_diagnosis boolean not null default false,
  issued_by          uuid not null default auth.uid() references auth.users (id),
  issued_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  constraint certificates_days_check check (
    (rest_days is null and starts_on is null and ends_on is null)
    or (rest_days is not null and starts_on is not null and ends_on = starts_on + rest_days - 1)),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (template_id, org_id) references public.certificate_templates (id, org_id)
);
create index certificates_encounter_idx on public.certificates (encounter_id);
create index certificates_patient_idx on public.certificates (patient_id, issued_at desc);

-- Alertes des maladies à déclaration obligatoire, créées à la validation (étape 28 :
-- traitement, déclaration au district).
create table public.surveillance_alerts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  encounter_id       uuid not null,
  diagnosis_id       uuid not null references public.diagnoses (id),
  patient_id         uuid not null,
  code               text,
  label              text not null,
  notification_delay text not null check (notification_delay in ('immediate', 'weekly')),
  status             text not null default 'new' check (status in ('new', 'acknowledged', 'declared')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz,
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);
create index surveillance_alerts_org_idx on public.surveillance_alerts (org_id, created_at desc);

create trigger surveillance_alerts_set_updated_at before update on public.surveillance_alerts
  for each row execute function public.set_updated_at();

-- Antécédents, une ligne par antécédent. L'ancien texte de patient_medical.medical_history
-- reste affiché tel quel.
create table public.medical_history (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id),
  patient_id          uuid not null,
  category            text not null
                        check (category in ('medical', 'surgical', 'obstetric', 'family', 'lifestyle')),
  label               text not null check (char_length(btrim(label)) between 2 and 200),
  details             text check (char_length(details) <= 1000),
  since_year          smallint check (since_year between 1900 and 2100),
  is_sensitive        boolean not null default false,
  source_encounter_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  -- Retiré (erreur, antécédent qui n'en est pas un) : jamais effacé.
  deleted_at          timestamptz,
  foreign key (patient_id, org_id) references public.patients (id, org_id),
  foreign key (source_encounter_id, org_id) references public.encounters (id, org_id)
);
create index medical_history_patient_idx on public.medical_history (patient_id);

create trigger medical_history_set_updated_at before update on public.medical_history
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 5. Verrous (valables pour tout le monde, éditeur SQL compris)
-- =============================================================================

-- Fusion de dossiers : seul changement admis sur une ligne figée, patient_id vers le
-- dossier gardé, rien d'autre.
create function public.medical_row_is_merge_relink(p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_old ? 'patient_id'
     and (p_new ->> 'patient_id') is distinct from (p_old ->> 'patient_id')
     and (p_new - 'patient_id' - 'updated_at') = (p_old - 'patient_id' - 'updated_at')
     and exists (select 1 from public.patients p
                  where p.id = (p_old ->> 'patient_id')::uuid
                    and p.merged_into_id = (p_new ->> 'patient_id')::uuid);
$$;

create function public.encounters_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une consultation ne se supprime jamais.' using errcode = '42501';
  end if;
  if old.is_sensitive and not new.is_sensitive then
    raise exception 'Une consultation sensible le reste.' using errcode = '42501';
  end if;
  if old.status = 'validated'
     and not public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    raise exception 'Consultation validée : elle ne se modifie plus. Ajoutez un avenant.'
      using errcode = '42501';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'Un brouillon abandonné ne se reprend pas.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger encounters_guard before update or delete on public.encounters
  for each row execute function public.encounters_guard();

-- Lignes figées (diagnostics, examens, ordonnances, certificats, avenants, reprises) :
-- ni modification, ni suppression, sauf la fusion de dossiers.
create function public.medical_rows_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  raise exception 'Donnée médicale figée : elle ne se modifie ni ne se supprime.'
    using errcode = '42501';
end;
$$;

create trigger diagnoses_frozen before update or delete on public.diagnoses
  for each row execute function public.medical_rows_frozen();
create trigger encounter_tests_frozen before update or delete on public.encounter_tests
  for each row execute function public.medical_rows_frozen();
create trigger encounter_addenda_frozen before update or delete on public.encounter_addenda
  for each row execute function public.medical_rows_frozen();
create trigger encounter_handovers_frozen before update or delete on public.encounter_handovers
  for each row execute function public.medical_rows_frozen();
create trigger prescriptions_frozen before update or delete on public.prescriptions
  for each row execute function public.medical_rows_frozen();
create trigger prescription_items_frozen before update or delete on public.prescription_items
  for each row execute function public.medical_rows_frozen();
create trigger certificates_frozen before update or delete on public.certificates
  for each row execute function public.medical_rows_frozen();

-- Diagnostics et examens : ajoutés seulement pendant la validation (consultation encore
-- en brouillon dans la même transaction). Après, on passe par un avenant.
create function public.encounter_children_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select status from public.encounters where id = new.encounter_id) <> 'draft' then
    raise exception 'Consultation validée : ajoutez un avenant.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger diagnoses_insert_guard before insert on public.diagnoses
  for each row execute function public.encounter_children_insert_guard();
create trigger encounter_tests_insert_guard before insert on public.encounter_tests
  for each row execute function public.encounter_children_insert_guard();

-- Lignes d'ordonnance : seulement pendant que encounter_insert_prescription écrit cette
-- ordonnance. L'autorisation est une variable locale à la transaction (set_config(..., true))
-- qui porte l'id de l'ordonnance, remise à vide aussitôt après ; le client ne peut pas la
-- poser (PostgREST n'expose pas set_config).
create function public.prescription_items_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('fajkat.open_prescription', true), '') <> new.prescription_id::text then
    raise exception 'Ordonnance déjà délivrée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prescription_items_insert_guard before insert on public.prescription_items
  for each row execute function public.prescription_items_insert_guard();

-- Références : figées, sauf la contre-référence, saisie une seule fois.
create function public.referrals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fige jsonb := to_jsonb(new) - 'counter_referral' - 'counter_referral_on'
                  - 'counter_referral_at' - 'counter_referral_by' - 'updated_at';
begin
  if tg_op = 'DELETE' then
    raise exception 'Une référence ne se supprime jamais.' using errcode = '42501';
  end if;
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.counter_referral is null and new.counter_referral is not null
     and v_fige = (to_jsonb(old) - 'counter_referral' - 'counter_referral_on'
                   - 'counter_referral_at' - 'counter_referral_by' - 'updated_at') then
    return new;
  end if;
  raise exception 'Référence émise : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

create trigger referrals_guard before update or delete on public.referrals
  for each row execute function public.referrals_guard();

-- Antécédents et alertes : jamais supprimés ; antécédent sensible jamais rendu non sensible.
create function public.medical_history_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un antécédent ne se supprime jamais : retirez-le.' using errcode = '42501';
  end if;
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.is_sensitive and not new.is_sensitive then
    raise exception 'Un antécédent sensible le reste.' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'Antécédent retiré : il ne se modifie plus.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger medical_history_guard before update or delete on public.medical_history
  for each row execute function public.medical_history_guard();

create function public.no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Suppression interdite : %.', tg_table_name using errcode = '42501';
end;
$$;

create trigger surveillance_alerts_no_delete before delete on public.surveillance_alerts
  for each row execute function public.no_delete();


-- =============================================================================
-- 6. Journal
-- =============================================================================

-- Consultations : création, reprise, validation, sensibilité, abandon. Ni contenu, ni
-- patient (owner et admin lisent audit_logs) ; les enregistrements du brouillon (toutes
-- les 10 secondes) ne sont pas journalisés.
create function public.encounters_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_champs text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then v_champs := v_champs || 'status'::text; end if;
    if new.author_id is distinct from old.author_id then v_champs := v_champs || 'author_id'::text; end if;
    if new.is_sensitive is distinct from old.is_sensitive then v_champs := v_champs || 'is_sensitive'::text; end if;
    if new.deleted_at is distinct from old.deleted_at then v_champs := v_champs || 'deleted_at'::text; end if;
    if new.patient_id is distinct from old.patient_id then v_champs := v_champs || 'patient_id'::text; end if;
    if cardinality(v_champs) = 0 then
      return null;
    end if;
  end if;
  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values (new.org_id, auth.uid(), tg_op, 'encounters', new.id::text, null,
          jsonb_build_object('changed_fields', to_jsonb(v_champs)));
  return null;
end;
$$;

create trigger encounters_audit after insert or update on public.encounters
  for each row execute function public.encounters_audit();

create trigger encounter_addenda_audit after insert on public.encounter_addenda
  for each row execute function public.audit_trigger_redacted('encounter_id');
create trigger prescriptions_audit after insert or update on public.prescriptions
  for each row execute function public.audit_trigger_redacted('encounter_id');
create trigger referrals_audit after insert or update on public.referrals
  for each row execute function public.audit_trigger_redacted('encounter_id');
create trigger certificates_audit after insert or update on public.certificates
  for each row execute function public.audit_trigger_redacted('encounter_id');
create trigger medical_history_audit after insert or update on public.medical_history
  for each row execute function public.audit_trigger_redacted();

-- Lectures de données sensibles : action « READ ».
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in ('INSERT', 'UPDATE', 'DELETE', 'READ'));

create index audit_logs_reads_idx on public.audit_logs (org_id, created_at desc) where action = 'READ';

-- Les lignes de lecture nomment le patient, et celles des tables médicales en disent trop
-- (encounter_id, champs modifiés dont is_sensitive) : seuls l'owner et l'admin qui
-- exercent les lisent. Les autres owners et admins ont un résumé sans patient.
create function public.audit_table_is_medical(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table in ('encounters', 'encounter_addenda', 'encounter_handovers', 'diagnoses',
                     'encounter_tests', 'prescriptions', 'prescription_items', 'referrals',
                     'certificates', 'medical_history', 'surveillance_alerts');
$$;

drop policy audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin'])
         and ((action <> 'READ' and not public.audit_table_is_medical(table_name))
              or public.encounters_can_write(org_id)));

create function public.log_sensitive_read(
  p_org_id uuid, p_table text, p_record_id uuid, p_patient_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, auth.uid(), 'READ', p_table, p_record_id::text, null,
          jsonb_build_object('patient_id', p_patient_id));
$$;

-- « Awa Diop a ouvert 12 dossiers sensibles » : par membre, sans aucun patient.
create function public.sensitive_reads_summary(p_org_id uuid, p_from date, p_to date)
returns table (user_id uuid, user_name text, patients bigint, reads bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  if not public.has_role(p_org_id, array['owner', 'admin']) then
    raise exception 'Réservé à l''owner et à l''admin.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choisissez une période d''un an au plus.' using errcode = '22023';
  end if;
  select timezone into v_tz from public.organizations where id = p_org_id;
  return query
    select l.user_id, public.user_display_name(l.user_id),
           count(distinct l.new_data ->> 'patient_id'), count(*)
      from public.audit_logs l
     where l.org_id = p_org_id and l.action = 'READ'
       and l.created_at >= (p_from::timestamp at time zone v_tz)
       and l.created_at < ((p_to + 1)::timestamp at time zone v_tz)
     group by l.user_id
     order by count(distinct l.new_data ->> 'patient_id') desc;
end;
$$;


-- =============================================================================
-- 7. Consultation : démarrer, enregistrer, reprendre, valider
-- =============================================================================

-- Maladie à déclaration immédiate : notification aux soignants habilités et à l'owner.
-- Jamais le nom du patient (la notification peut s'afficher sur un écran verrouillé).
create function public.surveillance_notify_immediate(p_org_id uuid, p_alert_id uuid, p_label text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select m.user_id from public.memberships m
     where m.org_id = p_org_id and m.is_active and m.deleted_at is null
       and (m.role in ('owner', 'medecin', 'sage_femme', 'infirmier')
            or (m.role = 'admin' and m.is_clinician))
  loop
    perform public.notify(p_org_id, v_user, 'surveillance.immediate', 'urgent',
      'Maladie à déclaration immédiate : ' || p_label,
      'À déclarer au district sans délai.', null, p_alert_id);
  end loop;
end;
$$;

-- Contexte d'une consultation pour l'utilisateur connecté (lève une erreur sinon).
create function public.encounter_for_writer(p_encounter_id uuid)
returns public.encounters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and deleted_at is null;
  if not found or not public.encounters_can_write(v_enc.org_id) then
    raise exception 'Consultation introuvable.' using errcode = '42501';
  end if;
  return v_enc;
end;
$$;

create function public.encounter_assert_author(p_enc public.encounters, p_version integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_enc.status <> 'draft' then
    raise exception 'Consultation déjà validée : ajoutez un avenant.' using errcode = '42501';
  end if;
  if p_enc.author_id is distinct from auth.uid() then
    raise exception 'Cette consultation est tenue par %. Reprenez-la pour la continuer.',
      public.user_display_name(p_enc.author_id) using errcode = '42501';
  end if;
  if p_version is null or p_version <> p_enc.version then
    raise exception 'Cette consultation a été modifiée sur un autre appareil. Rechargez-la avant de continuer.'
      using errcode = '40001';
  end if;
end;
$$;

-- Sensible d'office : type sensible, case cochée, diagnostic ou examen rapide sensible.
create function public.encounter_draft_sensitive(p_org_id uuid, p_type_id uuid, p_data jsonb)
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
                  where r.is_sensitive and r.org_id = p_org_id);
$$;

-- En-tête renvoyé au front (jamais le contenu).
create function public.encounter_header(p_enc public.encounters)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_enc.id, 'org_id', p_enc.org_id, 'patient_id', p_enc.patient_id,
    'visit_id', p_enc.visit_id, 'appointment_id', p_enc.appointment_id,
    'encounter_type_id', p_enc.encounter_type_id,
    'type_label', (select label from public.encounter_types where id = p_enc.encounter_type_id),
    'status', p_enc.status, 'version', p_enc.version, 'is_sensitive', p_enc.is_sensitive,
    'author_id', p_enc.author_id, 'author_name', public.user_display_name(p_enc.author_id),
    'mine', p_enc.author_id = auth.uid(), 'started_at', p_enc.started_at,
    'updated_at', p_enc.updated_at, 'validated_at', p_enc.validated_at,
    'validated_by_name', case when p_enc.validated_by is not null
                              then public.user_display_name(p_enc.validated_by) end);
$$;

-- Commencer une consultation, depuis la file (p_visit_id) ou la fiche du patient.
-- Un brouillon déjà ouvert pour ce passage est renvoyé tel quel (« mine » faux s'il est
-- tenu par un autre soignant : le front propose alors de le reprendre). Le motif de la
-- file est repris dans le brouillon ; un rendez-vous discret rend la consultation sensible.
create function public.start_encounter(
  p_patient_id uuid, p_visit_id uuid default null, p_encounter_type_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_visit   public.visits;
  v_enc     public.encounters;
  v_rdv     public.appointments;
  v_type    uuid;
  v_discret boolean := false;
  v_motif   text;
begin
  select org_id into v_org from public.patients where id = p_patient_id and deleted_at is null;
  if v_org is null or not public.encounters_can_write(v_org) then
    raise exception 'Seuls les soignants commencent une consultation.' using errcode = '42501';
  end if;

  if p_visit_id is not null then
    select * into v_visit from public.visits where id = p_visit_id;
    if not found or v_visit.org_id <> v_org or v_visit.patient_id <> p_patient_id then
      raise exception 'Ce passage ne correspond pas à ce patient.' using errcode = '22023';
    end if;
    if v_visit.status = 'left' then
      raise exception 'Ce patient est parti sans être vu.' using errcode = '22023';
    end if;
    select * into v_enc from public.encounters
     where visit_id = p_visit_id and status = 'draft' and deleted_at is null;
    if found then
      return public.encounter_header(v_enc) || jsonb_build_object('created', false);
    end if;
    select * into v_rdv from public.appointments
     where visit_id = p_visit_id and deleted_at is null limit 1;
    if found then
      select t.is_discreet into v_discret from public.appointment_types t
       where t.id = v_rdv.appointment_type_id;
      -- Type de consultation du même code que le type de rendez-vous (pf, dépistage…).
      select e.id into v_type from public.encounter_types e
        join public.appointment_types t on t.id = v_rdv.appointment_type_id
       where e.org_id = v_org and e.template_code = t.template_code
         and e.is_active and e.deleted_at is null
       limit 1;
    end if;
    select reason into v_motif from public.visit_reasons
     where visit_id = p_visit_id and deleted_at is null;
  end if;

  if p_encounter_type_id is not null then
    select id into v_type from public.encounter_types
     where id = p_encounter_type_id and org_id = v_org and is_active and deleted_at is null;
    if v_type is null then
      raise exception 'Ce type de consultation n''existe pas.' using errcode = '22023';
    end if;
  end if;
  if v_type is null then
    select id into v_type from public.encounter_types
     where org_id = v_org and is_active and deleted_at is null
     order by (template_code = 'consultation') desc nulls last, sort_order
     limit 1;
  end if;
  if v_type is null then
    raise exception 'Aucun type de consultation n''est actif dans les paramètres.' using errcode = '22023';
  end if;

  insert into public.encounters (org_id, patient_id, visit_id, appointment_id, encounter_type_id,
                                 draft_data, is_sensitive)
  values (v_org, p_patient_id, p_visit_id, v_rdv.id, v_type,
          jsonb_strip_nulls(jsonb_build_object('reason', v_motif, 'encounter_type_id', v_type)),
          coalesce(v_discret, false)
            or coalesce((select is_sensitive_default from public.encounter_types where id = v_type), false))
  returning * into v_enc;

  return public.encounter_header(v_enc) || jsonb_build_object('created', true);
end;
$$;

-- Enregistrement du brouillon (toutes les 10 secondes) : remplace draft_data. Version
-- lue obligatoire ; renvoie la nouvelle version.
create function public.save_encounter_draft(p_encounter_id uuid, p_version integer, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc  public.encounters;
  v_type uuid;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  perform public.encounter_assert_author(v_enc, p_version);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Brouillon illisible.' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 200000 then
    raise exception 'Brouillon trop long : raccourcissez les textes.' using errcode = '22023';
  end if;

  v_type := coalesce((select id from public.encounter_types
                       where id = public.try_uuid(p_data ->> 'encounter_type_id')
                         and org_id = v_enc.org_id and deleted_at is null),
                     v_enc.encounter_type_id);

  update public.encounters
     set draft_data = p_data, encounter_type_id = v_type, version = version + 1,
         is_sensitive = is_sensitive or public.encounter_draft_sensitive(org_id, v_type, p_data)
   where id = v_enc.id
  returning * into v_enc;

  return jsonb_build_object('version', v_enc.version, 'saved_at', v_enc.updated_at,
                            'is_sensitive', v_enc.is_sensitive);
end;
$$;

-- Relève d'équipe : un autre soignant reprend un brouillon. Contenu gardé, auteur changé,
-- reprise journalisée, auteur précédent prévenu.
create function public.take_over_encounter(p_encounter_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc    public.encounters;
  v_avant  uuid;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  if v_enc.status <> 'draft' then
    raise exception 'Consultation déjà validée.' using errcode = '42501';
  end if;
  if v_enc.author_id = auth.uid() then
    return public.encounter_header(v_enc);
  end if;
  v_avant := v_enc.author_id;
  update public.encounters set author_id = auth.uid(), version = version + 1
   where id = v_enc.id returning * into v_enc;
  insert into public.encounter_handovers (org_id, encounter_id, from_user_id, to_user_id)
  values (v_enc.org_id, v_enc.id, v_avant, auth.uid());
  perform public.notify(v_enc.org_id, v_avant, 'encounter.taken_over', 'info',
    'Consultation reprise par ' || public.user_display_name(auth.uid()),
    'Votre brouillon de consultation est maintenant tenu par un collègue.', null, v_enc.id);
  return public.encounter_header(v_enc);
end;
$$;

-- Abandon d'un brouillon par son auteur (jamais effacé).
create function public.discard_encounter_draft(p_encounter_id uuid, p_version integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  perform public.encounter_assert_author(v_enc, p_version);
  update public.encounters set deleted_at = now(), version = version + 1 where id = v_enc.id;
end;
$$;

-- Texte facultatif d'un document jsonb, borné ; message en français sinon.
create function public.encounter_text(p_data jsonb, p_key text, p_max integer, p_label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_data ->> p_key, '')), '');
begin
  if v is not null and char_length(v) > p_max then
    raise exception '% : % caractères au plus.', p_label, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

create function public.encounter_number(p_data jsonb, p_key text, p_min numeric, p_max numeric,
                                        p_label text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_data -> p_key is null or jsonb_typeof(p_data -> p_key) = 'null'
     or btrim(coalesce(p_data ->> p_key, '')) = '' then
    return null;
  end if;
  begin
    v := replace(p_data ->> p_key, ',', '.')::numeric;
  exception when others then
    raise exception '% : tapez un nombre.', p_label using errcode = '22023';
  end;
  if v < p_min or v > p_max then
    raise exception '% : entre % et %.', p_label, p_min, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

-- Ordonnance figée à partir de lignes jsonb (validation ou ordonnance ajoutée après).
-- Renvoie l'id de l'ordonnance, ou null sans aucune ligne.
create function public.encounter_insert_prescription(p_enc public.encounters, p_note text, p_items jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_item  jsonb;
  v_n     integer := 0;
  v_nom   text;
  v_voie  text;
  v_label text;
begin
  if jsonb_array_length(public.jsonb_array_or_empty(p_items)) = 0 then
    return null;
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Une ordonnance compte 30 lignes au plus.' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'Note de l''ordonnance : 500 caractères au plus.' using errcode = '22023';
  end if;

  insert into public.prescriptions (org_id, encounter_id, patient_id, note)
  values (p_enc.org_id, p_enc.id, p_enc.patient_id, nullif(btrim(p_note), ''))
  returning id into v_id;
  perform set_config('fajkat.open_prescription', v_id::text, true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    v_label := 'Ligne ' || v_n || ' de l''ordonnance';
    if jsonb_typeof(v_item) <> 'object' then
      raise exception '% : illisible.', v_label using errcode = '22023';
    end if;
    -- Catalogue de la pharmacie : étape 17. Jusque-là, texte libre seulement.
    if nullif(v_item ->> 'product_id', '') is not null then
      raise exception '% : le catalogue de la pharmacie n''est pas encore disponible.', v_label
        using errcode = '22023';
    end if;
    v_nom := public.encounter_text(v_item, 'product_name', 120, v_label || ' (médicament)');
    if v_nom is null or char_length(v_nom) < 2 then
      raise exception '% : écrivez le nom du médicament.', v_label using errcode = '22023';
    end if;
    v_voie := nullif(v_item ->> 'route_code', '');
    if v_voie is not null and not exists (select 1 from public.drug_routes where code = v_voie and is_active) then
      raise exception '% : voie d''administration inconnue.', v_label using errcode = '22023';
    end if;
    insert into public.prescription_items (
      org_id, prescription_id, product_name, dosage, form, route_code, dose_morning, dose_noon,
      dose_evening, dose_night, dose_unit, as_needed, duration_days, quantity, quantity_unit,
      instructions, sort_order)
    values (
      p_enc.org_id, v_id, v_nom,
      public.encounter_text(v_item, 'dosage', 60, v_label || ' (dosage)'),
      public.encounter_text(v_item, 'form', 60, v_label || ' (forme)'),
      v_voie,
      public.encounter_number(v_item, 'dose_morning', 0, 100, v_label || ' (matin)'),
      public.encounter_number(v_item, 'dose_noon', 0, 100, v_label || ' (midi)'),
      public.encounter_number(v_item, 'dose_evening', 0, 100, v_label || ' (soir)'),
      public.encounter_number(v_item, 'dose_night', 0, 100, v_label || ' (nuit)'),
      public.encounter_text(v_item, 'dose_unit', 30, v_label || ' (unité)'),
      coalesce(case when jsonb_typeof(v_item -> 'as_needed') = 'boolean'
                    then (v_item ->> 'as_needed')::boolean end, false),
      public.encounter_number(v_item, 'duration_days', 1, 365, v_label || ' (durée en jours)')::smallint,
      public.encounter_number(v_item, 'quantity', 1, 10000, v_label || ' (quantité)')::integer,
      public.encounter_text(v_item, 'quantity_unit', 30, v_label || ' (unité de la quantité)'),
      public.encounter_text(v_item, 'instructions', 300, v_label || ' (consignes)'),
      v_n);
  end loop;
  perform set_config('fajkat.open_prescription', '', true);
  return v_id;
end;
$$;

-- Validation : contenu du brouillon recopié dans les colonnes et les tables, consultation
-- figée, alertes de déclaration obligatoire créées.
create function public.validate_encounter(p_encounter_id uuid, p_version integer)
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

-- Avenant daté à une consultation validée.
create function public.add_encounter_addendum(p_encounter_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_add public.encounter_addenda;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  if v_enc.status <> 'validated' then
    raise exception 'Une consultation en brouillon se modifie directement.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'Écrivez le texte de l''avenant.' using errcode = '22023';
  end if;
  if char_length(btrim(p_body)) > 4000 then
    raise exception 'Avenant : 4000 caractères au plus.' using errcode = '22023';
  end if;
  insert into public.encounter_addenda (org_id, encounter_id, body)
  values (v_enc.org_id, v_enc.id, btrim(p_body))
  returning * into v_add;
  return jsonb_build_object('id', v_add.id, 'body', v_add.body, 'created_at', v_add.created_at,
                            'author_name', public.user_display_name(v_add.created_by));
end;
$$;

-- Ordonnance ajoutée à une consultation validée (oubli, renouvellement) : figée aussitôt.
create function public.add_prescription(p_encounter_id uuid, p_note text, p_items jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_id  uuid;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  if v_enc.status <> 'validated' then
    raise exception 'Ajoutez l''ordonnance dans le brouillon de la consultation.' using errcode = '22023';
  end if;
  v_id := public.encounter_insert_prescription(v_enc, p_note, p_items);
  if v_id is null then
    raise exception 'Ajoutez au moins un médicament.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;


-- =============================================================================
-- 8. Lecture
-- =============================================================================

-- Consultation complète. Brouillon : contenu pour son seul auteur (en-tête pour les
-- autres soignants, pour proposer la reprise). Sensible : réservé à ceux qui écrivent,
-- chaque lecture journalisée.
create function public.get_encounter(p_encounter_id uuid)
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
  if v_enc.is_sensitive and not public.encounters_can_write(v_enc.org_id) then
    raise exception 'Consultation réservée aux soignants habilités.' using errcode = '42501';
  end if;

  v_res := public.encounter_header(v_enc);
  -- Brouillon d'un autre soignant : en-tête seulement (qui, depuis quand), pour la reprise.
  if v_enc.status = 'draft' and v_enc.author_id is distinct from auth.uid() then
    return v_res;
  end if;
  if v_enc.status = 'draft' then
    v_res := v_res || jsonb_build_object('draft_data', v_enc.draft_data);
  else
    if v_enc.is_sensitive then
      perform public.log_sensitive_read(v_enc.org_id, 'encounters', v_enc.id, v_enc.patient_id);
    end if;
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

-- Brouillons non validés de l'utilisateur connecté (« Journée du jour »).
create function public.my_draft_encounters(p_org_id uuid)
returns table (encounter_id uuid, patient_id uuid, patient_last_name text,
               patient_first_name text, file_number text, type_label text,
               started_at timestamptz, updated_at timestamptz, visit_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.encounters_can_write(p_org_id) then
    return;
  end if;
  return query
    select e.id, e.patient_id, p.last_name, p.first_name, p.file_number, t.label,
           e.started_at, e.updated_at, e.visit_id
      from public.encounters e
      join public.patients p on p.id = e.patient_id
      join public.encounter_types t on t.id = e.encounter_type_id
     where e.org_id = p_org_id and e.author_id = auth.uid()
       and e.status = 'draft' and e.deleted_at is null
     order by e.started_at;
end;
$$;

-- Chronologie du dossier : consultations, ordonnances, références, certificats.
-- p_kinds : filtre facultatif ('encounter', 'prescription', 'referral', 'certificate').
-- Jamais de contenu médical d'une consultation sensible dans la liste (seulement son
-- type) ; rien de sensible pour l'aide-soignant. Brouillons : ceux de l'utilisateur.
create function public.patient_timeline(p_patient_id uuid, p_kinds text[] default null)
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
  v_sensible boolean;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.encounters_can_read(v_org) then
    raise exception 'Le dossier médical est réservé aux soignants.' using errcode = '42501';
  end if;
  v_sensible := public.encounters_can_write(v_org);

  return query
  with visibles as (
    select e.* from public.encounters e
     where e.patient_id = p_patient_id and e.deleted_at is null
       and (e.status = 'validated' or e.author_id = auth.uid())
       and (v_sensible or not e.is_sensitive)
  )
  select x.* from (
    select 'encounter'::text, e.id, e.id, coalesce(e.validated_at, e.started_at), t.label,
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
  ) x(kind, item_id, encounter_id, occurred_at, title, detail, status, is_sensitive, author_name)
  where p_kinds is null or x.kind = any (p_kinds)
  order by x.occurred_at desc;
end;
$$;


-- =============================================================================
-- 9. Diagnostics : recherche, favoris, ajouts de la structure
-- =============================================================================

-- Recherche (mots dans le désordre, sans accents, fautes tolérées sur les mots de 4
-- lettres et plus) ; sans texte : favoris de l'utilisateur.
create function public.search_diagnoses(p_org_id uuid, p_query text default null, p_limit integer default 20)
returns table (id uuid, code text, label text, chapter text, is_notifiable boolean,
               notification_delay text, is_sensitive boolean, is_favorite boolean,
               is_local boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q    text := public.patient_normalize(p_query);
  v_mots text[];
begin
  if not public.encounters_can_read(p_org_id) then
    raise exception 'Réservé aux soignants.' using errcode = '42501';
  end if;
  v_mots := array_remove(regexp_split_to_array(v_q, ' '), '');

  return query
  select c.id, c.code, c.label, c.chapter, c.is_notifiable, c.notification_delay,
         c.is_sensitive, f.id is not null, c.org_id is not null
    from public.diagnoses_catalog c
    left join public.diagnosis_favorites f
      on f.catalog_id = c.id and f.org_id = p_org_id and f.user_id = auth.uid()
         and f.deleted_at is null
   where (c.org_id is null or c.org_id = p_org_id)
     and c.is_active and c.deleted_at is null
     and (
       (v_q = '' and f.id is not null)
       or (v_q <> '' and not exists (
             select 1 from unnest(v_mots) as m(mot)
              where not (c.search_text like '%' || m.mot || '%'
                         or (length(m.mot) >= 4 and m.mot operator(extensions.<%) c.search_text)))))
   order by (lower(coalesce(c.code, '')) = v_q) desc, (f.id is not null) desc,
            case when v_q = '' then 0 else extensions.similarity(c.search_text, v_q) end desc,
            c.sort_order, c.label
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create function public.set_diagnosis_favorite(p_org_id uuid, p_catalog_id uuid, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.encounters_can_write(p_org_id) then
    raise exception 'Réservé aux soignants.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.diagnoses_catalog
                  where id = p_catalog_id and (org_id is null or org_id = p_org_id)) then
    raise exception 'Diagnostic introuvable.' using errcode = '22023';
  end if;
  insert into public.diagnosis_favorites (org_id, user_id, catalog_id, deleted_at)
  values (p_org_id, auth.uid(), p_catalog_id, case when p_on then null else now() end)
  on conflict (org_id, user_id, catalog_id)
  do update set deleted_at = case when p_on then null else now() end;
end;
$$;

-- Diagnostic propre à la structure (owner, admin) : jamais à déclaration obligatoire.
create function public.save_org_diagnosis(
  p_org_id uuid, p_id uuid, p_label text, p_code text default null,
  p_synonyms text default null, p_is_sensitive boolean default false,
  p_is_active boolean default true)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_sens boolean;
begin
  if not public.encounters_can_configure(p_org_id) then
    raise exception 'Réservé à l''owner et à l''admin.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'Écrivez le libellé du diagnostic.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_code, '')), '') is not null
     and upper(btrim(p_code)) !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$' then
    raise exception 'Code CIM-10 : une lettre et deux chiffres, par exemple B54 ou A09.0.'
      using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.diagnoses_catalog (org_id, code, label, synonyms, is_sensitive, is_active)
    values (p_org_id, nullif(upper(btrim(p_code)), ''), btrim(p_label), nullif(btrim(p_synonyms), ''),
            coalesce(p_is_sensitive, false), coalesce(p_is_active, true))
    returning id into v_id;
    return v_id;
  end if;
  select is_sensitive into v_sens from public.diagnoses_catalog
   where id = p_id and org_id = p_org_id and deleted_at is null;
  if not found then
    raise exception 'Seuls les diagnostics ajoutés par la structure se modifient.' using errcode = '42501';
  end if;
  if v_sens and not coalesce(p_is_sensitive, false) then
    raise exception 'Un diagnostic sensible le reste.' using errcode = '42501';
  end if;
  update public.diagnoses_catalog
     set code = nullif(upper(btrim(p_code)), ''), label = btrim(p_label),
         synonyms = nullif(btrim(p_synonyms), ''), is_sensitive = coalesce(p_is_sensitive, false),
         is_active = coalesce(p_is_active, true)
   where id = p_id;
  return p_id;
end;
$$;


-- =============================================================================
-- 10. Antécédents
-- =============================================================================

-- Antécédents du patient. Sensibles : absents pour l'aide-soignant ; lus et journalisés
-- pour les autres soignants.
create function public.get_medical_history(p_patient_id uuid)
returns table (id uuid, category text, label text, details text, since_year smallint,
               is_sensitive boolean, created_at timestamptz, author_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org      uuid;
  v_sensible boolean;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.encounters_can_read(v_org) then
    raise exception 'Le dossier médical est réservé aux soignants.' using errcode = '42501';
  end if;
  v_sensible := public.encounters_can_write(v_org);
  if v_sensible and exists (select 1 from public.medical_history h
                             where h.patient_id = p_patient_id and h.is_sensitive
                               and h.deleted_at is null) then
    perform public.log_sensitive_read(v_org, 'medical_history', p_patient_id, p_patient_id);
  end if;
  return query
    select h.id, h.category, h.label, h.details, h.since_year, h.is_sensitive, h.created_at,
           public.user_display_name(h.created_by)
      from public.medical_history h
     where h.patient_id = p_patient_id and h.deleted_at is null
       and (v_sensible or not h.is_sensitive)
     order by h.category, h.since_year nulls last, h.created_at;
end;
$$;

create function public.save_medical_history_item(
  p_patient_id uuid, p_id uuid, p_category text, p_label text, p_details text default null,
  p_since_year integer default null, p_is_sensitive boolean default false,
  p_encounter_id uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  select org_id into v_org from public.patients where id = p_patient_id and deleted_at is null;
  if v_org is null or not public.encounters_can_write(v_org) then
    raise exception 'Seuls les soignants modifient les antécédents.' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('medical', 'surgical', 'obstetric', 'family', 'lifestyle') then
    raise exception 'Choisissez le type d''antécédent.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_label, '')), '') is null or char_length(btrim(p_label)) < 2 then
    raise exception 'Écrivez l''antécédent.' using errcode = '22023';
  end if;
  if p_since_year is not null
     and (p_since_year < 1900 or p_since_year > extract(year from now())::integer) then
    raise exception 'Année : entre 1900 et cette année.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.medical_history (org_id, patient_id, category, label, details, since_year,
                                        is_sensitive, source_encounter_id)
    values (v_org, p_patient_id, p_category, btrim(p_label), nullif(btrim(p_details), ''),
            p_since_year, coalesce(p_is_sensitive, false),
            (select id from public.encounters where id = p_encounter_id and patient_id = p_patient_id))
    returning id into v_id;
    return v_id;
  end if;
  update public.medical_history
     set category = p_category, label = btrim(p_label), details = nullif(btrim(p_details), ''),
         since_year = p_since_year, is_sensitive = coalesce(p_is_sensitive, false)
   where id = p_id and patient_id = p_patient_id and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'Antécédent introuvable.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create function public.remove_medical_history_item(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.medical_history where id = p_id and deleted_at is null;
  if v_org is null or not public.encounters_can_write(v_org) then
    raise exception 'Antécédent introuvable.' using errcode = '42501';
  end if;
  update public.medical_history set deleted_at = now() where id = p_id;
end;
$$;


-- =============================================================================
-- 11. Références et certificats
-- =============================================================================

-- Consultation à laquelle on rattache un document : brouillon de l'utilisateur, ou
-- consultation validée.
create function public.encounter_for_document(p_encounter_id uuid)
returns public.encounters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
begin
  v_enc := public.encounter_for_writer(p_encounter_id);
  if v_enc.status = 'draft' and v_enc.author_id is distinct from auth.uid() then
    raise exception 'Cette consultation est tenue par %.', public.user_display_name(v_enc.author_id)
      using errcode = '42501';
  end if;
  return v_enc;
end;
$$;

create function public.create_referral(
  p_encounter_id uuid, p_destination_id uuid, p_destination_name text, p_urgency text,
  p_reason text, p_summary text default null, p_treatments_given text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc  public.encounters;
  v_nom  text;
  v_id   uuid;
begin
  v_enc := public.encounter_for_document(p_encounter_id);
  if not public.org_has_feature(v_enc.org_id, 'references') then
    raise exception 'Les références ne font pas partie de votre offre.' using errcode = '42501';
  end if;
  if p_destination_id is not null then
    select name into v_nom from public.referral_destinations
     where id = p_destination_id and org_id = v_enc.org_id and deleted_at is null;
    if v_nom is null then
      raise exception 'Établissement introuvable.' using errcode = '22023';
    end if;
  else
    v_nom := nullif(btrim(coalesce(p_destination_name, '')), '');
  end if;
  if v_nom is null then
    raise exception 'Indiquez l''établissement de destination.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Indiquez le motif de la référence.' using errcode = '22023';
  end if;
  insert into public.referrals (org_id, encounter_id, patient_id, destination_id, destination_name,
                                urgency, reason, summary, treatments_given)
  values (v_enc.org_id, v_enc.id, v_enc.patient_id, p_destination_id, v_nom,
          coalesce(p_urgency, 'routine'), btrim(p_reason), nullif(btrim(p_summary), ''),
          nullif(btrim(p_treatments_given), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.record_counter_referral(p_referral_id uuid, p_text text, p_received_on date default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref public.referrals;
begin
  select * into v_ref from public.referrals where id = p_referral_id and deleted_at is null;
  if not found or not public.encounters_can_write(v_ref.org_id)
     or not public.org_has_feature(v_ref.org_id, 'references') then
    raise exception 'Référence introuvable.' using errcode = '42501';
  end if;
  if v_ref.counter_referral is not null then
    raise exception 'La contre-référence est déjà enregistrée.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null then
    raise exception 'Écrivez la contre-référence.' using errcode = '22023';
  end if;
  if p_received_on is not null
     and (p_received_on > public.org_local_date(v_ref.org_id)
          or p_received_on < (v_ref.referred_at at time zone 'UTC')::date - 1) then
    raise exception 'Date de réception impossible.' using errcode = '22023';
  end if;
  update public.referrals
     set counter_referral = btrim(p_text), counter_referral_on = p_received_on,
         counter_referral_at = now(), counter_referral_by = auth.uid()
   where id = p_referral_id;
end;
$$;

-- Certificat : texte final (modèle complété et relu à l'écran), figé à l'émission.
create function public.issue_certificate(
  p_encounter_id uuid, p_template_id uuid, p_title text, p_body text,
  p_rest_days integer default null, p_starts_on date default null,
  p_includes_diagnosis boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_id  uuid;
begin
  v_enc := public.encounter_for_document(p_encounter_id);
  if p_template_id is not null and not exists (
       select 1 from public.certificate_templates where id = p_template_id and org_id = v_enc.org_id) then
    raise exception 'Modèle de certificat introuvable.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Indiquez le titre du certificat.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 10 then
    raise exception 'Écrivez le texte du certificat.' using errcode = '22023';
  end if;
  if char_length(btrim(p_body)) > 4000 then
    raise exception 'Certificat : 4000 caractères au plus.' using errcode = '22023';
  end if;
  if (p_rest_days is null) <> (p_starts_on is null) then
    raise exception 'Indiquez le nombre de jours et la date de début du repos.' using errcode = '22023';
  end if;
  if p_rest_days is not null and (p_rest_days < 1 or p_rest_days > 365) then
    raise exception 'Repos : entre 1 et 365 jours.' using errcode = '22023';
  end if;
  insert into public.certificates (org_id, encounter_id, patient_id, template_id, title, body,
                                   rest_days, starts_on, ends_on, includes_diagnosis)
  values (v_enc.org_id, v_enc.id, v_enc.patient_id, p_template_id, btrim(p_title), btrim(p_body),
          p_rest_days, p_starts_on, p_starts_on + p_rest_days - 1,
          coalesce(p_includes_diagnosis, false))
  returning id into v_id;
  return v_id;
end;
$$;


-- =============================================================================
-- 12. Fusion de dossiers : tout suit le dossier gardé
-- =============================================================================

create function public.patients_merge_relink_encounters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  update public.encounters set patient_id = new.merged_into_id where patient_id = new.id;
  update public.prescriptions set patient_id = new.merged_into_id where patient_id = new.id;
  update public.referrals set patient_id = new.merged_into_id where patient_id = new.id;
  update public.certificates set patient_id = new.merged_into_id where patient_id = new.id;
  update public.surveillance_alerts set patient_id = new.merged_into_id where patient_id = new.id;
  update public.medical_history set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

create trigger patients_merge_relink_encounters
  after update of merged_into_id on public.patients
  for each row execute function public.patients_merge_relink_encounters();


-- =============================================================================
-- 13. Droits d'accès
-- =============================================================================

revoke all on
  public.encounter_type_templates, public.encounter_types, public.rapid_test_type_templates,
  public.rapid_test_types, public.drug_routes, public.certificate_template_defaults,
  public.certificate_templates, public.referral_destinations, public.diagnoses_catalog,
  public.diagnosis_favorites, public.encounters, public.encounter_handovers,
  public.encounter_addenda, public.diagnoses, public.encounter_tests, public.prescriptions,
  public.prescription_items, public.referrals, public.certificates, public.surveillance_alerts,
  public.medical_history
from anon, authenticated;

-- Référentiels et paramètres : lisibles par les membres ; paramètres modifiés par owner et
-- admin (types, examens, modèles) ou par les soignants (établissements de référence).
-- Contenu médical (encounters et suivantes) : aucun accès direct, fonctions seulement.
grant select on public.encounter_type_templates, public.rapid_test_type_templates,
                public.drug_routes, public.certificate_template_defaults,
                public.diagnoses_catalog to authenticated;
grant select on public.encounter_types, public.rapid_test_types, public.certificate_templates,
                public.referral_destinations to authenticated;
grant insert (id, org_id, label, is_sensitive_default, is_active, sort_order)
  on public.encounter_types to authenticated;
grant update (label, is_sensitive_default, is_active, sort_order, deleted_at)
  on public.encounter_types to authenticated;
grant insert (id, org_id, label, result_kind, unit, is_sensitive, is_active, sort_order)
  on public.rapid_test_types to authenticated;
grant update (label, unit, is_sensitive, is_active, sort_order, deleted_at)
  on public.rapid_test_types to authenticated;
grant insert (id, org_id, label, body, has_days, is_active, sort_order)
  on public.certificate_templates to authenticated;
grant update (label, body, has_days, is_active, sort_order, deleted_at)
  on public.certificate_templates to authenticated;
grant insert (id, org_id, name, kind, phone, address, is_active, sort_order)
  on public.referral_destinations to authenticated;
grant update (name, kind, phone, address, is_active, sort_order, deleted_at)
  on public.referral_destinations to authenticated;

alter table public.encounter_type_templates      enable row level security;
alter table public.encounter_types               enable row level security;
alter table public.rapid_test_type_templates     enable row level security;
alter table public.rapid_test_types              enable row level security;
alter table public.drug_routes                   enable row level security;
alter table public.certificate_template_defaults enable row level security;
alter table public.certificate_templates         enable row level security;
alter table public.referral_destinations         enable row level security;
alter table public.diagnoses_catalog             enable row level security;
alter table public.diagnosis_favorites           enable row level security;
alter table public.encounters                    enable row level security;
alter table public.encounter_handovers           enable row level security;
alter table public.encounter_addenda             enable row level security;
alter table public.diagnoses                     enable row level security;
alter table public.encounter_tests               enable row level security;
alter table public.prescriptions                 enable row level security;
alter table public.prescription_items            enable row level security;
alter table public.referrals                     enable row level security;
alter table public.certificates                  enable row level security;
alter table public.surveillance_alerts           enable row level security;
alter table public.medical_history               enable row level security;

create policy encounter_type_templates_select on public.encounter_type_templates
  for select to authenticated using (true);
create policy rapid_test_type_templates_select on public.rapid_test_type_templates
  for select to authenticated using (true);
create policy drug_routes_select on public.drug_routes
  for select to authenticated using (true);
create policy certificate_template_defaults_select on public.certificate_template_defaults
  for select to authenticated using (true);
create policy diagnoses_catalog_select on public.diagnoses_catalog
  for select to authenticated
  using (org_id is null or public.encounters_can_read(org_id));

-- Types de consultation : lus par les soignants (le nom d'un type sensible ne regarde
-- pas l'accueil) ; examens et modèles de certificat de même.
create policy encounter_types_select on public.encounter_types
  for select to authenticated using (public.encounters_can_read(org_id));
create policy encounter_types_insert on public.encounter_types
  for insert to authenticated with check (public.encounters_can_configure(org_id));
create policy encounter_types_update on public.encounter_types
  for update to authenticated
  using (public.encounters_can_configure(org_id))
  with check (public.encounters_can_configure(org_id));

create policy rapid_test_types_select on public.rapid_test_types
  for select to authenticated using (public.encounters_can_read(org_id));
create policy rapid_test_types_insert on public.rapid_test_types
  for insert to authenticated with check (public.encounters_can_configure(org_id));
create policy rapid_test_types_update on public.rapid_test_types
  for update to authenticated
  using (public.encounters_can_configure(org_id))
  with check (public.encounters_can_configure(org_id));

create policy certificate_templates_select on public.certificate_templates
  for select to authenticated using (public.encounters_can_read(org_id));
create policy certificate_templates_insert on public.certificate_templates
  for insert to authenticated with check (public.encounters_can_configure(org_id));
create policy certificate_templates_update on public.certificate_templates
  for update to authenticated
  using (public.encounters_can_configure(org_id))
  with check (public.encounters_can_configure(org_id));

create policy referral_destinations_select on public.referral_destinations
  for select to authenticated using (public.encounters_can_read(org_id));
create policy referral_destinations_insert on public.referral_destinations
  for insert to authenticated
  with check (public.org_has_feature(org_id, 'references')
              and (public.encounters_can_write(org_id) or public.encounters_can_configure(org_id)));
create policy referral_destinations_update on public.referral_destinations
  for update to authenticated
  using (public.org_has_feature(org_id, 'references')
         and (public.encounters_can_write(org_id) or public.encounters_can_configure(org_id)))
  with check (public.org_has_feature(org_id, 'references')
              and (public.encounters_can_write(org_id) or public.encounters_can_configure(org_id)));

-- Tables du contenu médical : RLS sans aucune policy pour authenticated (aucun droit
-- direct de toute façon) ; lecture et écriture par les fonctions ci-dessus.

-- Fonctions appelées par le client : jamais par anon (droit par défaut de public retiré).
revoke execute on function
  public.encounters_can_read(uuid), public.encounters_can_write(uuid),
  public.encounters_can_configure(uuid), public.encounter_permissions(uuid),
  public.sensitive_reads_summary(uuid, date, date),
  public.start_encounter(uuid, uuid, uuid), public.save_encounter_draft(uuid, integer, jsonb),
  public.take_over_encounter(uuid), public.discard_encounter_draft(uuid, integer),
  public.validate_encounter(uuid, integer), public.add_encounter_addendum(uuid, text),
  public.add_prescription(uuid, text, jsonb), public.get_encounter(uuid),
  public.my_draft_encounters(uuid), public.patient_timeline(uuid, text[]),
  public.search_diagnoses(uuid, text, integer), public.set_diagnosis_favorite(uuid, uuid, boolean),
  public.save_org_diagnosis(uuid, uuid, text, text, text, boolean, boolean),
  public.get_medical_history(uuid),
  public.save_medical_history_item(uuid, uuid, text, text, text, integer, boolean, uuid),
  public.remove_medical_history_item(uuid),
  public.create_referral(uuid, uuid, text, text, text, text, text),
  public.record_counter_referral(uuid, text, date),
  public.issue_certificate(uuid, uuid, text, text, integer, date, boolean)
from public, anon;

grant execute on function
  public.encounters_can_read(uuid), public.encounters_can_write(uuid),
  public.encounters_can_configure(uuid), public.encounter_permissions(uuid),
  public.sensitive_reads_summary(uuid, date, date),
  public.start_encounter(uuid, uuid, uuid), public.save_encounter_draft(uuid, integer, jsonb),
  public.take_over_encounter(uuid), public.discard_encounter_draft(uuid, integer),
  public.validate_encounter(uuid, integer), public.add_encounter_addendum(uuid, text),
  public.add_prescription(uuid, text, jsonb), public.get_encounter(uuid),
  public.my_draft_encounters(uuid), public.patient_timeline(uuid, text[]),
  public.search_diagnoses(uuid, text, integer), public.set_diagnosis_favorite(uuid, uuid, boolean),
  public.save_org_diagnosis(uuid, uuid, text, text, text, boolean, boolean),
  public.get_medical_history(uuid),
  public.save_medical_history_item(uuid, uuid, text, text, text, integer, boolean, uuid),
  public.remove_medical_history_item(uuid),
  public.create_referral(uuid, uuid, text, text, text, text, text),
  public.record_counter_referral(uuid, text, date),
  public.issue_certificate(uuid, uuid, text, text, integer, date, boolean)
to authenticated;

-- Fonctions internes : jamais appelées par le client.
revoke execute on function
  public.user_display_name(uuid), public.try_uuid(text), public.jsonb_array_or_empty(jsonb),
  public.seed_encounter_settings(uuid), public.organizations_seed_encounter_settings(),
  public.medical_row_is_merge_relink(jsonb, jsonb), public.encounters_guard(),
  public.medical_rows_frozen(), public.encounter_children_insert_guard(),
  public.prescription_items_insert_guard(), public.referrals_guard(),
  public.medical_history_guard(), public.no_delete(), public.encounters_audit(),
  public.log_sensitive_read(uuid, text, uuid, uuid),
  public.encounter_for_writer(uuid), public.encounter_assert_author(public.encounters, integer),
  public.encounter_draft_sensitive(uuid, uuid, jsonb), public.encounter_header(public.encounters),
  public.encounter_text(jsonb, text, integer, text),
  public.encounter_number(jsonb, text, numeric, numeric, text),
  public.encounter_insert_prescription(public.encounters, text, jsonb),
  public.encounter_for_document(uuid), public.patients_merge_relink_encounters(),
  public.surveillance_notify_immediate(uuid, uuid, text)
from public, anon, authenticated;
