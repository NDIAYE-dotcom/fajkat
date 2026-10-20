-- =============================================================================
-- Étape 14, partie C : antécédents, chronologie du dossier, consultation sensible
-- -----------------------------------------------------------------------------
-- 1. Ouverture d'une consultation ou des antécédents sensibles : une ligne READ dans
--    audit_logs par ouverture, pas à chaque relecture. L'écran envoie un identifiant
--    d'ouverture (p_opening_id, tiré au hasard à l'ouverture de l'écran) : la base n'écrit
--    qu'une ligne par utilisateur, par dossier lu et par ouverture, et l'identifiant ne vaut
--    que 12 heures. Il ne sert donc qu'à la même personne, pour la même consultation (ou
--    les mêmes antécédents) : présenté pour une autre, il donne une nouvelle ligne. Sans
--    identifiant, chaque lecture est journalisée (comme avant).
-- 2. Chronologie du dossier (patient_timeline remplacée), par pages, la plus récente en
--    haut, filtrable par type :
--      - passages (file d'attente) et rendez-vous pour tous les rôles qui les lisent déjà ;
--        type discret affiché « Consultation » hors des rôles médicaux (owner qui n'exerce
--        pas compris), file au nom discret aussi ;
--      - consultations, ordonnances, références, certificats pour les rôles médicaux
--        seulement ; rien de sensible pour qui n'est pas habilité (aucune ligne, aucun
--        compteur) ; jamais de motif ; diagnostic principal pour une consultation non
--        sensible seulement.
-- 3. Types de rendez-vous discrets (PF, dépistage…) : le vrai type n'est montré qu'aux
--    soignants habilités aux données sensibles (patients_can_read_sensitive : médecin,
--    sage-femme, infirmier, owner ou admin qui exerce) ; il est masqué (« Consultation »)
--    pour tous les autres, rôles futurs compris, aide-soignant et owner ou admin qui
--    n'exercent pas compris. Pour eux, rien ne répond différemment selon qu'un rendez-vous
--    masqué est discret ou non : aucune fonction exécutable ne révèle la discrétion d'un
--    enregistrement (appointment_type_is_discreet n'est plus exécutable par authenticated,
--    les policies s'appuient sur la RLS des types) ; « Changer le type » et l'écriture
--    d'une note de rendez-vous sont réservés aux soignants habilités, pour tout rendez-vous ;
--    note, source « followup » et motif d'annulation d'un rendez-vous discret masqués ;
--    « Rappel fait » accepté de la même façon ; un rendez-vous discret masqué se reporte
--    comme une consultation (contrôles, prochaines séances et messages du type que voit
--    l'appelant ; aucune séance, aucun contrôle de places ; vrai type et durée gardés, le
--    soignant habilité le voit « hors séance »). Une seule règle,
--    appointments_can_see_discreet, redéfinie ici : agenda (list_appointments,
--    appointment_for_viewer), onglet Rendez-vous de la fiche, rappels, planning imprimé,
--    prise de rendez-vous et policy de la table appointments la suivent toutes. Les
--    paramètres de l'agenda (types et séances : « PF le mardi ») restent lisibles par owner
--    et admin, qui les configurent : ce ne sont pas des données de patients.
-- Rien d'autre ne change : antécédents (get_ / save_ / remove_medical_history_item) et
-- sensibilité automatique (type, diagnostic ou examen rapide sensible, encounter_draft_
-- sensitive) existent depuis la partie A.
-- =============================================================================


-- =============================================================================
-- 1. Ouverture journalisée une seule fois
-- =============================================================================

create function public.log_sensitive_opening(
  p_org_id uuid, p_table text, p_record_id uuid, p_patient_id uuid, p_opening_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_opening_id is not null then
    -- Deux lectures simultanées de la même ouverture : une seule ligne.
    perform pg_advisory_xact_lock(hashtextextended(p_opening_id::text || p_record_id::text, 0));
    -- Déjà journalisée : même utilisateur, même table, même dossier, même ouverture, il y a
    -- moins de 12 heures. Sinon (autre dossier, autre personne, identifiant trop ancien) :
    -- nouvelle ligne.
    if exists (select 1 from public.audit_logs l
                where l.table_name = p_table and l.record_id = p_record_id::text
                  and l.action = 'READ' and l.user_id = auth.uid()
                  and l.new_data ->> 'opening_id' = p_opening_id::text
                  and l.created_at > now() - interval '12 hours') then
      return;
    end if;
  end if;
  insert into public.audit_logs (org_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, auth.uid(), 'READ', p_table, p_record_id::text, null,
          jsonb_build_object('patient_id', p_patient_id)
          || case when p_opening_id is not null
                  then jsonb_build_object('opening_id', p_opening_id) else '{}'::jsonb end);
end;
$$;

-- Recherche « déjà journalisée » de log_sensitive_opening, à chaque lecture sensible.
create index audit_logs_openings_idx
  on public.audit_logs (table_name, record_id, user_id, created_at)
  where action = 'READ';

-- Consultation : même contenu qu'avant (partie A), sauf la journalisation et le message
-- d'une consultation sensible refusée.
drop function public.get_encounter(uuid);
create function public.get_encounter(p_encounter_id uuid, p_opening_id uuid default null)
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
  -- Consultation sensible et utilisateur non habilité : même réponse qu'une consultation
  -- inexistante, rien ne révèle qu'elle existe.
  if v_enc.is_sensitive and not public.encounters_can_write(v_enc.org_id) then
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

-- Antécédents : mêmes règles qu'avant (partie A) ; lecture d'antécédents sensibles
-- journalisée une fois par ouverture. Pour le front : is_sensitive seulement chez les
-- habilités (les autres ne reçoivent aucune ligne sensible).
drop function public.get_medical_history(uuid);
create function public.get_medical_history(p_patient_id uuid, p_opening_id uuid default null)
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
    perform public.log_sensitive_opening(v_org, 'medical_history', p_patient_id, p_patient_id,
                                         p_opening_id);
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


-- =============================================================================
-- 2. Chronologie du dossier
-- =============================================================================

-- p_kinds : 'visit', 'appointment', 'encounter', 'prescription', 'referral', 'certificate'
-- (null : tout ce que le rôle peut voir). Page suivante : p_before_at / p_before_id de la
-- dernière ligne reçue. p_limit : 1 à 50.
drop function public.patient_timeline(uuid, text[]);
create function public.patient_timeline(
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
           v.status, false, null::text
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


-- =============================================================================
-- 3. Types de rendez-vous discrets : vrai type pour les seuls rôles médicaux
-- =============================================================================

-- Avant (étape 13, partie C) : soignants (aide-soignant compris), et owner et admin même
-- sans exercer.
create or replace function public.appointments_can_see_discreet(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.appointments_can_medical(p_org_id)
     and public.patients_can_read_sensitive(p_org_id);
$$;

-- Rendez-vous et séances d'un type discret : les policies lisent la table des types,
-- elle-même filtrée par RLS (un type discret n'y est visible que pour qui le voit, ou pour
-- owner et admin qui paramètrent). Aucune fonction exécutable par le client ne dit si un
-- type ou un rendez-vous est discret.
drop policy appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (public.appointments_can_see_discreet(org_id)
              or exists (select 1 from public.appointment_types t
                          where t.id = appointments.appointment_type_id and not t.is_discreet)));

-- Note : lisible si le rendez-vous l'est (la RLS de appointments cache les discrets).
drop policy appointment_notes_select on public.appointment_notes;
create policy appointment_notes_select on public.appointment_notes
  for select to authenticated
  using (public.appointments_can_medical(org_id)
         and exists (select 1 from public.appointments a
                      where a.id = appointment_notes.appointment_id));

-- Écriture, modification ou retrait d'une note : soignants habilités seulement, pour tout
-- rendez-vous. Seule exception : la recopie de la note au report d'un rendez-vous (même
-- texte que le rendez-vous reporté), faite par la base pour qui reporte. (Aujourd'hui, le
-- client n'a que SELECT sur la table et aucune fonction ne modifie une note : ce verrou
-- vaut pour toute fonction à venir.)
create function public.appointment_notes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.appointments_can_see_discreet(coalesce(new.org_id, old.org_id)) then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.appointments a
                                    join public.appointment_notes o
                                      on o.appointment_id = a.rescheduled_from_id
                                     and o.deleted_at is null
                                   where a.id = new.appointment_id and o.note = new.note) then
    return new;
  end if;
  raise exception 'Seuls les soignants habilités écrivent une note de rendez-vous.'
    using errcode = '42501';
end;
$$;

create trigger appointment_notes_guard before insert or update or delete on public.appointment_notes
  for each row execute function public.appointment_notes_guard();

-- Changement de type : par « Changer le type » seulement, réservé aux soignants habilités
-- pour tout rendez-vous (avant : tout rôle médical, aide-soignant compris).
create or replace function public.appointments_type_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_type_id is distinct from old.appointment_type_id
     and (coalesce(current_setting('fajkat.changement_type_rdv', true), '') <> new.id::text
          or not public.appointments_can_see_discreet(new.org_id)) then
    raise exception 'Le type d''un rendez-vous ne change que par « Changer le type », réservé aux soignants habilités.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Report d'un rendez-vous discret masqué (identiques à l'étape 13, parties C, D et D
-- correctif, sauf ce mode). Deux variables de transaction, posées par check_appointment et
-- appointment_reschedule_one (report simple ou de tout un jour férié), lues par
-- appointment_issues :
--   fajkat.rdv_masque = 'on'  : rendez-vous masqué, toujours sans séance ni contrôle de
--                               places de son vrai type ;
--   fajkat.rdv_type_vu = id   : type que voit l'appelant (« Consultation »), utilisé pour
--                               les contrôles s'il existe ; sans lui (type supprimé ou
--                               désactivé), contrôles communs seulement (passé, praticien,
--                               congé, férié, fermeture, horaires, pause, chevauchement,
--                               double rendez-vous).
-- next_available_sessions propose les séances du type vu, ou aucune sans type vu.
create or replace function public.appointment_issues_base(
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

  -- Séance : celle choisie, ou celle du type qui couvre l'heure ce jour-là. Aucune pour un
  -- rendez-vous masqué sans type vu (fajkat.sans_seance, posée par appointment_issues).
  if coalesce(current_setting('fajkat.sans_seance', true), '') = 'on' then
    v_session := null;
  elsif p_session_id is not null then
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
    select to_char(a.starts_at at time zone v_tz, 'HH24:MI') || ', '
           || public.appointment_type_label_for_viewer(a.appointment_type_id) into v_libelle
      from public.appointments a
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


-- Type vu, pour les contrôles d'un rendez-vous masqué : le type neutre que voit
-- l'appelant (« Consultation »), s'il est actif et non supprimé ; sinon null.
create function public.appointment_type_seen_for_checks(p_type_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.appointment_types t
   where t.id = public.appointment_type_id_for_viewer(p_type_id)
     and t.is_active and t.deleted_at is null;
$$;

create or replace function public.appointment_issues(
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
  v_r      jsonb;
  -- Rendez-vous discret masqué, reporté par qui ne voit pas son vrai type : jamais de
  -- séance ni de contrôle de places de son vrai type ; durée du vrai type.
  v_masque boolean := coalesce(current_setting('fajkat.rdv_masque', true), '') = 'on';
  v_vu     uuid := public.try_uuid(current_setting('fajkat.rdv_type_vu', true));
begin
  if not v_masque then
    v_r := public.appointment_issues_base(p_org_id, p_type_id, p_patient_id, p_starts_at,
                                          p_practitioner_id, p_session_id, p_exclude_id);
    return public.appointment_issues_hors_seance(v_r, p_session_id, p_exclude_id);
  end if;
  if v_vu is not null then
    -- Contrôles d'une consultation (type vu), séance de consultation comprise ; la séance
    -- trouvée n'est jamais rattachée.
    v_r := public.appointment_issues_base(p_org_id, v_vu, p_patient_id, p_starts_at,
                                          p_practitioner_id, p_session_id, p_exclude_id);
    v_r := public.appointment_issues_hors_seance(v_r, p_session_id, p_exclude_id);
  else
    -- Pas de type vu : contrôles communs seulement, aucune séance cherchée.
    perform set_config('fajkat.sans_seance', 'on', true);
    v_r := public.appointment_issues_base(p_org_id, p_type_id, p_patient_id, p_starts_at,
                                          p_practitioner_id, null, p_exclude_id);
    perform set_config('fajkat.sans_seance', '', true);
  end if;
  return v_r || jsonb_build_object('session_id', null,
    'ends_at', p_starts_at + make_interval(mins => (select t.duration_minutes
                                                     from public.appointment_types t
                                                    where t.id = p_type_id)));
end;
$$;

-- Hors séance volontaire (fajkat.hors_seance, étape 13 D) : aucune séance rattachée ;
-- séance pleine signalée, à confirmer. Extrait tel quel de appointment_issues.
create function public.appointment_issues_hors_seance(
  p_r jsonb, p_session_id uuid, p_exclude_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r       jsonb := p_r;
  v_session public.appointment_sessions;
  v_pris    integer;
begin
  if p_session_id is not null or coalesce(current_setting('fajkat.hors_seance', true), '') <> 'on'
     or v_r ->> 'session_id' is null then
    return v_r;
  end if;

  -- Hors séance volontaire : aucune séance rattachée ; séance pleine signalée, à confirmer.
  select * into v_session from public.appointment_sessions where id = (v_r ->> 'session_id')::uuid;
  v_r := v_r || jsonb_build_object('session_id', null,
    'blocking', coalesce((select jsonb_agg(b) from jsonb_array_elements(v_r -> 'blocking') b
                           where b ->> 'code' <> 'full'), '[]'::jsonb));
  if v_session.capacity is not null then
    select count(*) into v_pris from public.appointments a
     where a.session_id = v_session.id and a.local_date = (v_r ->> 'local_date')::date
       and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
       and a.id is distinct from p_exclude_id;
    if v_pris >= v_session.capacity then
      v_r := jsonb_set(v_r, '{warnings}', jsonb_build_array(jsonb_build_object(
        'code', 'outside_full',
        'message', 'La séance de ' || to_char(v_session.start_time, 'HH24:MI')
                   || ' est pleine : prendre quand même ce patient hors séance ?'))
        || (v_r -> 'warnings'));
    end if;
  end if;
  return v_r;
end;
$$;


create or replace function public.check_appointment(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_type_id         uuid,
  p_starts_at       timestamptz,
  p_practitioner_id uuid default null,
  p_session_id      uuid default null,
  p_count           integer default 1,
  p_interval_months integer default null,
  p_exclude_id      uuid default null,
  p_outside_session boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resultat jsonb := '[]'::jsonb;
  v_d        record;
  v_type     uuid := p_type_id;
  v_patient  uuid := p_patient_id;
  v_session  uuid := p_session_id;
  v_masque   boolean := false;
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_exclude_id is not null then
    select a.appointment_type_id, a.patient_id into v_type, v_patient
      from public.appointments a
     where a.id = p_exclude_id and a.org_id = p_org_id and a.deleted_at is null;
    if not found then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    -- Rendez-vous discret masqué : contrôlé comme une consultation (type qu'il voit), ou
    -- par les contrôles communs sans type vu ; jamais de séance (appointment_issues).
    if public.appointment_type_is_discreet(v_type)
       and not public.appointments_can_see_discreet(p_org_id) then
      v_masque := true;
      perform set_config('fajkat.rdv_masque', 'on', true);
      perform set_config('fajkat.rdv_type_vu',
        coalesce(public.appointment_type_seen_for_checks(v_type)::text, ''), true);
    end if;
  elsif public.appointment_type_is_discreet(p_type_id)
        and not public.appointments_can_see_discreet(p_org_id) then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 24 then
    raise exception 'Une série compte de 1 à 24 rendez-vous.' using errcode = '22023';
  end if;
  if p_count > 1 and coalesce(p_interval_months, 0) not between 1 and 24 then
    raise exception 'Indiquez l''intervalle entre les rendez-vous (1 à 24 mois).' using errcode = '22023';
  end if;
  -- Hors séance volontaire : comme pour une consultation, rendez-vous masqué compris.
  perform set_config('fajkat.hors_seance', case when p_outside_session then 'on' else '' end, true);
  for v_d in select * from public.appointment_series_dates(p_org_id, p_starts_at, p_count,
                                                           p_interval_months) loop
    v_resultat := v_resultat || jsonb_build_array(
      jsonb_build_object('series_index', v_d.series_index)
      || public.appointment_issues(p_org_id, v_type, v_patient, v_d.starts_at,
                                   p_practitioner_id,
                                   case when v_d.series_index = 1 then v_session end,
                                   p_exclude_id));
  end loop;
  perform set_config('fajkat.hors_seance', '', true);
  perform set_config('fajkat.rdv_masque', '', true);
  perform set_config('fajkat.rdv_type_vu', '', true);
  return v_resultat;
end;
$$;


create or replace function public.appointment_reschedule_one(
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

  -- Rendez-vous discret masqué : reporté comme une consultation (contrôles du type que voit
  -- l'appelant, aucune séance, aucun contrôle de places) ; vrai type et durée gardés, le
  -- soignant habilité le voit ensuite « hors séance ».
  if public.appointment_type_is_discreet(v_a.appointment_type_id)
     and not public.appointments_can_see_discreet(v_a.org_id) then
    perform set_config('fajkat.rdv_masque', 'on', true);
    perform set_config('fajkat.rdv_type_vu',
      coalesce(public.appointment_type_seen_for_checks(v_a.appointment_type_id)::text, ''), true);
  end if;
  v_neuf := public.appointment_insert(
    v_a.org_id, v_a.patient_id, v_a.appointment_type_id, p_starts_at,
    case when p_keep_practitioner then v_a.practitioner_membership_id else p_practitioner_id end,
    p_session_id, v_note, p_confirm, v_a.series_id, v_a.series_index, 'reschedule',
    v_a.source_ref, v_a.id, v_a.id);
  perform set_config('fajkat.rdv_masque', '', true);
  perform set_config('fajkat.rdv_type_vu', '', true);

  update public.appointments
     set status = 'rescheduled', status_changed_at = now(), rescheduled_to_id = v_neuf.id
   where id = v_a.id;
  return v_neuf;
end;
$$;


create or replace function public.next_available_sessions(
  p_org_id          uuid,
  p_type_id         uuid default null,
  p_appointment_id  uuid default null,
  p_from            date default null,
  p_practitioner_id uuid default null,
  p_limit           integer default 3)
returns table (
  local_date  date,
  starts_at   timestamptz,
  start_time  time,
  end_time    time,
  places_left integer,
  session_id  uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type      uuid;
  v_praticien uuid := p_practitioner_id;
  v_exclure   uuid;
  v_masque    boolean;
  v_tz        text;
  v_settings  jsonb;
  v_auj       date;
  v_maintenant time;
  v_jour      date;
  v_dow       integer;
  v_s         record;
  v_pris      integer;
  v_trouves   integer := 0;
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Demandez de 1 à 10 séances.' using errcode = '22023';
  end if;

  if p_appointment_id is not null then
    select a.appointment_type_id, coalesce(p_practitioner_id, a.practitioner_membership_id)
      into v_type, v_praticien
      from public.appointments a
     where a.id = p_appointment_id and a.org_id = p_org_id and a.deleted_at is null;
    if not found then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    v_exclure := p_appointment_id;
  else
    select t.id into v_type from public.appointment_types t
     where t.id = p_type_id and t.org_id = p_org_id and t.is_active and t.deleted_at is null;
    if v_type is null then
      raise exception 'Choisissez un type de rendez-vous.' using errcode = '22023';
    end if;
  end if;
  v_masque := public.appointment_type_is_discreet(v_type)
              and not public.appointments_can_see_discreet(p_org_id);
  if v_masque and p_appointment_id is null then
    raise exception 'Ce type de rendez-vous est réservé aux soignants.' using errcode = '42501';
  end if;
  -- Rendez-vous discret masqué : les séances du type que voit l'appelant (« Consultation »),
  -- comme pour une consultation ordinaire ; sans type vu, aucune séance. Jamais rien de sa
  -- vraie séance.
  if v_masque then
    v_type := public.appointment_type_seen_for_checks(v_type);
    v_masque := false;
    if v_type is null then
      return;
    end if;
  end if;

  select o.timezone, o.settings into v_tz, v_settings from public.organizations o
   where o.id = p_org_id;
  v_auj := public.org_local_date(p_org_id);
  v_maintenant := (now() at time zone v_tz)::time;
  v_jour := greatest(coalesce(p_from, v_auj), v_auj);

  while v_jour <= v_auj + 120 and v_trouves < p_limit loop
    v_dow := extract(isodow from v_jour)::integer;
    if not exists (select 1 from public.holidays h
                    where h.org_id = p_org_id and h.holiday_date = v_jour and h.deleted_at is null)
       and coalesce(v_settings -> 'opening_hours' -> public.weekday_key(v_dow) ->> 'statut', '')
           <> 'ferme' then
      for v_s in
        select s.id, s.start_time, s.end_time, s.capacity, s.practitioner_membership_id
          from public.appointment_sessions s
         where s.org_id = p_org_id and s.appointment_type_id = v_type and s.weekday = v_dow
           and s.is_active and s.deleted_at is null
           and (s.practitioner_membership_id is null or v_praticien is null
                or s.practitioner_membership_id = v_praticien)
           and (v_jour > v_auj or s.end_time > v_maintenant)
         order by s.start_time
      loop
        continue when exists (
          select 1 from public.leave_requests l
           where l.membership_id = coalesce(v_s.practitioner_membership_id, v_praticien)
             and l.status = 'approved' and l.deleted_at is null
             and v_jour between l.start_date and l.end_date);
        v_pris := null;
        if v_s.capacity is not null then
          select count(*) into v_pris from public.appointments a
           where a.session_id = v_s.id and a.local_date = v_jour
             and a.status in ('scheduled', 'confirmed', 'arrived') and a.deleted_at is null
             and a.id is distinct from v_exclure;
          continue when v_pris >= v_s.capacity;
        end if;
        local_date  := v_jour;
        starts_at   := (v_jour + v_s.start_time) at time zone v_tz;
        start_time  := v_s.start_time;
        end_time    := case when v_masque then null else v_s.end_time end;
        places_left := v_s.capacity - v_pris;
        session_id  := case when v_masque then null else v_s.id end;
        return next;
        v_trouves := v_trouves + 1;
        exit when v_trouves >= p_limit;
      end loop;
    end if;
    v_jour := v_jour + 1;
  end loop;
end;
$$;


-- Identique à l'étape 13 (partie D), sauf le droit vérifié en premier.
create or replace function public.set_appointment_type(
  p_appointment_id uuid, p_type_id uuid, p_confirm boolean default false)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a      public.appointments;
  v_type   public.appointment_types;
  v_tz     text;
  v_issues jsonb;
begin
  select * into v_a from public.appointments
   where id = p_appointment_id and deleted_at is null
   for update;
  if not found or not public.appointments_can_read(v_a.org_id) then
    raise exception 'Rendez-vous introuvable.' using errcode = '42501';
  end if;
  perform public.appointments_assert_write(v_a.org_id);
  -- Réservé aux soignants habilités, quel que soit le rendez-vous : rien ne répond
  -- différemment pour un rendez-vous discret masqué.
  if not public.appointments_can_see_discreet(v_a.org_id) then
    raise exception 'Seuls les soignants habilités changent le type d''un rendez-vous.'
      using errcode = '42501';
  end if;
  if v_a.status not in ('scheduled', 'confirmed') then
    raise exception 'Seul un rendez-vous prévu ou confirmé change de type.' using errcode = '22023';
  end if;

  select * into v_type from public.appointment_types
   where id = p_type_id and org_id = v_a.org_id and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez un type de rendez-vous.' using errcode = '22023';
  end if;
  if v_type.id = v_a.appointment_type_id then
    return v_a;
  end if;

  -- Séances du nouveau type ce jour-là verrouillées, comme pour une prise.
  select timezone into v_tz from public.organizations where id = v_a.org_id;
  perform 1 from public.appointment_sessions
   where org_id = v_a.org_id and appointment_type_id = v_type.id
     and weekday = extract(isodow from (v_a.starts_at at time zone v_tz))::integer
   for update;

  v_issues := public.appointment_issues(v_a.org_id, v_type.id, v_a.patient_id, v_a.starts_at,
                                        v_a.practitioner_membership_id, null, v_a.id);
  if jsonb_array_length(v_issues -> 'blocking') > 0 then
    raise exception '%', v_issues -> 'blocking' -> 0 ->> 'message' using errcode = '22023';
  end if;
  if jsonb_array_length(v_issues -> 'warnings') > 0 and not coalesce(p_confirm, false) then
    raise exception '%', 'À confirmer : '
      || (select string_agg(w ->> 'message', ' ') from jsonb_array_elements(v_issues -> 'warnings') w)
      using errcode = '22023', hint = 'confirmation_required';
  end if;

  perform set_config('fajkat.changement_type_rdv', v_a.id::text, true);
  update public.appointments
     set appointment_type_id = v_type.id,
         session_id = (v_issues ->> 'session_id')::uuid,
         ends_at = (v_issues ->> 'ends_at')::timestamptz,
         holiday_confirmed = holiday_confirmed or v_issues -> 'warnings' @> '[{"code": "holiday"}]'
   where id = v_a.id
  returning * into v_a;
  perform set_config('fajkat.changement_type_rdv', '', true);
  return v_a;
end;
$$;


-- « Rappel fait » : identique à l'étape 13 (partie E), sauf pour qui ne voit pas le vrai
-- type : un rendez-vous discret absent de sa liste (téléphone d'un proche) est accepté
-- comme les autres, au lieu d'un refus qui révélerait sa discrétion.
create or replace function public.set_appointment_reminder(p_appointment_ids uuid[], p_done boolean)
returns table (appointment_id uuid, reminder_done_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_id uuid;
begin
  if coalesce(cardinality(p_appointment_ids), 0) = 0 or cardinality(p_appointment_ids) > 50 then
    raise exception 'Choisissez de 1 à 50 rendez-vous.' using errcode = '22023';
  end if;
  foreach v_id in array p_appointment_ids loop
    select * into v_a from public.appointments
     where id = v_id and deleted_at is null
     for update;
    if not found or not public.appointments_can_read(v_a.org_id)
       or (public.appointments_can_see_discreet(v_a.org_id)
           and not public.appointment_reminder_allowed(v_a.id)) then
      raise exception 'Rendez-vous introuvable.' using errcode = '42501';
    end if;
    perform public.appointments_assert_write(v_a.org_id);
    if v_a.status not in ('scheduled', 'confirmed')
       or v_a.local_date < public.org_local_date(v_a.org_id) then
      raise exception 'Ce rendez-vous n''est plus à rappeler (passé, arrivé, annulé ou reporté).'
        using errcode = '22023';
    end if;
    update public.appointments a
       set reminder_done_at = case when coalesce(p_done, false) then now() end,
           reminder_done_by = case when coalesce(p_done, false) then auth.uid() end
     where a.id = v_id;
    appointment_id := v_id;
    reminder_done_at := case when coalesce(p_done, false) then now() end;
    return next;
  end loop;
end;
$$;

-- Agenda et onglet Rendez-vous : identiques à l'étape 13 (partie E), sauf la note d'un
-- rendez-vous discret, rendue seulement à qui en voit le vrai type.
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
  note                       text)
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
           case when v_medical and (not t.is_discreet or v_discret) then n.note end
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
  note                text)
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
           case when v_medical and (not t.is_discreet or v_discret) then n.note end
      from public.appointments a
      join public.appointment_types t on t.id = a.appointment_type_id
      left join public.visits v on v.id = a.visit_id
      left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
     where a.patient_id = p_patient_id and a.org_id = v_org and a.deleted_at is null
     order by a.starts_at desc;
end;
$$;


-- Paramètres de l'agenda : owner et admin voient tous les types et toutes les séances pour
-- les configurer ; les autres rôles non médicaux ne voient pas les types discrets.
drop policy appointment_types_select on public.appointment_types;
create policy appointment_types_select on public.appointment_types
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (not is_discreet or public.appointments_can_see_discreet(org_id)
              or public.appointments_can_manage(org_id)));

drop policy appointment_sessions_select on public.appointment_sessions;
create policy appointment_sessions_select on public.appointment_sessions
  for select to authenticated
  using (public.appointments_can_read(org_id)
         and (public.appointments_can_see_discreet(org_id)
              or public.appointments_can_manage(org_id)
              or exists (select 1 from public.appointment_types t
                          where t.id = appointment_sessions.appointment_type_id
                            and not t.is_discreet)));

-- Droits pour le front : « discreet » dit si l'utilisateur voit le vrai type d'un
-- rendez-vous (l'agenda et la prise de rendez-vous écartent sinon les types discrets).
create or replace function public.appointment_permissions(p_org_id uuid)
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
    'discreet',           public.appointments_can_see_discreet(p_org_id),
    'multi_practitioner', public.org_has_feature(p_org_id, 'agenda_multi_praticiens'),
    'queue',              public.org_has_feature(p_org_id, 'file_attente')
                          and public.queue_can_write(p_org_id));
$$;


-- =============================================================================
-- 4. Droits d'exécution
-- =============================================================================

revoke execute on function
  public.get_encounter(uuid, uuid), public.get_medical_history(uuid, uuid),
  public.patient_timeline(uuid, text[], timestamptz, uuid, integer)
from public, anon;

grant execute on function
  public.get_encounter(uuid, uuid), public.get_medical_history(uuid, uuid),
  public.patient_timeline(uuid, text[], timestamptz, uuid, integer)
to authenticated;

-- Fonction interne : jamais appelée par le client.
revoke execute on function public.log_sensitive_opening(uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Plus aucune policy ne l'appelle : seulement à l'intérieur des fonctions security
-- definer (qui s'exécutent sous leur propriétaire). Le client ne peut plus demander si un
-- type est discret.
revoke execute on function public.appointment_type_is_discreet(uuid) from public, anon, authenticated;
revoke execute on function public.appointment_notes_guard() from public, anon, authenticated;
revoke execute on function public.appointment_issues_hors_seance(jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.appointment_type_seen_for_checks(uuid)
  from public, anon, authenticated;
