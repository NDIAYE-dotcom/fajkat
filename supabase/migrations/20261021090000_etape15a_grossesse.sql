-- =============================================================================
-- Étape 15, partie A : suivi de grossesse (feature maternite)
-- -----------------------------------------------------------------------------
-- 1. Droits : lecture par les rôles médicaux (aide-soignant compris), écriture par les
--    soignants qui rédigent (médecin, sage-femme, infirmier, owner ou admin qui exerce),
--    paramètres par owner, admin et sage-femme. Toujours avec la feature « maternite ».
-- 2. Paramètres par structure (maternity_settings), recopiés des valeurs proposées par
--    offre (maternity_setting_defaults) : méthode de calcul de la DPA (Naegele ou
--    DDR + N jours), durée de la grossesse en jours, âge gestationnel maximal admis.
--    Valeurs de l'OMS, À VALIDER par une sage-femme (docs/plus-tard.md).
-- 3. Grossesse (pregnancies) : une seule en cours par patiente ; gestité, parité et
--    enfants vivants notés à l'ouverture, corrigeables ; retrait motivé d'une grossesse
--    ouverte par erreur, jamais de suppression. L'issue (accouchement…) vient en partie D.
-- 4. Datations (pregnancy_datings), en ajout seul : DDR, échographie (âge gestationnel lu
--    ou DPA lue) ou estimation clinique. Chaque datation garde sa méthode et sa durée du
--    jour (un réglage changé ne recalcule rien). La datation retenue est choisie par le
--    soignant ; l'historique reste.
--    Chaque datation est ramenée à une « DDR équivalente » (reference_date) :
--    âge gestationnel du jour = date du jour - reference_date.
-- 5. Groupe sanguin et rhésus : patient_medical.blood_group (étape 11), sans doublon ;
--    antécédents obstétricaux : medical_history, catégorie « obstetric » (étape 14).
-- 6. Aucune lecture directe des tables cliniques : fonctions seulement. Journal sans valeur,
--    lu seulement par l'owner ou l'admin qui exerce. Fusion de dossiers : grossesses
--    rattachées au dossier gardé.
-- =============================================================================


-- =============================================================================
-- 1. Droits
-- =============================================================================

create function public.maternity_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'maternite')
     and public.patients_can_read_medical(p_org_id);
$$;

create function public.maternity_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'maternite')
     and public.patients_can_read_sensitive(p_org_id);
$$;

create function public.maternity_can_configure(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'maternite')
     and public.has_role(p_org_id, array['owner', 'admin', 'sage_femme']);
$$;

create function public.maternity_permissions(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'read',      public.maternity_can_read(p_org_id),
    'write',     public.maternity_can_write(p_org_id),
    'configure', public.maternity_can_configure(p_org_id));
$$;

-- Écriture refusée : message commun.
create function public.maternity_assert_write(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not public.maternity_can_write(p_org_id) then
    raise exception 'Le suivi de grossesse est tenu par les soignants.' using errcode = '42501';
  end if;
  if not public.patients_org_writable(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
end;
$$;


-- =============================================================================
-- 2. Paramètres
-- =============================================================================

-- Valeurs proposées par offre (OMS), à faire valider par une sage-femme.
create table public.maternity_setting_defaults (
  plan_code             text primary key check (plan_code in ('poste_sante', 'clinique')),
  edd_method            text not null check (edd_method in ('naegele', 'plus_days')),
  pregnancy_length_days smallint not null check (pregnancy_length_days between 250 and 310),
  max_gestational_days  smallint not null check (max_gestational_days between 280 and 330),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

insert into public.maternity_setting_defaults
  (plan_code, edd_method, pregnancy_length_days, max_gestational_days)
values
  ('poste_sante', 'naegele', 280, 308),
  ('clinique',    'naegele', 280, 308);

create table public.maternity_settings (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null unique references public.organizations (id),
  -- naegele : DDR + 7 jours - 3 mois + 1 an ; plus_days : DDR + pregnancy_length_days.
  edd_method            text not null check (edd_method in ('naegele', 'plus_days')),
  -- Durée de la grossesse (DDR + N jours ; datation par échographie ou estimation).
  pregnancy_length_days smallint not null check (pregnancy_length_days between 250 and 310),
  -- Au-delà, une datation est refusée comme invraisemblable (44 SA proposées).
  max_gestational_days  smallint not null check (max_gestational_days between 280 and 330),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz
);

create trigger maternity_settings_set_updated_at before update on public.maternity_settings
  for each row execute function public.set_updated_at();
create trigger maternity_settings_audit after insert or update on public.maternity_settings
  for each row execute function public.audit_trigger();

create function public.seed_maternity_settings(p_org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.maternity_settings (org_id, edd_method, pregnancy_length_days,
                                         max_gestational_days, created_by)
  select o.id, d.edd_method, d.pregnancy_length_days, d.max_gestational_days, null
    from public.organizations o
    join public.maternity_setting_defaults d on d.plan_code = o.type
   where o.id = p_org_id
  on conflict (org_id) do nothing;
end;
$$;

create function public.organizations_seed_maternity_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_maternity_settings(new.id);
  return null;
end;
$$;

create trigger organizations_seed_maternity_settings
  after insert on public.organizations
  for each row execute function public.organizations_seed_maternity_settings();

-- Passage Poste -> Clinique : les réglages de la structure restent les siens.
select public.seed_maternity_settings(o.id) from public.organizations o;


-- =============================================================================
-- 3. Calculs
-- =============================================================================

-- Date prévue d'accouchement depuis la DDR.
-- Naegele, dans cet ordre : + 7 jours, puis - 3 mois, puis + 1 an. Un jour qui n'existe
-- pas (31 septembre) devient le dernier jour du mois, comme dayjs dans le front
-- (src/modules/maternite/grossesse.js). Les mois sont retirés à part (et non « + 9 mois »
-- d'un coup) : les deux diffèrent autour du 29 février.
-- Contrôle : DDR 01/03/2026 -> 08/12/2026 (Naegele) ; 06/12/2026 (DDR + 280 jours).
create function public.pregnancy_edd(p_lmp date, p_method text, p_length_days integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'naegele' then (((p_lmp + 7) - interval '3 months')::date + interval '1 year')::date
    when 'plus_days' then p_lmp + p_length_days
  end;
$$;

-- Valeurs d'une datation, calculées et contrôlées par la base. Interne.
--   lmp        : p_lmp_date ;
--   ultrasound : p_exam_date, puis p_ga_days (âge gestationnel lu) OU p_edd (DPA lue) ;
--   clinical   : p_exam_date et p_ga_days.
create function public.pregnancy_dating_compute(
  p_org_id uuid, p_kind text, p_lmp_date date, p_exam_date date, p_ga_days integer,
  p_edd date,
  out reference_date date, out edd date, out ga_days_at_exam integer, out edd_method text,
  out length_days integer, out edd_reported boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s     public.maternity_settings;
  v_today date := public.org_local_date(p_org_id);
  v_max   integer;
  v_ga    integer;
begin
  select * into v_s from public.maternity_settings where org_id = p_org_id;
  if v_s.id is null then
    raise exception 'Réglages de la maternité introuvables.' using errcode = '22023';
  end if;
  v_max := v_s.max_gestational_days;
  length_days := v_s.pregnancy_length_days;
  edd_reported := false;

  if p_kind = 'lmp' then
    if p_lmp_date is null then
      raise exception 'Indiquez la date des dernières règles.' using errcode = '22023';
    end if;
    if p_lmp_date > v_today then
      raise exception 'La date des dernières règles ne peut pas être dans le futur.'
        using errcode = '22023';
    end if;
    reference_date := p_lmp_date;
    edd_method := v_s.edd_method;
    edd := public.pregnancy_edd(p_lmp_date, v_s.edd_method, v_s.pregnancy_length_days);
    ga_days_at_exam := null;
  elsif p_kind in ('ultrasound', 'clinical') then
    if p_exam_date is null then
      raise exception 'Indiquez la date de l''examen.' using errcode = '22023';
    end if;
    if p_exam_date > v_today then
      raise exception 'La date de l''examen ne peut pas être dans le futur.' using errcode = '22023';
    end if;
    if p_kind = 'clinical' and p_edd is not null then
      raise exception 'Une estimation clinique se note en âge gestationnel.' using errcode = '22023';
    end if;
    if p_ga_days is not null and p_edd is not null then
      raise exception 'Indiquez soit l''âge gestationnel, soit la date prévue, pas les deux.'
        using errcode = '22023';
    end if;
    edd_method := 'ga';
    if p_ga_days is not null then
      if p_ga_days < 0 or p_ga_days > v_max then
        raise exception 'Âge gestationnel à l''examen : entre 0 et % SA.', v_max / 7
          using errcode = '22023';
      end if;
      ga_days_at_exam := p_ga_days;
      reference_date := p_exam_date - p_ga_days;
      edd := reference_date + v_s.pregnancy_length_days;
    elsif p_edd is not null then
      edd_reported := true;
      reference_date := p_edd - v_s.pregnancy_length_days;
      ga_days_at_exam := p_exam_date - reference_date;
      edd := p_edd;
      if ga_days_at_exam < 0 or ga_days_at_exam > v_max then
        raise exception 'Cette date prévue ne correspond pas à la date de l''examen : vérifiez les deux dates.'
          using errcode = '22023';
      end if;
    else
      raise exception 'Indiquez l''âge gestationnel à l''examen%.',
        case when p_kind = 'ultrasound' then ' ou la date prévue lue sur le compte rendu' else '' end
        using errcode = '22023';
    end if;
  else
    raise exception 'Choisissez comment la grossesse est datée.' using errcode = '22023';
  end if;

  v_ga := v_today - reference_date;
  if v_ga > v_max then
    raise exception 'D''après cette datation, la grossesse aurait % SA aujourd''hui : vérifiez la date.',
      v_ga / 7 using errcode = '22023';
  end if;
end;
$$;


-- =============================================================================
-- 4. Tables
-- =============================================================================

create table public.pregnancies (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  patient_id        uuid not null,
  -- ongoing : en cours ; delivered / ended : issue notée (partie D).
  status            text not null default 'ongoing'
                      check (status in ('ongoing', 'delivered', 'ended')),
  opened_on         date not null,
  -- Notés à l'ouverture, cette grossesse comprise pour la gestité.
  gravidity         smallint not null check (gravidity between 1 and 30),
  parity            smallint not null check (parity between 0 and 29),
  living_children   smallint not null check (living_children between 0 and 30),
  current_dating_id uuid not null,
  -- Grossesse ouverte par erreur : retirée avec un motif, jamais effacée.
  removed_reason    text check (char_length(removed_reason) between 3 and 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at        timestamptz,
  unique (id, org_id),
  constraint pregnancies_parity_gravidity_check check (parity < gravidity),
  constraint pregnancies_removed_check check ((deleted_at is null) = (removed_reason is null)),
  foreign key (patient_id, org_id) references public.patients (id, org_id)
);
-- Une seule grossesse en cours par patiente.
create unique index pregnancies_one_ongoing_idx on public.pregnancies (patient_id)
  where status = 'ongoing' and deleted_at is null;
create index pregnancies_org_ongoing_idx on public.pregnancies (org_id)
  where status = 'ongoing' and deleted_at is null;

create table public.pregnancy_datings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  pregnancy_id    uuid not null,
  kind            text not null check (kind in ('lmp', 'ultrasound', 'clinical')),
  lmp_date        date,
  exam_date       date,
  ga_days_at_exam smallint check (ga_days_at_exam between 0 and 330),
  -- Échographie : DPA lue sur le compte rendu (sinon : âge gestationnel lu).
  edd_reported    boolean not null default false,
  -- Méthode et durée du jour : naegele / plus_days (DDR), ga (examen).
  edd_method      text not null check (edd_method in ('naegele', 'plus_days', 'ga')),
  length_days     smallint not null check (length_days between 250 and 310),
  -- DDR, ou DDR équivalente d'après l'examen.
  reference_date  date not null,
  edd             date not null,
  note            text check (char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at      timestamptz,
  unique (id, org_id),
  unique (id, pregnancy_id),
  constraint pregnancy_datings_kind_values_check check (
    (kind = 'lmp' and lmp_date is not null and exam_date is null and ga_days_at_exam is null
     and not edd_reported and edd_method in ('naegele', 'plus_days')
     and reference_date = lmp_date)
    or (kind in ('ultrasound', 'clinical') and lmp_date is null and exam_date is not null
        and ga_days_at_exam is not null and edd_method = 'ga'
        and (kind = 'ultrasound' or not edd_reported))),
  constraint pregnancy_datings_edd_after_check check (edd > reference_date),
  foreign key (pregnancy_id, org_id) references public.pregnancies (id, org_id)
);
create index pregnancy_datings_pregnancy_idx on public.pregnancy_datings (pregnancy_id);

-- La datation retenue appartient à la grossesse. Différée : la grossesse et sa première
-- datation sont créées dans la même transaction.
alter table public.pregnancies
  add constraint pregnancies_current_dating_fk
  foreign key (current_dating_id, id) references public.pregnancy_datings (id, pregnancy_id)
  deferrable initially deferred;

create trigger pregnancies_set_updated_at before update on public.pregnancies
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 5. Verrous
-- =============================================================================

create function public.pregnancies_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une grossesse ne se supprime pas : retirez-la avec un motif.'
      using errcode = '42501';
  end if;
  -- Fusion de dossiers : patient_id vers le dossier gardé, rien d'autre (retirée comprise).
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'Grossesse retirée : elle ne se modifie plus.' using errcode = '42501';
  end if;
  if new.org_id is distinct from old.org_id or new.opened_on is distinct from old.opened_on
     or new.created_by is distinct from old.created_by then
    raise exception 'Ces informations de la grossesse ne se modifient pas.' using errcode = '42501';
  end if;
  if new.patient_id is distinct from old.patient_id then
    raise exception 'Une grossesse ne change pas de patiente.' using errcode = '42501';
  end if;
  if old.status <> 'ongoing' and new.status = 'ongoing' then
    raise exception 'Une grossesse terminée ne se rouvre pas.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger pregnancies_guard before update or delete on public.pregnancies
  for each row execute function public.pregnancies_guard();

create function public.pregnancy_datings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Une datation ne se modifie pas : ajoutez-en une nouvelle.'
    using errcode = '42501';
end;
$$;

create trigger pregnancy_datings_guard before update or delete on public.pregnancy_datings
  for each row execute function public.pregnancy_datings_guard();


-- =============================================================================
-- 6. Journal
-- =============================================================================

-- Noms des champs modifiés seulement, jamais les valeurs.
create trigger pregnancies_audit after insert or update on public.pregnancies
  for each row execute function public.audit_trigger_redacted();
create trigger pregnancy_datings_audit after insert on public.pregnancy_datings
  for each row execute function public.audit_trigger_redacted('pregnancy_id');

-- Registre des tables médicales du journal : leurs lignes ne sont lues que par l'owner ou
-- l'admin qui exerce (policy audit_logs_select_admin). Toute nouvelle table médicale s'y
-- inscrit dans sa propre migration :
--   insert into public.audit_medical_tables (table_name) values ('…') on conflict do nothing;
create table public.audit_medical_tables (
  table_name text primary key check (table_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  created_at timestamptz not null default now()
);

insert into public.audit_medical_tables (table_name)
values
  -- Étape 11
  ('patient_medical'),
  -- Étape 12
  ('vital_signs'), ('visit_reasons'),
  -- Étape 13
  ('appointment_notes'),
  -- Étape 14
  ('encounters'), ('encounter_addenda'), ('encounter_handovers'), ('diagnoses'),
  ('encounter_tests'), ('prescriptions'), ('prescription_items'), ('referrals'),
  ('certificates'), ('medical_history'), ('surveillance_alerts'), ('encounter_followups'),
  -- Étape 15
  ('pregnancies'), ('pregnancy_datings')
on conflict do nothing;

alter table public.audit_medical_tables enable row level security;
revoke all on public.audit_medical_tables from anon, authenticated;

-- Lit le registre (stable et non plus immutable : le registre change avec les migrations).
create or replace function public.audit_table_is_medical(p_table text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.audit_medical_tables where table_name = p_table);
$$;


-- =============================================================================
-- 7. Fonctions appelées par le client
-- =============================================================================

-- Patiente d'une grossesse à ouvrir : du sexe féminin, dossier actif. Interne.
create function public.pregnancy_patient_org(p_patient_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p public.patients;
begin
  select * into v_p from public.patients where id = p_patient_id and deleted_at is null;
  if v_p.id is null then
    raise exception 'Dossier introuvable.' using errcode = '22023';
  end if;
  perform public.maternity_assert_write(v_p.org_id);
  if v_p.sex <> 'F' then
    raise exception 'Le suivi de grossesse concerne une patiente.' using errcode = '22023';
  end if;
  return v_p.org_id;
end;
$$;

-- Gestité, parité, enfants vivants : contrôles communs. Interne.
create function public.pregnancy_check_obstetric(
  p_gravidity integer, p_parity integer, p_living_children integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_gravidity is null or p_gravidity < 1 or p_gravidity > 30 then
    raise exception 'Gestité : nombre de grossesses, celle-ci comprise (de 1 à 30).'
      using errcode = '22023';
  end if;
  if p_parity is null or p_parity < 0 then
    raise exception 'Parité : nombre d''accouchements avant cette grossesse (0 si aucun).'
      using errcode = '22023';
  end if;
  if p_parity >= p_gravidity then
    raise exception 'La parité compte les accouchements avant cette grossesse : au plus %.',
      p_gravidity - 1 using errcode = '22023';
  end if;
  if p_living_children is null or p_living_children < 0 or p_living_children > 30 then
    raise exception 'Enfants vivants : de 0 à 30.' using errcode = '22023';
  end if;
end;
$$;

-- Ouvre le suivi : grossesse et première datation, retenue. Renvoie l'identifiant.
create function public.open_pregnancy(
  p_patient_id uuid, p_kind text, p_lmp_date date, p_exam_date date, p_ga_days integer,
  p_edd date, p_gravidity integer, p_parity integer, p_living_children integer,
  p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_calc    record;
  v_preg_id uuid := gen_random_uuid();
  v_dat_id  uuid := gen_random_uuid();
begin
  v_org := public.pregnancy_patient_org(p_patient_id);
  -- Deux ouvertures simultanées pour la même patiente : une seule passe.
  perform pg_advisory_xact_lock(hashtextextended('pregnancy:' || p_patient_id::text, 0));
  if exists (select 1 from public.pregnancies
              where patient_id = p_patient_id and status = 'ongoing' and deleted_at is null) then
    raise exception 'Une grossesse est déjà suivie pour cette patiente.' using errcode = '22023';
  end if;
  perform public.pregnancy_check_obstetric(p_gravidity, p_parity, p_living_children);
  select * into v_calc
    from public.pregnancy_dating_compute(v_org, p_kind, p_lmp_date, p_exam_date, p_ga_days, p_edd);

  insert into public.pregnancies (id, org_id, patient_id, opened_on, gravidity, parity,
                                  living_children, current_dating_id)
  values (v_preg_id, v_org, p_patient_id, public.org_local_date(v_org), p_gravidity, p_parity,
          p_living_children, v_dat_id);
  insert into public.pregnancy_datings (id, org_id, pregnancy_id, kind, lmp_date, exam_date,
                                        ga_days_at_exam, edd_reported, edd_method, length_days,
                                        reference_date, edd, note)
  values (v_dat_id, v_org, v_preg_id, p_kind,
          case when p_kind = 'lmp' then p_lmp_date end,
          case when p_kind <> 'lmp' then p_exam_date end,
          v_calc.ga_days_at_exam, v_calc.edd_reported, v_calc.edd_method, v_calc.length_days,
          v_calc.reference_date, v_calc.edd, nullif(btrim(coalesce(p_note, '')), ''));
  return v_preg_id;
end;
$$;

-- Grossesse en cours, verrouillée, pour une écriture. Interne.
create function public.pregnancy_for_write(p_pregnancy_id uuid)
returns public.pregnancies
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g public.pregnancies;
begin
  select * into v_g from public.pregnancies
   where id = p_pregnancy_id and deleted_at is null
     for update;
  if v_g.id is null then
    raise exception 'Grossesse introuvable.' using errcode = '22023';
  end if;
  perform public.maternity_assert_write(v_g.org_id);
  if v_g.status <> 'ongoing' then
    raise exception 'Cette grossesse est terminée : elle ne se modifie plus.' using errcode = '22023';
  end if;
  return v_g;
end;
$$;

-- Nouvelle datation (échographie après la DDR…), retenue d'office. L'ancienne reste.
create function public.add_pregnancy_dating(
  p_pregnancy_id uuid, p_kind text, p_lmp_date date, p_exam_date date, p_ga_days integer,
  p_edd date, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g    public.pregnancies;
  v_calc record;
  v_id   uuid;
begin
  v_g := public.pregnancy_for_write(p_pregnancy_id);
  select * into v_calc
    from public.pregnancy_dating_compute(v_g.org_id, p_kind, p_lmp_date, p_exam_date,
                                         p_ga_days, p_edd);
  insert into public.pregnancy_datings (org_id, pregnancy_id, kind, lmp_date, exam_date,
                                        ga_days_at_exam, edd_reported, edd_method, length_days,
                                        reference_date, edd, note)
  values (v_g.org_id, v_g.id, p_kind,
          case when p_kind = 'lmp' then p_lmp_date end,
          case when p_kind <> 'lmp' then p_exam_date end,
          v_calc.ga_days_at_exam, v_calc.edd_reported, v_calc.edd_method, v_calc.length_days,
          v_calc.reference_date, v_calc.edd, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  update public.pregnancies set current_dating_id = v_id where id = v_g.id;
  return v_id;
end;
$$;

-- Revenir à une datation de l'historique.
create function public.retain_pregnancy_dating(p_pregnancy_id uuid, p_dating_id uuid)
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
  if not exists (select 1 from public.pregnancy_datings
                  where id = p_dating_id and pregnancy_id = v_g.id) then
    raise exception 'Datation introuvable pour cette grossesse.' using errcode = '22023';
  end if;
  update public.pregnancies set current_dating_id = p_dating_id where id = v_g.id;
end;
$$;

create function public.update_pregnancy_obstetric(
  p_pregnancy_id uuid, p_gravidity integer, p_parity integer, p_living_children integer)
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
  perform public.pregnancy_check_obstetric(p_gravidity, p_parity, p_living_children);
  update public.pregnancies
     set gravidity = p_gravidity, parity = p_parity, living_children = p_living_children
   where id = v_g.id;
end;
$$;

-- Grossesse ouverte par erreur (mauvaise patiente, test négatif ensuite…).
create function public.remove_pregnancy(p_pregnancy_id uuid, p_reason text)
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
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez pourquoi cette grossesse est retirée.' using errcode = '22023';
  end if;
  update public.pregnancies
     set deleted_at = now(), removed_reason = left(btrim(p_reason), 300)
   where id = v_g.id;
end;
$$;

-- Groupe sanguin et rhésus depuis le suivi de grossesse : seule cette valeur de
-- patient_medical change (null : inconnu).
create function public.set_patient_blood_group(p_patient_id uuid, p_blood_group text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_groupe text := nullif(btrim(coalesce(p_blood_group, '')), '');
begin
  select org_id into v_org from public.patients where id = p_patient_id and deleted_at is null;
  perform public.maternity_assert_write(v_org);
  if v_groupe is not null
     and v_groupe not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'Groupe sanguin : choisissez A, B, AB ou O, et le rhésus.' using errcode = '22023';
  end if;
  update public.patient_medical set blood_group = v_groupe
   where patient_id = p_patient_id and deleted_at is null;
  if not found then
    insert into public.patient_medical (org_id, patient_id, blood_group)
    values (v_org, p_patient_id, v_groupe);
  end if;
end;
$$;

-- Une grossesse avec ses datations et l'âge gestationnel du jour de la structure.
create function public.get_pregnancy(p_pregnancy_id uuid)
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
        from public.pregnancy_datings d where d.pregnancy_id = v_g.id), '[]'::jsonb));
end;
$$;

-- Grossesses d'une patiente (onglet « Grossesse » de la fiche), la plus récente en haut.
create function public.list_patient_pregnancies(p_patient_id uuid)
returns table (id uuid, status text, opened_on date, edd date, ga_days integer,
               dating_kind text, gravidity smallint, parity smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  select org_id into v_org from public.patients where id = p_patient_id;
  if v_org is null or not public.maternity_can_read(v_org) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  return query
    select g.id, g.status, g.opened_on, d.edd,
           case when g.status = 'ongoing'
                then public.org_local_date(g.org_id) - d.reference_date end,
           d.kind, g.gravidity, g.parity
      from public.pregnancies g
      join public.pregnancy_datings d on d.id = g.current_dating_id
     where g.patient_id = p_patient_id and g.deleted_at is null
     order by g.opened_on desc, g.created_at desc;
end;
$$;

-- Grossesses en cours de la structure (page Maternité), DPA la plus proche en haut.
-- p_query : nom, prénom ou numéro de dossier, mots dans le désordre.
create function public.list_ongoing_pregnancies(
  p_org_id uuid, p_query text default null, p_limit integer default 50,
  p_offset integer default 0)
returns table (pregnancy_id uuid, patient_id uuid, file_number text, last_name text,
               first_name text, birth_date date, birth_date_estimated boolean,
               birth_year smallint, declared_age smallint, age_declared_on date, neighborhood text, ga_days integer, edd date,
               dating_kind text, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_mots  text[];
  v_today date;
begin
  if not public.maternity_can_read(p_org_id) then
    raise exception 'Le suivi de grossesse est réservé aux soignants.' using errcode = '42501';
  end if;
  v_today := public.org_local_date(p_org_id);
  v_mots := array_remove(string_to_array(public.patient_normalize(p_query), ' '), '');
  return query
    select g.id, p.id, p.file_number, p.last_name, p.first_name, p.birth_date,
           p.birth_date_estimated, p.birth_year, p.declared_age, p.age_declared_on,
           p.neighborhood, v_today - d.reference_date, d.edd, d.kind, count(*) over ()
      from public.pregnancies g
      join public.pregnancy_datings d on d.id = g.current_dating_id
      join public.patients p on p.id = g.patient_id
     where g.org_id = p_org_id and g.status = 'ongoing' and g.deleted_at is null
       and (cardinality(coalesce(v_mots, '{}')) = 0
            or (select bool_and(p.search_text like '%' || m || '%') from unnest(v_mots) m))
     order by d.edd, p.last_name, p.first_name
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


-- =============================================================================
-- 8. Fusion de dossiers
-- =============================================================================

create function public.patients_merge_relink_maternity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merged_into_id is null or old.merged_into_id is not null then
    return null;
  end if;
  if exists (select 1 from public.pregnancies
              where patient_id = new.id and status = 'ongoing' and deleted_at is null)
     and exists (select 1 from public.pregnancies
                  where patient_id = new.merged_into_id and status = 'ongoing'
                    and deleted_at is null) then
    raise exception 'Les deux dossiers ont une grossesse en cours : retirez celle ouverte par erreur avant la fusion.'
      using errcode = '22023';
  end if;
  update public.pregnancies set patient_id = new.merged_into_id where patient_id = new.id;
  return null;
end;
$$;

create trigger patients_merge_relink_maternity
  after update of merged_into_id on public.patients
  for each row execute function public.patients_merge_relink_maternity();


-- =============================================================================
-- 9. Droits d'accès
-- =============================================================================

revoke all on public.maternity_setting_defaults, public.maternity_settings,
              public.pregnancies, public.pregnancy_datings
from anon, authenticated;

-- Réglages : lus par les membres (aucune donnée de patient), modifiés par owner, admin et
-- sage-femme. Grossesses et datations : aucun accès direct, fonctions seulement.
grant select on public.maternity_setting_defaults, public.maternity_settings to authenticated;
grant update (edd_method, pregnancy_length_days, max_gestational_days)
  on public.maternity_settings to authenticated;

alter table public.maternity_setting_defaults enable row level security;
alter table public.maternity_settings         enable row level security;
alter table public.pregnancies                enable row level security;
alter table public.pregnancy_datings          enable row level security;

create policy maternity_setting_defaults_select on public.maternity_setting_defaults
  for select to authenticated using (true);
create policy maternity_settings_select on public.maternity_settings
  for select to authenticated using (public.is_member(org_id));
create policy maternity_settings_update on public.maternity_settings
  for update to authenticated
  using (public.maternity_can_configure(org_id))
  with check (public.maternity_can_configure(org_id));

-- Fonctions internes : jamais appelées par le client (Supabase donne d'office le droit
-- d'exécution à authenticated).
revoke execute on function
  public.maternity_assert_write(uuid), public.seed_maternity_settings(uuid),
  public.organizations_seed_maternity_settings(),
  public.pregnancy_dating_compute(uuid, text, date, date, integer, date),
  public.pregnancy_patient_org(uuid), public.pregnancy_check_obstetric(integer, integer, integer),
  public.pregnancy_for_write(uuid), public.pregnancies_guard(),
  public.pregnancy_datings_guard(), public.patients_merge_relink_maternity()
from public, anon, authenticated;

-- Fonctions appelées par le client : jamais par anon.
revoke execute on function
  public.maternity_can_read(uuid), public.maternity_can_write(uuid),
  public.maternity_can_configure(uuid), public.maternity_permissions(uuid),
  public.pregnancy_edd(date, text, integer),
  public.open_pregnancy(uuid, text, date, date, integer, date, integer, integer, integer, text),
  public.add_pregnancy_dating(uuid, text, date, date, integer, date, text),
  public.retain_pregnancy_dating(uuid, uuid),
  public.update_pregnancy_obstetric(uuid, integer, integer, integer),
  public.remove_pregnancy(uuid, text), public.set_patient_blood_group(uuid, text),
  public.get_pregnancy(uuid), public.list_patient_pregnancies(uuid),
  public.list_ongoing_pregnancies(uuid, text, integer, integer)
from public, anon;

grant execute on function
  public.maternity_can_read(uuid), public.maternity_can_write(uuid),
  public.maternity_can_configure(uuid), public.maternity_permissions(uuid),
  public.pregnancy_edd(date, text, integer),
  public.open_pregnancy(uuid, text, date, date, integer, date, integer, integer, integer, text),
  public.add_pregnancy_dating(uuid, text, date, date, integer, date, text),
  public.retain_pregnancy_dating(uuid, uuid),
  public.update_pregnancy_obstetric(uuid, integer, integer, integer),
  public.remove_pregnancy(uuid, text), public.set_patient_blood_group(uuid, text),
  public.get_pregnancy(uuid), public.list_patient_pregnancies(uuid),
  public.list_ongoing_pregnancies(uuid, text, integer, integer)
to authenticated;
