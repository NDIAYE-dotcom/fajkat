-- =============================================================================
-- Étape 14, partie E : références, certificats, prochain rendez-vous ; correctif 14f
-- -----------------------------------------------------------------------------
-- Les tables existent depuis la partie A (referrals, referral_destinations, certificates,
-- certificate_templates). Cette migration ajoute ce que les écrans demandent :
-- 1. Paramètres lisibles par owner et admin même s'ils n'exercent pas : modèles de
--    certificat et établissements de référence (aucune donnée de patient).
-- 2. Références :
--    - contre-référence structurée (date, structure, diagnostic retenu, traitement,
--      conduite à tenir, suivi), saisie une fois ; counter_referral garde le texte complet ;
--    - délai de retour paramétrable (organizations.settings.referral_return_days, 14 jours
--      tant que la structure ne l'a pas réglé) ; « en retard » au-delà ;
--    - list_referrals (page Références) et get_referral (impression, contre-référence) :
--      soignants qui rédigent seulement. Référence d'une consultation sensible : la liste
--      ne donne ni le motif ni rien du contenu (destination et patient seulement) ; get_referral
--      journalise la lecture (READ, une par ouverture).
-- 3. Certificats : numéro unique par structure et par année (CERT-2026-0001), attribué par
--    la base à l'émission ; {naissance} dans les modèles par défaut (« née le 12/03/1994 »,
--    « né vers 1996 ») ; get_certificate pour l'impression (soignants qui rédigent, lecture
--    d'un certificat d'une consultation sensible journalisée).
-- 4. Prochain rendez-vous depuis la consultation : schedule_encounter_followup (type, date,
--    séance ou heure, praticien ; mêmes contrôles que l'agenda, origine « followup »,
--    module « consultation ») et encounter_followups (lien consultation -> rendez-vous,
--    sans accès direct). get_encounter_followups suit les reports jusqu'au dernier
--    rendez-vous. Les règles des types discrets sont celles de l'agenda (aucune lecture
--    nouvelle pour l'accueil).
-- 5. Correctif 14f : la clôture automatique ne relie un passage à un rendez-vous que si ce
--    passage n'est relié à aucun autre rendez-vous et que le patient n'a qu'un rendez-vous
--    à clore ce jour-là ; les liens en double déjà créés sont défaits (le statut « Venu »
--    reste).
-- =============================================================================


-- =============================================================================
-- 1. Paramètres lisibles par owner et admin
-- =============================================================================

drop policy certificate_templates_select on public.certificate_templates;
create policy certificate_templates_select on public.certificate_templates
  for select to authenticated
  using (public.encounters_can_read(org_id) or public.encounters_can_configure(org_id));

drop policy referral_destinations_select on public.referral_destinations;
create policy referral_destinations_select on public.referral_destinations
  for select to authenticated
  using (public.encounters_can_read(org_id) or public.encounters_can_configure(org_id));

-- Qualité d'un membre (« Fonction » de sa fiche du personnel, sinon titre du profil), comme
-- sur l'ordonnance (14f). Interne.
create function public.member_title(p_org_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(f.job_title), '')
       from public.memberships m
       join public.staff_files f on f.membership_id = m.id and f.deleted_at is null
      where m.org_id = p_org_id and m.user_id = p_user_id
      limit 1),
    (select nullif(btrim(title), '') from public.profiles where id = p_user_id));
$$;


-- =============================================================================
-- 2. Références
-- =============================================================================

alter table public.referrals
  add column counter_from_name text check (char_length(counter_from_name) <= 120),
  add column counter_diagnosis text check (char_length(counter_diagnosis) <= 500),
  add column counter_treatment text check (char_length(counter_treatment) <= 1500),
  add column counter_plan      text check (char_length(counter_plan) <= 1500),
  add column counter_followup  text check (char_length(counter_followup) <= 400);

comment on column public.referrals.counter_referral is
  'Contre-référence complète (diagnostic, traitement, conduite à tenir, suivi), recomposée depuis les colonnes counter_*.';

-- Figées, sauf la contre-référence (toutes ses colonnes), saisie une seule fois.
create or replace function public.referrals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contre text[] := array['counter_referral', 'counter_referral_on', 'counter_referral_at',
                           'counter_referral_by', 'counter_from_name', 'counter_diagnosis',
                           'counter_treatment', 'counter_plan', 'counter_followup', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Une référence ne se supprime jamais.' using errcode = '42501';
  end if;
  if public.medical_row_is_merge_relink(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if old.counter_referral is null and new.counter_referral is not null
     and (to_jsonb(new) - v_contre) = (to_jsonb(old) - v_contre) then
    return new;
  end if;
  raise exception 'Référence émise : elle ne se modifie plus.' using errcode = '42501';
end;
$$;

-- Délai après lequel une référence sans retour est signalée « en retard ». Réglé par
-- l'owner ou l'admin (Paramètres -> Références) ; 14 jours tant qu'il ne l'est pas.
create function public.referral_return_days(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when settings ->> 'referral_return_days' ~ '^\d{1,3}$'
                  and (settings ->> 'referral_return_days')::integer between 1 and 365
                 then (settings ->> 'referral_return_days')::integer end
       from public.organizations where id = p_org_id),
    14);
$$;

create function public.referrals_assert_access(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not public.org_has_feature(p_org_id, 'references')
     or not public.encounters_can_write(p_org_id) then
    raise exception 'Les références sont réservées aux soignants.' using errcode = '42501';
  end if;
end;
$$;

-- Contre-référence rapportée par le patient : structure qui l'a vu, diagnostic retenu,
-- traitement, conduite à tenir, suivi. Une seule fois.
drop function public.record_counter_referral(uuid, text, date);
create function public.record_counter_referral(
  p_referral_id uuid,
  p_received_on date,
  p_from_name   text default null,
  p_diagnosis   text default null,
  p_treatment   text default null,
  p_plan        text default null,
  p_followup    text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref   public.referrals;
  v_tz    text;
  v_de    text := nullif(btrim(coalesce(p_from_name, '')), '');
  v_diag  text := nullif(btrim(coalesce(p_diagnosis, '')), '');
  v_trait text := nullif(btrim(coalesce(p_treatment, '')), '');
  v_cat   text := nullif(btrim(coalesce(p_plan, '')), '');
  v_suivi text := nullif(btrim(coalesce(p_followup, '')), '');
begin
  select * into v_ref from public.referrals where id = p_referral_id and deleted_at is null
   for update;
  if not found or not public.org_has_feature(v_ref.org_id, 'references')
     or not public.encounters_can_write(v_ref.org_id) then
    raise exception 'Référence introuvable.' using errcode = '42501';
  end if;
  if v_ref.counter_referral is not null then
    raise exception 'La contre-référence est déjà enregistrée.' using errcode = '22023';
  end if;
  select timezone into v_tz from public.organizations where id = v_ref.org_id;
  if p_received_on is null then
    raise exception 'Indiquez la date de la contre-référence.' using errcode = '22023';
  end if;
  if p_received_on > public.org_local_date(v_ref.org_id)
     or p_received_on < (v_ref.referred_at at time zone v_tz)::date then
    raise exception 'Date impossible : entre le jour de la référence et aujourd''hui.'
      using errcode = '22023';
  end if;
  if v_diag is null and v_trait is null and v_cat is null and v_suivi is null then
    raise exception 'Remplissez au moins le diagnostic retenu, le traitement, la conduite à tenir ou le suivi.'
      using errcode = '22023';
  end if;
  if char_length(v_de) > 120 then
    raise exception 'Structure : 120 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_diag) > 500 then
    raise exception 'Diagnostic retenu : 500 caractères au plus.' using errcode = '22023';
  end if;
  if char_length(v_trait) > 1500 or char_length(v_cat) > 1500 then
    raise exception 'Traitement et conduite à tenir : 1500 caractères au plus chacun.'
      using errcode = '22023';
  end if;
  if char_length(v_suivi) > 400 then
    raise exception 'Suivi : 400 caractères au plus.' using errcode = '22023';
  end if;

  update public.referrals
     set counter_referral = concat_ws(E'\n',
           'Diagnostic retenu : ' || v_diag, 'Traitement : ' || v_trait,
           'Conduite à tenir : ' || v_cat, 'Suivi : ' || v_suivi),
         counter_referral_on = p_received_on,
         counter_referral_at = now(),
         counter_referral_by = auth.uid(),
         counter_from_name = v_de,
         counter_diagnosis = v_diag,
         counter_treatment = v_trait,
         counter_plan = v_cat,
         counter_followup = v_suivi
   where id = p_referral_id;
end;
$$;

-- Page Références : en attente de retour (la plus ancienne en haut, « en retard » après le
-- délai de la structure) ou revenues (la plus récente en haut). Consultation sensible :
-- ni motif, ni urgence ; destination et patient seulement, comme sur la lettre pliée.
create function public.list_referrals(
  p_org_id uuid, p_status text default 'pending', p_limit integer default 100)
returns table (
  id                  uuid,
  encounter_id        uuid,
  patient_id          uuid,
  patient_last_name   text,
  patient_first_name  text,
  file_number         text,
  destination_name    text,
  urgency             text,
  reason              text,
  is_sensitive        boolean,
  referred_at         timestamptz,
  referrer_name       text,
  days_waiting        integer,
  is_late             boolean,
  return_days         integer,
  counter_received_on date,
  counter_recorded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_auj   date;
  v_delai integer;
begin
  perform public.referrals_assert_access(p_org_id);
  if coalesce(p_status, '') not in ('pending', 'returned') then
    raise exception 'Filtre inconnu.' using errcode = '22023';
  end if;
  select timezone into v_tz from public.organizations where organizations.id = p_org_id;
  v_auj := public.org_local_date(p_org_id);
  v_delai := public.referral_return_days(p_org_id);

  return query
    select r.id, r.encounter_id, r.patient_id, p.last_name, p.first_name, p.file_number,
           r.destination_name,
           case when e.is_sensitive then null else r.urgency end,
           case when e.is_sensitive then null else r.reason end,
           e.is_sensitive, r.referred_at, public.user_display_name(r.referred_by),
           (v_auj - (r.referred_at at time zone v_tz)::date)::integer,
           r.counter_referral is null
             and (v_auj - (r.referred_at at time zone v_tz)::date) > v_delai,
           v_delai, r.counter_referral_on, r.counter_referral_at
      from public.referrals r
      join public.encounters e on e.id = r.encounter_id
      join public.patients p on p.id = r.patient_id
     where r.org_id = p_org_id and r.deleted_at is null
       and case when p_status = 'pending' then r.counter_referral is null
                else r.counter_referral is not null end
     order by case when p_status = 'pending' then r.referred_at end asc,
              r.counter_referral_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

-- Une référence (impression, contre-référence). Consultation sensible : une lecture
-- journalisée par ouverture.
create function public.get_referral(p_referral_id uuid, p_opening_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref public.referrals;
  v_enc public.encounters;
begin
  select * into v_ref from public.referrals where id = p_referral_id and deleted_at is null;
  if not found then
    raise exception 'Référence introuvable.' using errcode = '42501';
  end if;
  perform public.referrals_assert_access(v_ref.org_id);
  select * into v_enc from public.encounters where id = v_ref.encounter_id;
  if v_enc.is_sensitive then
    perform public.log_sensitive_opening(v_ref.org_id, 'referrals', v_ref.id, v_ref.patient_id,
                                         p_opening_id);
  end if;
  return to_jsonb(v_ref) - 'org_id' - 'created_by' - 'deleted_at'
    || jsonb_build_object(
      'is_sensitive', v_enc.is_sensitive,
      'encounter_status', v_enc.status,
      'referrer_name', public.user_display_name(v_ref.referred_by),
      'referrer_title', public.member_title(v_ref.org_id, v_ref.referred_by),
      'counter_by_name', case when v_ref.counter_referral_by is not null
                              then public.user_display_name(v_ref.counter_referral_by) end,
      'destination_phone', (select phone from public.referral_destinations
                             where id = v_ref.destination_id),
      'destination_address', (select address from public.referral_destinations
                               where id = v_ref.destination_id),
      'return_days', public.referral_return_days(v_ref.org_id));
end;
$$;


-- =============================================================================
-- 3. Certificats
-- =============================================================================

create table public.certificate_counters (
  org_id     uuid not null references public.organizations (id),
  year       smallint not null,
  last_value integer not null default 0,
  primary key (org_id, year)
);

comment on table public.certificate_counters is
  'Dernier numéro de certificat attribué, par structure et par année. Serveur uniquement.';

-- CERT-2026-0001 : année de l'émission dans le fuseau de la structure.
create function public.next_certificate_number(p_org_id uuid, p_issued_at timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_annee smallint;
  v_n     integer;
begin
  select extract(year from p_issued_at at time zone timezone)::smallint into v_annee
    from public.organizations where id = p_org_id;
  insert into public.certificate_counters as c (org_id, year, last_value)
  values (p_org_id, v_annee, 1)
  on conflict (org_id, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_n;
  return 'CERT-' || v_annee || '-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
end;
$$;

alter table public.certificates add column number text;

-- Certificats émis avant cette migration (aucun écran ne permettait d'en émettre) :
-- numérotés dans l'ordre d'émission. Le verrou des lignes figées est levé le temps de
-- cette seule écriture.
alter table public.certificates disable trigger certificates_frozen;
alter table public.certificates disable trigger certificates_audit;
do $$
declare
  v record;
begin
  for v in select id, org_id, issued_at from public.certificates order by issued_at, id loop
    update public.certificates set number = public.next_certificate_number(v.org_id, v.issued_at)
     where id = v.id;
  end loop;
end $$;
alter table public.certificates enable trigger certificates_audit;
alter table public.certificates enable trigger certificates_frozen;

alter table public.certificates alter column number set not null;
create unique index certificates_number_unique on public.certificates (org_id, number);

create function public.certificates_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := public.next_certificate_number(new.org_id, new.issued_at);
  return new;
end;
$$;

create trigger certificates_number before insert on public.certificates
  for each row execute function public.certificates_number();

-- {naissance} : « née le 12/03/1994 », « né vers 1996 » (âge déclaré), complété à l'écran ;
-- « né(e) le {date_naissance} » se lisait mal sans date exacte. Modèles des structures
-- remplacés seulement s'ils sont encore identiques au modèle par défaut.
update public.certificate_templates t
   set body = replace(t.body, 'né(e) le {date_naissance}', '{naissance}')
  from public.certificate_template_defaults d
 where d.code = t.template_code and t.body = d.body
   and position('né(e) le {date_naissance}' in t.body) > 0;
update public.certificate_template_defaults
   set body = replace(body, 'né(e) le {date_naissance}', '{naissance}')
 where position('né(e) le {date_naissance}' in body) > 0;

-- Variables permises dans un modèle : identité du patient, structure, praticien, dates du
-- repos. Aucune variable de diagnostic, de motif ou de type de consultation ne peut exister
-- (un modèle qui en contiendrait est refusé) ; la base ne remplace rien à l'émission
-- (issue_certificate enregistre le texte relu tel quel). Fonction pure, appelée par la
-- contrainte : laissée exécutable.
create function public.certificate_body_variables_ok(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from regexp_matches(coalesce(p_body, ''), '\{([^{}]*)\}', 'g') m
     where m[1] not in ('patient', 'naissance', 'date_naissance', 'age', 'structure',
                        'praticien', 'date', 'jours', 'debut', 'fin'));
$$;

alter table public.certificate_template_defaults
  add constraint certificate_template_defaults_variables_check
  check (public.certificate_body_variables_ok(body));
alter table public.certificate_templates
  add constraint certificate_templates_variables_check
  check (public.certificate_body_variables_ok(body));

-- Un certificat (impression). Consultation sensible : lecture journalisée par ouverture.
create function public.get_certificate(p_certificate_id uuid, p_opening_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cert public.certificates;
  v_enc  public.encounters;
begin
  select * into v_cert from public.certificates where id = p_certificate_id and deleted_at is null;
  if not found or not public.encounters_can_write(v_cert.org_id) then
    raise exception 'Certificat introuvable.' using errcode = '42501';
  end if;
  select * into v_enc from public.encounters where id = v_cert.encounter_id;
  if v_enc.is_sensitive then
    perform public.log_sensitive_opening(v_cert.org_id, 'certificates', v_cert.id,
                                         v_cert.patient_id, p_opening_id);
  end if;
  return to_jsonb(v_cert) - 'org_id' - 'created_by' - 'deleted_at'
    || jsonb_build_object(
      'issuer_name', public.user_display_name(v_cert.issued_by),
      'issuer_title', public.member_title(v_cert.org_id, v_cert.issued_by));
end;
$$;


-- =============================================================================
-- 4. Prochain rendez-vous depuis la consultation
-- =============================================================================

-- Lien consultation -> rendez-vous pris depuis elle. Aucun accès direct : l'agenda lit les
-- rendez-vous comme les autres (types discrets compris), la consultation par
-- get_encounter_followups.
create table public.encounter_followups (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  encounter_id   uuid not null,
  appointment_id uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  constraint encounter_followups_appointment_unique unique (appointment_id),
  foreign key (encounter_id, org_id) references public.encounters (id, org_id),
  foreign key (appointment_id, org_id) references public.appointments (id, org_id)
);
create index encounter_followups_encounter_idx on public.encounter_followups (encounter_id);

create trigger encounter_followups_set_updated_at before update on public.encounter_followups
  for each row execute function public.set_updated_at();
create trigger encounter_followups_audit after insert or update on public.encounter_followups
  for each row execute function public.audit_trigger_redacted('encounter_id', 'appointment_id');
create trigger encounter_followups_no_delete before delete on public.encounter_followups
  for each row execute function public.no_delete();

-- Prise depuis la consultation (brouillon de son auteur, ou consultation validée) : mêmes
-- contrôles que l'agenda (check_appointment avant, puis p_confirm pour les avertissements
-- acceptés ; séance pleine refusée ; hors séance volontaire).
create function public.schedule_encounter_followup(
  p_encounter_id    uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_session_id      uuid default null,
  p_confirm         boolean default false,
  p_outside_session boolean default false)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enc public.encounters;
  v_a   public.appointments;
begin
  v_enc := public.encounter_for_document(p_encounter_id);
  if not public.org_has_feature(v_enc.org_id, 'rendez_vous') then
    raise exception 'L''agenda ne fait pas partie de votre offre.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_enc.org_id);
  if p_type_id is null or not exists (
       select 1 from public.appointment_types
        where id = p_type_id and org_id = v_enc.org_id and is_active and deleted_at is null) then
    raise exception 'Choisissez le type du rendez-vous.' using errcode = '22023';
  end if;
  if public.appointment_type_is_discreet(p_type_id)
     and not public.appointments_can_see_discreet(v_enc.org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  if p_starts_at is null then
    raise exception 'Indiquez la date et l''heure du rendez-vous.' using errcode = '22023';
  end if;

  perform set_config('fajkat.hors_seance',
    case when p_outside_session and p_session_id is null then 'on' else '' end, true);
  v_a := public.appointment_insert(v_enc.org_id, v_enc.patient_id, p_type_id, p_starts_at,
                                   p_practitioner_id, p_session_id, null,
                                   coalesce(p_confirm, false), null, null,
                                   'followup', 'consultation', null);
  perform set_config('fajkat.hors_seance', '', true);

  insert into public.encounter_followups (org_id, encounter_id, appointment_id)
  values (v_enc.org_id, v_enc.id, v_a.id);
  return public.appointment_for_viewer(v_a);
end;
$$;

-- Rendez-vous pris depuis la consultation, reports suivis jusqu'au dernier : l'ordonnance
-- imprime le prochain encore prévu (date et heure seulement).
create function public.get_encounter_followups(p_encounter_id uuid)
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
     or (v_enc.is_sensitive and not public.encounters_can_write(v_enc.org_id)) then
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


-- =============================================================================
-- 5. Correctif 14f : un passage relié à un seul rendez-vous
-- =============================================================================

-- Identique à l'étape 14f, sauf le lien au passage : seulement si ce passage n'est relié
-- à aucun autre rendez-vous et si le patient n'a qu'un rendez-vous à clore ce jour-là
-- (sinon, on ne sait pas lequel il est venu honorer : « Venu » sans lien).
create or replace function public.appointments_close_past(p_org_id uuid)
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
           count(*) over (partition by a.patient_id, a.local_date) as a_clore,
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
         visit_id = coalesce(a.visit_id,
                             case when c.nb = 1 and c.a_clore = 1
                                   and not exists (select 1 from public.appointments b
                                                    where b.visit_id = c.seul and b.id <> a.id
                                                      and b.deleted_at is null)
                                  then c.seul end),
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

-- Liens en double déjà posés par la clôture (exemple : passage déjà relié au rendez-vous
-- de 20:30 par « Arrivé », relié aussi au rendez-vous de 14:20 clos le lendemain) : retirés
-- des rendez-vous clos automatiquement. Le statut « Venu » et l'heure d'arrivée restent.
update public.appointments a
   set visit_id = null
 where a.visit_id is not null and a.auto_closed_at is not null and a.deleted_at is null
   and exists (select 1 from public.appointments b
                where b.visit_id = a.visit_id and b.id <> a.id and b.deleted_at is null);


-- =============================================================================
-- 6. Journal et droits
-- =============================================================================

-- Lignes du journal réservées à l'owner ou l'admin qui exerce. Liste de l'étape 14 (partie
-- A, seule définition jusqu'ici), entière, plus :
--   - encounter_followups : le lien consultation -> rendez-vous dit qu'une consultation a
--     eu lieu ;
--   - tables cliniques d'avant l'étape 14, journalisées sans valeur mais avec le patient,
--     le passage ou les champs modifiés : vital_signs (constantes), visit_reasons (motif
--     de venue), appointment_notes (note d'un rendez-vous), patient_medical (fiche
--     médicale de l'étape 11, dont le drapeau is_sensitive).
create or replace function public.audit_table_is_medical(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table in ('encounters', 'encounter_addenda', 'encounter_handovers', 'diagnoses',
                     'encounter_tests', 'prescriptions', 'prescription_items', 'referrals',
                     'certificates', 'medical_history', 'surveillance_alerts',
                     'encounter_followups', 'vital_signs', 'visit_reasons',
                     'appointment_notes', 'patient_medical');
$$;

revoke all on public.certificate_counters, public.encounter_followups from anon, authenticated;
alter table public.certificate_counters enable row level security;
alter table public.encounter_followups  enable row level security;
-- Aucune policy : serveur uniquement (fonctions ci-dessus).

revoke execute on function
  public.record_counter_referral(uuid, date, text, text, text, text, text),
  public.list_referrals(uuid, text, integer),
  public.get_referral(uuid, uuid),
  public.get_certificate(uuid, uuid),
  public.schedule_encounter_followup(uuid, uuid, timestamptz, uuid, uuid, boolean, boolean),
  public.get_encounter_followups(uuid)
from public, anon;

grant execute on function
  public.record_counter_referral(uuid, date, text, text, text, text, text),
  public.list_referrals(uuid, text, integer),
  public.get_referral(uuid, uuid),
  public.get_certificate(uuid, uuid),
  public.schedule_encounter_followup(uuid, uuid, timestamptz, uuid, uuid, boolean, boolean),
  public.get_encounter_followups(uuid)
to authenticated;

-- Fonctions internes : jamais appelées par le client. referral_return_days lirait les
-- réglages de n'importe quelle structure : list_referrals et get_referral rendent le délai,
-- les Paramètres le lisent dans organizations.settings.
revoke execute on function
  public.referral_return_days(uuid),
  public.member_title(uuid, uuid), public.referrals_assert_access(uuid),
  public.next_certificate_number(uuid, timestamptz), public.certificates_number()
from public, anon, authenticated;
