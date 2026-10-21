-- =============================================================================
-- Tests — étape 13, correctif H : vitesse des listes de rendez-vous
-- -----------------------------------------------------------------------------
-- Vérifie : list_appointments, list_patient_appointments et appointments_to_remind rendent
-- exactement les mêmes lignes qu'avant le correctif (copie des anciennes versions ci-dessous)
-- pour la sage-femme, l'aide-soignant, l'accueil, le caissier et l'owner qui n'exerce pas :
-- types discrets masqués de la même façon (libellé, type, séance, série, origine, motif,
-- note) ; droits calculés une seule fois par appel ; appointment_types_seen fermée au client.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13h.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a13a-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13h-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13a-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 13H', 'poste_sante', 'SN', 'Kolda')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0b sage-femme, 0c aide-soignant, 0d accueil, 0e caissier.
insert into public.memberships (org_id, user_id, role, is_active, is_clinician)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a13a-0000000000' || c)::uuid, r, true, false
  from (values ('0b', 'sage_femme'), ('0c', 'aide_soignant'), ('0d', 'accueil'),
               ('0e', 'caissier')) v(c, r);

-- Types discrets de plus : dans une file au nom qui trahit, et sans file.
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_q   uuid;
begin
  insert into public.queue_services (org_id, letter, label)
  values (v_org, 'Y', 'Planification familiale') returning id into v_q;
  insert into public.appointment_types (org_id, label, duration_minutes, is_discreet, queue_service_id, sort_order)
  values (v_org, 'Dépistage IST', 15, true, v_q, 90),
         (v_org, 'Suivi psychologique', 30, true, null, 91);
end $$;

-- 80 rendez-vous sur la semaine et demain, tous les types, notes, séries, motifs
-- d'annulation, origine « followup », praticien. Insérés en direct (données de test).
set session_replication_role = replica;
do $$
declare
  v_org   uuid := current_setting('test.org')::uuid;
  v_auj   date := public.org_local_date(current_setting('test.org')::uuid);
  v_types uuid[] := (select array_agg(id order by sort_order) from public.appointment_types
                      where org_id = current_setting('test.org')::uuid);
  v_pr    uuid := (select id from public.memberships where org_id = current_setting('test.org')::uuid
                     and user_id = '00000000-0000-4000-a13a-00000000000b');
  v_p     uuid;
  v_a     uuid;
  v_un    uuid;
  v_debut timestamptz;
  i       integer;
begin
  for i in 1..80 loop
    insert into public.patients (org_id, file_number, last_name, first_name, sex, declared_age, birth_year)
    values (v_org, 'H-' || i, 'AGENDA', 'Patient ' || i, 'F', 30, 1996) returning id into v_p;
    if i = 1 then v_un := v_p; end if;
    v_debut := ((v_auj + (i % 7)) + time '08:00' + (i % 30) * interval '10 minutes')
               at time zone 'Africa/Dakar';
    insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                     local_date, status, cancelled_at, cancel_reason, series_id,
                                     series_index, source, source_ref, practitioner_membership_id)
    values (v_org, case when i % 10 = 0 then v_un else v_p end,
            v_types[1 + i % cardinality(v_types)], v_debut, v_debut + interval '15 minutes',
            v_auj + (i % 7),
            case when i % 9 = 0 then 'cancelled' else 'scheduled' end,
            case when i % 9 = 0 then now() end,
            case when i % 9 = 0 then 'Empêchement' end,
            case when i % 4 = 0 then gen_random_uuid() end,
            case when i % 4 = 0 then 1 end,
            case when i % 3 = 0 then 'followup' else 'agenda' end,
            case when i % 3 = 0 then 'consultation' end,
            case when i % 6 = 0 then v_pr end)
    returning id into v_a;
    if i % 2 = 0 then
      insert into public.appointment_notes (org_id, appointment_id, note) values (v_org, v_a, 'Note ' || i);
    end if;
  end loop;
  perform set_config('test.patient', v_un::text, true);
end $$;
set session_replication_role = origin;

-- -----------------------------------------------------------------------------
-- Anciennes versions (avant le correctif), recopiées pour comparer.
-- -----------------------------------------------------------------------------
-- appointment_type_label_for_viewer de l'étape 13 E ; appointment_type_id_for_viewer de 13 C.
create function pg_temp.ancien_libelle(p_type_id uuid) returns text
language sql stable set search_path = '' as $$
  select case
           when not t.is_discreet or public.appointments_can_see_discreet(t.org_id) then t.label
           else 'Consultation'
         end
    from public.appointment_types t
   where t.id = p_type_id;
$$;

create function pg_temp.ancien_type(p_type_id uuid) returns uuid
language sql stable set search_path = '' as $$
  select case
           when not t.is_discreet or public.appointments_can_see_discreet(t.org_id) then t.id
           else (select v.id from public.appointment_types v
                  where v.org_id = t.org_id and not v.is_discreet and v.deleted_at is null
                    and v.label = pg_temp.ancien_libelle(t.id)
                  order by v.is_active desc, v.sort_order
                  limit 1)
         end
    from public.appointment_types t
   where t.id = p_type_id;
$$;

create function pg_temp.ancien_agenda(p_org_id uuid, p_from date, p_to date)
returns setof record language sql stable as $$
  select a.id, a.patient_id, p.last_name, p.first_name, p.sex, p.birth_date,
         p.birth_date_estimated, p.birth_year, p.file_number, p.phone,
         a.starts_at, a.ends_at, a.local_date, a.status,
         pg_temp.ancien_type(a.appointment_type_id),
         pg_temp.ancien_libelle(a.appointment_type_id),
         t.is_discreet and public.appointments_can_see_discreet(p_org_id), a.practitioner_membership_id,
         case when a.practitioner_membership_id is not null
              then public.membership_display_name(a.practitioner_membership_id) end,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) then null else a.session_id end,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) then null else a.series_id end,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) then null else a.series_index end,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) and a.source = 'followup' then 'agenda'
              else a.source end,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) then null else a.source_ref end,
         a.holiday_confirmed, a.visit_id, v.ticket_number,
         case when t.is_discreet and not public.appointments_can_see_discreet(p_org_id) then null else a.cancel_reason end,
         case when public.appointments_can_medical(p_org_id)
                   and (not t.is_discreet or public.appointments_can_see_discreet(p_org_id)) then n.note end,
         a.closed_automatically
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    join public.appointment_types t on t.id = a.appointment_type_id
    left join public.visits v on v.id = a.visit_id
    left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
   where a.org_id = p_org_id and a.deleted_at is null
     and a.local_date between p_from and p_to;
$$;

create function pg_temp.ancien_patient(p_patient_id uuid)
returns setof record language sql stable as $$
  select a.id, a.starts_at, a.ends_at, a.local_date, a.status,
         pg_temp.ancien_type(a.appointment_type_id),
         pg_temp.ancien_libelle(a.appointment_type_id),
         t.is_discreet and public.appointments_can_see_discreet(a.org_id),
         case when a.practitioner_membership_id is not null
              then public.membership_display_name(a.practitioner_membership_id) end,
         case when t.is_discreet and not public.appointments_can_see_discreet(a.org_id) then null else a.series_id end,
         case when t.is_discreet and not public.appointments_can_see_discreet(a.org_id) then null else a.series_index end,
         case when t.is_discreet and not public.appointments_can_see_discreet(a.org_id) and a.source = 'followup' then 'agenda'
              else a.source end,
         v.ticket_number,
         case when t.is_discreet and not public.appointments_can_see_discreet(a.org_id) then null else a.cancel_reason end,
         case when public.appointments_can_medical(a.org_id)
                   and (not t.is_discreet or public.appointments_can_see_discreet(a.org_id)) then n.note end,
         a.closed_automatically
    from public.appointments a
    join public.appointment_types t on t.id = a.appointment_type_id
    left join public.visits v on v.id = a.visit_id
    left join public.appointment_notes n on n.appointment_id = a.id and n.deleted_at is null
   where a.patient_id = p_patient_id and a.deleted_at is null;
$$;

create function pg_temp.ancien_rappels(p_org_id uuid, p_date date)
returns setof record language sql stable as $$
  select a.id, a.patient_id, p.last_name, p.first_name, p.sex::text, p.file_number, p.phone,
         p.phone_owner, p.whatsapp_consent, p.preferred_language, a.starts_at, a.status,
         pg_temp.ancien_libelle(a.appointment_type_id),
         t.is_discreet and public.appointments_can_see_discreet(p_org_id),
         public.appointment_patient_label(a.id),
         case when a.practitioner_membership_id is not null
              then public.membership_display_name(a.practitioner_membership_id) end,
         a.reminder_sent_at, a.reminder_done_at,
         case when a.reminder_done_by is not null
              then coalesce((select nullif(btrim(pr.full_name), '') from public.profiles pr
                              where pr.id = a.reminder_done_by), 'Membre sans nom') end
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    join public.appointment_types t on t.id = a.appointment_type_id
   where a.org_id = p_org_id and a.deleted_at is null
     and a.status in ('scheduled', 'confirmed')
     and a.local_date = p_date
     and public.appointment_reminder_allowed(a.id);
$$;

-- -----------------------------------------------------------------------------
-- 1. Mêmes lignes, rôle par rôle
-- -----------------------------------------------------------------------------
do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_pat  uuid := current_setting('test.patient')::uuid;
  v_auj  date := public.org_local_date(current_setting('test.org')::uuid);
  v_c    text;
  v_n    integer;
  v_diff integer;
  v_masques integer;
begin
  foreach v_c in array array['0b', '0c', '0d', '0e', '0a'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-a13a-0000000000' || v_c, 'role', 'authenticated')::text, true);

    select count(*) into v_n from public.list_appointments(v_org, v_auj, v_auj + 6);
    select count(*) into v_diff from (
      (select * from public.list_appointments(v_org, v_auj, v_auj + 6)
       except all
       select * from pg_temp.ancien_agenda(v_org, v_auj, v_auj + 6) as x(
         id uuid, patient_id uuid, patient_last_name text, patient_first_name text, patient_sex text,
         birth_date date, birth_date_estimated boolean, birth_year smallint, file_number text,
         phone text, starts_at timestamptz, ends_at timestamptz, local_date date, status text,
         appointment_type_id uuid, type_label text, is_discreet boolean,
         practitioner_membership_id uuid, practitioner_name text, session_id uuid, series_id uuid,
         series_index smallint, source text, source_ref text, holiday_confirmed boolean,
         visit_id uuid, ticket_number text, cancel_reason text, note text,
         closed_automatically boolean))
      union all
      (select * from pg_temp.ancien_agenda(v_org, v_auj, v_auj + 6) as x(
         id uuid, patient_id uuid, patient_last_name text, patient_first_name text, patient_sex text,
         birth_date date, birth_date_estimated boolean, birth_year smallint, file_number text,
         phone text, starts_at timestamptz, ends_at timestamptz, local_date date, status text,
         appointment_type_id uuid, type_label text, is_discreet boolean,
         practitioner_membership_id uuid, practitioner_name text, session_id uuid, series_id uuid,
         series_index smallint, source text, source_ref text, holiday_confirmed boolean,
         visit_id uuid, ticket_number text, cancel_reason text, note text,
         closed_automatically boolean)
       except all
       select * from public.list_appointments(v_org, v_auj, v_auj + 6))) d;
    if v_n <> 80 or v_diff <> 0 then
      raise exception 'ÉCHEC : agenda (%) : % lignes, % différences', v_c, v_n, v_diff;
    end if;

    select count(*) into v_diff from (
      (select * from public.list_patient_appointments(v_pat)
       except all
       select * from pg_temp.ancien_patient(v_pat) as x(
         id uuid, starts_at timestamptz, ends_at timestamptz, local_date date, status text,
         appointment_type_id uuid, type_label text, is_discreet boolean, practitioner_name text,
         series_id uuid, series_index smallint, source text, ticket_number text,
         cancel_reason text, note text, closed_automatically boolean))
      union all
      (select * from pg_temp.ancien_patient(v_pat) as x(
         id uuid, starts_at timestamptz, ends_at timestamptz, local_date date, status text,
         appointment_type_id uuid, type_label text, is_discreet boolean, practitioner_name text,
         series_id uuid, series_index smallint, source text, ticket_number text,
         cancel_reason text, note text, closed_automatically boolean)
       except all
       select * from public.list_patient_appointments(v_pat))) d;
    if v_diff <> 0 then
      raise exception 'ÉCHEC : rendez-vous du patient (%) : % différences', v_c, v_diff;
    end if;

    select count(*) into v_diff from (
      (select * from public.appointments_to_remind(v_org, v_auj + 1)
       except all
       select * from pg_temp.ancien_rappels(v_org, v_auj + 1) as x(
         appointment_id uuid, patient_id uuid, patient_last_name text, patient_first_name text,
         patient_sex text, file_number text, phone text, phone_owner text,
         whatsapp_consent boolean, preferred_language text, starts_at timestamptz, status text,
         type_label text, is_discreet boolean, patient_label text, practitioner_name text,
         reminder_sent_at timestamptz, reminder_done_at timestamptz, reminder_done_by_name text))
      union all
      (select * from pg_temp.ancien_rappels(v_org, v_auj + 1) as x(
         appointment_id uuid, patient_id uuid, patient_last_name text, patient_first_name text,
         patient_sex text, file_number text, phone text, phone_owner text,
         whatsapp_consent boolean, preferred_language text, starts_at timestamptz, status text,
         type_label text, is_discreet boolean, patient_label text, practitioner_name text,
         reminder_sent_at timestamptz, reminder_done_at timestamptz, reminder_done_by_name text)
       except all
       select * from public.appointments_to_remind(v_org, v_auj + 1))) d;
    if v_diff <> 0 then
      raise exception 'ÉCHEC : rappels (%) : % différences', v_c, v_diff;
    end if;
  end loop;

  -- Le test couvre bien des types masqués : l'accueil voit « Consultation », jamais un
  -- libellé discret.
  perform set_config('request.jwt.claims',
    '{"sub": "00000000-0000-4000-a13a-00000000000d", "role": "authenticated"}', true);
  select count(*) into v_masques from public.list_appointments(v_org, v_auj, v_auj + 6) a
    join public.appointments r on r.id = a.id
    join public.appointment_types t on t.id = r.appointment_type_id
   where t.is_discreet;
  if v_masques < 10
     or exists (select 1 from public.list_appointments(v_org, v_auj, v_auj + 6) a
                 where public.appointment_label_is_discreet(a.type_label) or a.is_discreet) then
    raise exception 'ÉCHEC : jeu de données sans type masqué, ou libellé discret visible à l''accueil';
  end if;
  raise notice 'OK : agenda, rendez-vous du patient, rappels identiques à avant pour 5 rôles (% rendez-vous discrets masqués)', v_masques;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Droits calculés une seule fois par appel
-- -----------------------------------------------------------------------------
set local track_functions = 'all';
do $$
declare
  v_org    uuid := current_setting('test.org')::uuid;
  v_auj    date := public.org_local_date(current_setting('test.org')::uuid);
  v_avant  bigint;
  v_apres  bigint;
  v_c      text;
  v_appels bigint;
begin
  foreach v_c in array array['0b', '0d'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-a13a-0000000000' || v_c, 'role', 'authenticated')::text, true);
    select coalesce(sum(calls), 0) into v_avant from pg_stat_xact_user_functions
     where funcname = 'appointments_can_see_discreet';
    perform count(*) from public.list_appointments(v_org, v_auj, v_auj + 6);
    perform count(*) from public.list_patient_appointments(current_setting('test.patient')::uuid);
    perform count(*) from public.appointments_to_remind(v_org, v_auj + 1);
    select coalesce(sum(calls), 0) into v_apres from pg_stat_xact_user_functions
     where funcname = 'appointments_can_see_discreet';
    v_appels := v_apres - v_avant;
    -- Une fois par liste (trois listes), quel que soit le nombre de rendez-vous.
    if v_appels > 3 then
      raise exception 'ÉCHEC : droits recalculés % fois pour trois listes (%)', v_appels, v_c;
    end if;
  end loop;
  raise notice 'OK : droits calculés une fois par liste, sage-femme et accueil';
end $$;

-- -----------------------------------------------------------------------------
-- 3. appointment_types_seen fermée au client
-- -----------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.appointment_types_seen(uuid, boolean, uuid)', 'execute')
     or has_function_privilege('anon', 'public.appointment_types_seen(uuid, boolean, uuid)', 'execute') then
    raise exception 'ÉCHEC : appointment_types_seen exécutable par le client';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13a-00000000000d", "role": "authenticated"}', true);
do $$
begin
  perform * from public.appointment_types_seen(current_setting('test.org')::uuid, true);
  raise exception 'ÉCHEC : l''accueil lit les libellés réels';
exception
  when insufficient_privilege then
    raise notice 'OK : appointment_types_seen refusée à l''accueil (libellés réels jamais lus)';
end $$;
reset role;

rollback;
