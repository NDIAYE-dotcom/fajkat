-- =============================================================================
-- Tests — étape 13, partie A (Rendez-vous et agenda)
-- -----------------------------------------------------------------------------
-- Vérifie : paramètres pré-remplis (types, discrets, file liée, fêtes fixes) ; type
-- discret d'office (dépistage) ; rôles et isolement ; séance pleine qui refuse le 41e
-- enfant ; jour férié refusé sans confirmation explicite, puis accepté et tracé ; date
-- passée, horaires, pause ; note réservée aux soignants (liste, table, journal) ; série
-- de planification familiale ; praticien (offre Clinique seulement, rôle soignant ou
-- owner soignant, congé signalé) ; « À rappeler demain » sans nom de type discret ;
-- statuts ; « Arrivé » (file d'attente en un geste, passage repris s'il existe) ; report
-- d'un jour férié ; taux d'absence ; schedule_followup ; fusion ; lecture seule ; anonymes.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3 à 13 appliquées (dont etape13c_discretion).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation : A owner du poste, B owner d'une clinique ; chez A : D admin,
-- C infirmier, 06 caissier, 07 pharmacien, 09 accueil ; chez B : 0e médecin, 0f accueil.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a130-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '0e', '0f', '06', '07', '09']) c;
update public.profiles set full_name = 'Dr Diallo'
 where id = '00000000-0000-4000-a130-00000000000e';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a130-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a130-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org_a')::uuid, ('00000000-0000-4000-a130-0000000000' || c)::uuid,
       r, true
  from (values ('0d', 'admin'), ('0c', 'infirmier'), ('06', 'caissier'),
               ('07', 'pharmacien'), ('09', 'accueil')) v(c, r);
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org_b')::uuid, ('00000000-0000-4000-a130-0000000000' || c)::uuid,
       r, true
  from (values ('0e', 'medecin'), ('0f', 'accueil')) v(c, r);

-- Dates du test, relatives au jour de la structure : J = dans 7 jours (jour de séance),
-- F = J + 1 (jour férié ajouté par le test), N = J + 2 (date de report).
select set_config('test.auj', public.org_local_date(current_setting('test.org_a')::uuid)::text, true);
select set_config('test.j', (current_setting('test.auj')::date + 7)::text, true);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a130-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
-- Heure locale de la structure A (Africa/Dakar) -> timestamptz.
create function pg_temp.a(p_jours integer, p_heure text) returns timestamptz language sql as $$
  select ((current_setting('test.j')::date + p_jours) + p_heure::time) at time zone 'Africa/Dakar';
$$;
-- Security definer : retrouve aussi les types discrets, cachés à l'accueil (etape13c).
create function pg_temp.type_a(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org_a')::uuid and template_code = p_code;
$$;
create function pg_temp.nouveau_patient(p_nom text, p_prenom text) returns uuid language sql as $$
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org_a')::uuid, p_nom, p_prenom, 'F', 30) returning id;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.a(integer, text),
  pg_temp.type_a(text), pg_temp.nouveau_patient(text, text) to authenticated;

-- Indice du dernier refus (book_appointment) : « confirmation_required » ou rien.
create function pg_temp.refus(p_sql text, out message text, out indice text) language plpgsql as $$
begin
  execute p_sql;
  message := null;
exception when invalid_parameter_value then
  get stacked diagnostics message = message_text, indice = pg_exception_hint;
end;
$$;
grant execute on function pg_temp.refus(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres pré-remplis
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_an  integer := extract(year from current_setting('test.auj')::date)::integer;
begin
  -- 7 types au poste, consultation postnatale comprise (étape 13 D).
  if (select count(*) from public.appointment_types where org_id = v_org) <> 7
     or not (select is_discreet from public.appointment_types
             where org_id = v_org and template_code = 'pf')
     or not (select is_discreet from public.appointment_types
             where org_id = v_org and template_code = 'depistage')
     or (select is_discreet from public.appointment_types
         where org_id = v_org and template_code = 'vaccination')
     or (select recurrence_months from public.appointment_types
         where org_id = v_org and template_code = 'pf') <> 3
     or (select q.label from public.appointment_types t
           join public.queue_services q on q.id = t.queue_service_id
          where t.org_id = v_org and t.template_code = 'vaccination') <> 'Vaccination'
     or not exists (select 1 from public.appointment_types
                    where org_id = current_setting('test.org_b')::uuid and template_code = 'imagerie') then
    raise exception 'ÉCHEC : types de rendez-vous non pré-remplis';
  end if;
  if (select count(*) from public.holidays where org_id = v_org) <> 12
     or not exists (select 1 from public.holidays
                    where org_id = v_org and holiday_date = make_date(v_an + 1, 4, 4))
     or exists (select 1 from public.holidays where org_id = v_org and template_code = 'tabaski') then
    raise exception 'ÉCHEC : fêtes fixes non pré-remplies (ou fête variable datée d''office)';
  end if;
  raise notice 'OK : types (PF et dépistage discrets, file liée) et fêtes fixes de deux années';
end $$;

-- Les fêtes fixes proches gêneraient les dates du test (J peut tomber un 25 décembre) :
-- elles sont retirées ici, le test ajoute son propre jour férié.
update public.holidays set deleted_at = now()
 where org_id = current_setting('test.org_a')::uuid;

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres : owner et admin seulement
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0d');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_id  uuid;
begin
  insert into public.appointment_types (org_id, label, duration_minutes)
  values (v_org, 'Dépistage IST', 15) returning id into v_id;
  if not (select is_discreet from public.appointment_types where id = v_id) then
    raise exception 'ÉCHEC : un type « dépistage » n''est pas discret d''office';
  end if;
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                           end_time, capacity, label)
  values (v_org, pg_temp.type_a('vaccination'),
          extract(isodow from current_setting('test.j')::date), '08:00', '12:00', 40,
          'Séance de vaccination')
  returning id into v_id;
  perform set_config('test.seance', v_id::text, true);
  insert into public.appointment_breaks (org_id, start_time, end_time, label)
  values (v_org, '13:00', '15:00', 'Déjeuner');
  insert into public.holidays (org_id, holiday_date, label, template_code)
  values (v_org, current_setting('test.j')::date + 1, 'Korité', 'korite');
  if public.add_fixed_holidays(v_org, 2030) <> 6 or public.add_fixed_holidays(v_org, 2030) <> 0 then
    raise exception 'ÉCHEC : ajout des fêtes fixes d''une année (rejouable)';
  end if;
  raise notice 'OK : l''admin paramètre types, séances, pauses et jours fériés';
end $$;

reset role;
update public.organizations
   set settings = settings || jsonb_build_object('opening_hours', jsonb_build_object(
         public.weekday_key(extract(isodow from current_setting('test.j')::date)::integer),
         jsonb_build_object('statut', 'ouvert', 'debut', '08:00', 'fin', '17:00')))
 where id = current_setting('test.org_a')::uuid;
set local role authenticated;

do $$
declare
  v_code text;
begin
  foreach v_code in array array['0c', '06', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    begin
      insert into public.holidays (org_id, holiday_date, label)
      values (current_setting('test.org_a')::uuid, current_setting('test.j')::date + 3, 'Fête');
      raise exception 'ÉCHEC : le rôle % ajoute un jour férié', v_code;
    exception when insufficient_privilege then
      null;
    end;
    -- Types discrets (PF, Dépistage, Dépistage IST) cachés à l'accueil et au caissier
    -- (etape13c_discretion) ; consultation postnatale en plus (étape 13 D).
    if (select count(*) from public.appointment_types
        where org_id = current_setting('test.org_a')::uuid)
       <> (case when v_code = '0c' then 8 else 5 end) then
      raise exception 'ÉCHEC : le rôle % ne lit pas les types', v_code;
    end if;
  end loop;
  raise notice 'OK : infirmier, caissier, accueil lisent les paramètres sans les modifier';
end $$;

select pg_temp.en_tant_que('07');
do $$
begin
  if exists (select 1 from public.appointment_types) or exists (select 1 from public.holidays) then
    raise exception 'ÉCHEC : le pharmacien lit l''agenda';
  end if;
  begin
    perform public.list_appointments(current_setting('test.org_a')::uuid, current_date, current_date);
    raise exception 'ÉCHEC : le pharmacien lit la liste';
  exception when insufficient_privilege then
    null;
  end;
end $$;
select pg_temp.en_tant_que('0b');
do $$
begin
  if exists (select 1 from public.appointment_types
             where org_id = current_setting('test.org_a')::uuid) then
    raise exception 'ÉCHEC : B lit les paramètres de A';
  end if;
  begin
    perform public.book_appointment(current_setting('test.org_a')::uuid, gen_random_uuid(),
      pg_temp.type_a('consultation'), pg_temp.a(0, '09:00'));
    raise exception 'ÉCHEC : B prend un rendez-vous chez A';
  exception when insufficient_privilege then
    raise notice 'OK : pharmacien hors de l''agenda ; isolement entre structures';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Séance pleine : le 41e enfant est refusé (le caissier prend les rendez-vous)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_r   record;
  i     integer;
begin
  for i in 1 .. 40 loop
    perform public.book_appointment(v_org, pg_temp.nouveau_patient('Enfant', 'N° ' || i),
                                    pg_temp.type_a('vaccination'), pg_temp.a(0, '08:00'));
  end loop;
  if (select count(*) from public.appointments
      where session_id = current_setting('test.seance')::uuid) <> 40 then
    raise exception 'ÉCHEC : rendez-vous non rattachés à la séance';
  end if;
  select * into v_r from pg_temp.refus(format(
    'select public.book_appointment(%L, %L, %L, %L, p_confirm => true)', v_org,
    pg_temp.nouveau_patient('Enfant', 'N° 41'), pg_temp.type_a('vaccination'),
    pg_temp.a(0, '09:30')));
  if v_r.message is null or v_r.message !~ 'Séance pleine.*40 / 40' then
    raise exception 'ÉCHEC : 41e enfant accepté : %', v_r.message;
  end if;
  raise notice 'OK : séance de 40 places : le 41e enfant est refusé, même confirmé (%)', v_r.message;

  -- Hors séance (après 12:00) : pas de limite de séance.
  if (select session_id from public.book_appointment(v_org, pg_temp.nouveau_patient('Enfant', 'N° 42'),
        pg_temp.type_a('vaccination'), pg_temp.a(0, '12:00'))) is not null then
    raise exception 'ÉCHEC : rendez-vous de 12:00 rattaché à la séance de 08:00 – 12:00';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Jour férié, date passée, horaires, pause
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid := pg_temp.nouveau_patient('Ndiaye', 'Awa');
  v_r   record;
  v_a   public.appointments;
  v_c   jsonb;
begin
  perform set_config('test.p_ferie', v_p::text, true);
  select * into v_r from pg_temp.refus(format(
    'select public.book_appointment(%L, %L, %L, %L)', v_org, v_p,
    pg_temp.type_a('consultation'), pg_temp.a(1, '09:00')));
  if v_r.indice is distinct from 'confirmation_required' or v_r.message !~ 'jour férié \(Korité\)' then
    raise exception 'ÉCHEC : rendez-vous pris un jour férié sans confirmation : % / %',
      v_r.message, v_r.indice;
  end if;
  if exists (select 1 from public.appointments where patient_id = v_p) then
    raise exception 'ÉCHEC : rendez-vous gardé malgré le refus';
  end if;
  raise notice 'OK : jour férié refusé sans confirmation explicite (%)', v_r.message;

  v_a := (select a from public.book_appointment(v_org, v_p, pg_temp.type_a('consultation'),
          pg_temp.a(1, '09:00'), p_note => 'Contrôle après traitement', p_confirm => true) a);
  if not v_a.holiday_confirmed or v_a.status <> 'scheduled'
     or v_a.ends_at - v_a.starts_at <> interval '15 minutes' then
    raise exception 'ÉCHEC : rendez-vous confirmé un jour férié : %', v_a;
  end if;
  perform set_config('test.rdv_ferie', v_a.id::text, true);
  raise notice 'OK : jour férié accepté après confirmation, et tracé (holiday_confirmed)';

  select * into v_r from pg_temp.refus(format(
    'select public.book_appointment(%L, %L, %L, %L, p_confirm => true)', v_org, v_p,
    pg_temp.type_a('consultation'), now() - interval '2 days'));
  if v_r.message !~ 'passée' then
    raise exception 'ÉCHEC : rendez-vous dans le passé : %', v_r.message;
  end if;

  v_c := public.check_appointment(v_org, v_p, pg_temp.type_a('consultation'), pg_temp.a(0, '13:30'));
  if not (v_c -> 0 -> 'warnings') @> '[{"code": "break"}]' then
    raise exception 'ÉCHEC : pause non signalée : %', v_c;
  end if;
  v_c := public.check_appointment(v_org, v_p, pg_temp.type_a('consultation'), pg_temp.a(0, '17:30'));
  if not (v_c -> 0 -> 'warnings') @> '[{"code": "hours"}]' then
    raise exception 'ÉCHEC : horaires non signalés : %', v_c;
  end if;
  v_c := public.check_appointment(v_org, v_p, pg_temp.type_a('consultation'), pg_temp.a(0, '09:00'));
  if jsonb_array_length(v_c -> 0 -> 'warnings') <> 0 or jsonb_array_length(v_c -> 0 -> 'blocking') <> 0 then
    raise exception 'ÉCHEC : avertissement sur un créneau libre : %', v_c;
  end if;
  raise notice 'OK : date passée refusée ; pause et horaires signalés ; créneau libre sans alerte';

  -- Praticien : agenda par praticien réservé à l'offre Clinique.
  select * into v_r from pg_temp.refus(format(
    'select public.book_appointment(%L, %L, %L, %L, p_practitioner_id => %L, p_confirm => true)',
    v_org, v_p, pg_temp.type_a('consultation'), pg_temp.a(0, '09:00'),
    (select id from public.memberships where org_id = v_org and role = 'infirmier')));
  if v_r.message !~ 'offre Clinique' then
    raise exception 'ÉCHEC : praticien accepté dans un poste : %', v_r.message;
  end if;
  raise notice 'OK : praticien refusé dans un poste de santé (offre Clinique)';
end $$;

-- -----------------------------------------------------------------------------
-- Note réservée aux soignants
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
begin
  foreach v_code in array array['06', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    if exists (select 1 from public.appointment_notes)
       or exists (select 1 from public.list_appointments(current_setting('test.org_a')::uuid,
                    current_setting('test.j')::date, current_setting('test.j')::date + 1)
                  where note is not null) then
      raise exception 'ÉCHEC : le rôle % lit la note', v_code;
    end if;
    if (select type_label from public.list_appointments(current_setting('test.org_a')::uuid,
          current_setting('test.j')::date + 1, current_setting('test.j')::date + 1)
        where id = current_setting('test.rdv_ferie')::uuid) <> 'Consultation' then
      raise exception 'ÉCHEC : le rôle % ne voit pas le type', v_code;
    end if;
  end loop;
  perform pg_temp.en_tant_que('0c');
  if (select note from public.list_appointments(current_setting('test.org_a')::uuid,
        current_setting('test.j')::date + 1, current_setting('test.j')::date + 1)
      where id = current_setting('test.rdv_ferie')::uuid) <> 'Contrôle après traitement' then
    raise exception 'ÉCHEC : l''infirmier ne lit pas la note';
  end if;
  raise notice 'OK : type visible par caissier et accueil, note par les soignants seulement';
end $$;

reset role;
do $$
begin
  if exists (select 1 from public.audit_logs
             where org_id = current_setting('test.org_a')::uuid
               and table_name = 'appointment_notes' and coalesce(new_data::text, '') ~* 'traitement')
     or not exists (select 1 from public.audit_logs
                    where org_id = current_setting('test.org_a')::uuid
                      and table_name = 'appointment_notes') then
    raise exception 'ÉCHEC : note recopiée dans audit_logs, ou non journalisée';
  end if;
  raise notice 'OK : note journalisée sans sa valeur';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Série (planification familiale tous les 3 mois), « À rappeler demain »
-- (infirmier : l'accueil ne prend pas un type discret, étape 13 D)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_org   uuid := current_setting('test.org_a')::uuid;
  v_p     uuid := pg_temp.nouveau_patient('Sow', 'Mariama');
  v_v     uuid := pg_temp.nouveau_patient('Fall', 'Coumba');
  v_n     integer;
  v_label text;
begin
  select count(*) into v_n from public.book_appointment(v_org, v_p, pg_temp.type_a('pf'),
    pg_temp.a(0, '10:00'), p_count => 4, p_interval_months => 3);
  if v_n <> 4 or (select count(distinct series_id) from public.appointments where patient_id = v_p) <> 1
     or (select max(local_date) from public.appointments where patient_id = v_p)
        <> current_setting('test.j')::date + interval '9 months'
     or exists (select 1 from public.appointments where patient_id = v_p
                and (starts_at at time zone 'Africa/Dakar')::time <> '10:00') then
    raise exception 'ÉCHEC : série de planification familiale';
  end if;
  raise notice 'OK : série de 4 rendez-vous tous les 3 mois, à la même heure';

  -- Demain : un rendez-vous discret (PF) et un autre (vaccination).
  perform public.book_appointment(v_org, v_p, pg_temp.type_a('pf'),
    ((current_setting('test.auj')::date + 1) + time '09:00') at time zone 'Africa/Dakar', p_confirm => true);
  perform public.book_appointment(v_org, v_v, pg_temp.type_a('vaccination'),
    ((current_setting('test.auj')::date + 1) + time '09:30') at time zone 'Africa/Dakar', p_confirm => true);
  if (select count(*) from public.appointments_to_remind(v_org)) <> 2 then
    raise exception 'ÉCHEC : liste « À rappeler demain » : %',
      (select count(*) from public.appointments_to_remind(v_org));
  end if;
  select patient_label into v_label from public.appointments_to_remind(v_org) where patient_id = v_p;
  if v_label <> 'votre rendez-vous au poste de santé' then
    raise exception 'ÉCHEC : type discret nommé pour le patient : %', v_label;
  end if;
  select patient_label into v_label from public.appointments_to_remind(v_org) where patient_id = v_v;
  if v_label <> 'votre rendez-vous au poste de santé (Vaccination)' then
    raise exception 'ÉCHEC : libellé pour le patient : %', v_label;
  end if;
  raise notice 'OK : « À rappeler demain » : le rendez-vous apparaît la veille ; type discret jamais nommé';
end $$;

-- -----------------------------------------------------------------------------
-- Praticien (Clinique) : rôle soignant, owner soignant, congé signalé
-- -----------------------------------------------------------------------------
reset role;
insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date,
                                   status, decided_at)
select current_setting('test.org_b')::uuid, m.id, 'maladie', current_setting('test.j')::date,
       current_setting('test.j')::date, 'approved', now()
  from public.memberships m
 where m.org_id = current_setting('test.org_b')::uuid
   and m.user_id = '00000000-0000-4000-a130-00000000000e';
set local role authenticated;

select pg_temp.en_tant_que('0f');
do $$
declare
  v_org  uuid := current_setting('test.org_b')::uuid;
  v_med  uuid := (select id from public.memberships where org_id = v_org and role = 'medecin');
  v_acc  uuid := (select id from public.memberships where org_id = v_org and role = 'accueil');
  v_own  uuid := (select id from public.memberships where org_id = v_org and role = 'owner');
  v_type uuid := (select id from public.appointment_types
                   where org_id = v_org and template_code = 'consultation');
  v_p    uuid;
  v_r    record;
  v_c    jsonb;
  v_a    public.appointments;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Gueye', 'Ousmane', 'M', 50) returning id into v_p;

  v_c := public.check_appointment(v_org, v_p, v_type,
           (current_setting('test.j')::date + time '10:00') at time zone 'Africa/Dakar', v_med);
  if not (v_c -> 0 -> 'warnings') @> '[{"code": "leave"}]'
     or (v_c -> 0 -> 'warnings')::text ~* 'maladie' then
    raise exception 'ÉCHEC : congé du praticien non signalé, ou type du congé révélé : %', v_c;
  end if;
  select * into v_r from pg_temp.refus(format(
    'select public.book_appointment(%L, %L, %L, %L, %L)', v_org, v_p, v_type,
    (current_setting('test.j')::date + time '10:00') at time zone 'Africa/Dakar', v_med));
  if v_r.indice is distinct from 'confirmation_required' or v_r.message !~ 'Dr Diallo est en congé' then
    raise exception 'ÉCHEC : rendez-vous pris sans prévenir du congé : %', v_r.message;
  end if;
  raise notice 'OK : praticien en congé signalé avant la validation (%)', v_r.message;

  v_a := (select a from public.book_appointment(v_org, v_p, v_type,
          (current_setting('test.j')::date + 1 + time '10:00') at time zone 'Africa/Dakar', v_med) a);
  v_c := public.check_appointment(v_org, null, v_type,
           (current_setting('test.j')::date + 1 + time '10:10') at time zone 'Africa/Dakar', v_med);
  if v_a.practitioner_membership_id <> v_med or not (v_c -> 0 -> 'warnings') @> '[{"code": "overlap"}]' then
    raise exception 'ÉCHEC : créneau déjà pris du praticien non signalé : %', v_c;
  end if;

  foreach v_med in array array[v_acc, v_own] loop
    select * into v_r from pg_temp.refus(format(
      'select public.book_appointment(%L, %L, %L, %L, %L, p_confirm => true)', v_org, v_p, v_type,
      (current_setting('test.j')::date + 2 + time '10:00') at time zone 'Africa/Dakar', v_med));
    if v_r.message !~ 'praticien actif' then
      raise exception 'ÉCHEC : membre non soignant accepté comme praticien : %', v_r.message;
    end if;
  end loop;
  raise notice 'OK : praticien : rôle soignant exigé (accueil et owner non soignant refusés) ; créneau pris signalé';
end $$;

reset role;
update public.memberships set is_clinician = true
 where org_id = current_setting('test.org_b')::uuid and role = 'owner';
set local role authenticated;
select pg_temp.en_tant_que('0f');
do $$
declare
  v_org uuid := current_setting('test.org_b')::uuid;
begin
  perform public.book_appointment(v_org,
    (select id from public.patients where org_id = v_org and last_name = 'Gueye'),
    (select id from public.appointment_types where org_id = v_org and template_code = 'consultation'),
    (current_setting('test.j')::date + 2 + time '10:00') at time zone 'Africa/Dakar',
    (select id from public.memberships where org_id = v_org and role = 'owner'));
  raise notice 'OK : owner qui exerce (is_clinician) accepté comme praticien';
end $$;

-- -----------------------------------------------------------------------------
-- Statuts, « Arrivé », taux d'absence
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org  uuid := current_setting('test.org_a')::uuid;
  v_auj  timestamptz := (current_setting('test.auj')::date + time '08:30') at time zone 'Africa/Dakar';
  v_p    uuid := pg_temp.nouveau_patient('Diop', 'Khady');
  v_q    uuid := pg_temp.nouveau_patient('Ba', 'Aminata');
  v_a    public.appointments;
  v_b    public.appointments;
  v_v    public.visits;
  v_w    public.visits;
  v_r    record;
  v_sans uuid;
begin
  perform set_config('test.p_diop', v_p::text, true);
  -- Rendez-vous d'aujourd'hui : l'heure peut être passée, la date ne l'est pas.
  v_a := (select a from public.book_appointment(v_org, v_p, pg_temp.type_a('vaccination'),
          v_auj, p_confirm => true) a);
  v_a := public.set_appointment_status(v_a.id, 'confirmed');
  if v_a.confirmed_at is null then
    raise exception 'ÉCHEC : confirmation';
  end if;

  v_v := public.arrive_appointment(v_a.id);
  if v_v.source <> 'appointment' or v_v.status <> 'waiting' or v_v.ticket_number !~ '^C-\d{3}$'
     or (select status from public.appointments where id = v_a.id) <> 'arrived'
     or (select visit_id from public.appointments where id = v_a.id) <> v_v.id then
    raise exception 'ÉCHEC : « Arrivé » : %', v_v;
  end if;
  raise notice 'OK : « Arrivé » : passage créé dans la file liée (ticket %), rendez-vous arrivé', v_v.ticket_number;

  select * into v_r from pg_temp.refus(format('select public.arrive_appointment(%L)', v_a.id));
  if v_r.message !~ 'déjà clos' then
    raise exception 'ÉCHEC : double arrivée : %', v_r.message;
  end if;
  select * into v_r from pg_temp.refus(format('select public.set_appointment_status(%L, %L)',
                                              v_a.id, 'cancelled'));
  if v_r.message !~ 'déjà clos' then
    raise exception 'ÉCHEC : rendez-vous arrivé annulé : %', v_r.message;
  end if;

  -- Patient déjà dans la file de ce service : son passage est repris.
  v_w := public.register_arrival(v_org, v_q, (select queue_service_id from public.appointment_types
                                               where id = pg_temp.type_a('consultation')));
  v_b := (select a from public.book_appointment(v_org, v_q, pg_temp.type_a('consultation'),
          v_auj, p_confirm => true) a);
  if (public.arrive_appointment(v_b.id)).id <> v_w.id then
    raise exception 'ÉCHEC : deuxième ticket créé pour un patient déjà dans la file';
  end if;
  raise notice 'OK : patient déjà dans la file : passage repris, pas de double ticket';

  select * into v_r from pg_temp.refus(format('select public.arrive_appointment(%L)',
                                              current_setting('test.rdv_ferie')));
  if v_r.message !~ 'pas prévu aujourd' then
    raise exception 'ÉCHEC : arrivée d''un rendez-vous d''un autre jour : %', v_r.message;
  end if;
  select * into v_r from pg_temp.refus(format('select public.set_appointment_status(%L, %L)',
                                              current_setting('test.rdv_ferie'), 'no_show'));
  if v_r.message !~ 'absent' then
    raise exception 'ÉCHEC : absent marqué à l''avance : %', v_r.message;
  end if;

  -- Absent aujourd'hui, puis corrigé, puis absent : 1 venu, 1 absent = 50 %.
  v_b := (select a from public.book_appointment(v_org, v_p, pg_temp.type_a('consultation'),
          v_auj, p_confirm => true) a);
  v_b := public.set_appointment_status(v_b.id, 'no_show');
  select * into v_r from pg_temp.refus(format('select public.set_appointment_status(%L, %L)',
                                              v_b.id, 'confirmed'));
  if v_r.message is null then
    raise exception 'ÉCHEC : absent confirmé sans repasser par « prévu »';
  end if;
  v_b := public.set_appointment_status(v_b.id, 'scheduled');
  v_b := public.set_appointment_status(v_b.id, 'no_show');
  v_sans := pg_temp.nouveau_patient('Sans', 'Rendez-vous');
  if public.patient_appointment_stats(v_p) ->> 'no_show_rate' <> '50'
     or (public.patient_appointment_stats(v_q) ->> 'no_show_rate')::integer <> 0
     or public.patient_appointment_stats(v_sans) ->> 'no_show_rate' is not null then
    raise exception 'ÉCHEC : taux d''absence : %', public.patient_appointment_stats(v_p);
  end if;
  raise notice 'OK : statuts (confirmé, absent corrigé, clos) et taux d''absence (50 %%)';

  begin
    update public.appointments set status = 'cancelled' where id = v_b.id;
    raise exception 'ÉCHEC : rendez-vous modifié en direct';
  exception when insufficient_privilege then
    raise notice 'OK : rendez-vous modifiés par les fonctions seulement';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Jour férié confirmé la veille : reporter les rendez-vous déjà pris
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org   uuid := current_setting('test.org_a')::uuid;
  v_ids   uuid[];
  v_n     integer;
  v_neuf  public.appointments;
begin
  v_ids := array(select id from public.list_appointments(v_org, current_setting('test.j')::date + 1,
                                                         current_setting('test.j')::date + 1)
                  where status in ('scheduled', 'confirmed'));
  if cardinality(v_ids) <> 1 then
    raise exception 'ÉCHEC : rendez-vous du jour férié : %', cardinality(v_ids);
  end if;
  select count(*) into v_n from public.reschedule_appointments(v_ids, current_setting('test.j')::date + 2);
  select * into v_neuf from public.appointments
   where rescheduled_from_id = current_setting('test.rdv_ferie')::uuid;
  if v_n <> 1 or v_neuf.local_date <> current_setting('test.j')::date + 2
     or (v_neuf.starts_at at time zone 'Africa/Dakar')::time <> '09:00'
     or v_neuf.source <> 'reschedule'
     or (select status from public.appointments where id = current_setting('test.rdv_ferie')::uuid)
        <> 'rescheduled'
     or (select rescheduled_to_id from public.appointments
         where id = current_setting('test.rdv_ferie')::uuid) <> v_neuf.id then
    raise exception 'ÉCHEC : report du jour férié : %', v_neuf;
  end if;
  perform pg_temp.en_tant_que('0c');
  if not exists (select 1 from public.appointment_notes where appointment_id = v_neuf.id) then
    raise exception 'ÉCHEC : note perdue au report';
  end if;
  raise notice 'OK : rendez-vous du jour férié reportés en un geste (même heure, ancien gardé, note suivie)';

  -- Report vers la séance pleine : refusé, tout ou rien.
  perform pg_temp.en_tant_que('09');
  begin
    perform public.reschedule_appointment(
      (select id from public.appointments where org_id = v_org and status = 'scheduled'
          and appointment_type_id = pg_temp.type_a('vaccination') and session_id is null
          and local_date = current_setting('test.j')::date),
      pg_temp.a(0, '09:00'), p_confirm => true);
    raise exception 'ÉCHEC : report vers une séance pleine';
  exception when invalid_parameter_value then
    raise notice 'OK : report vers une séance pleine refusé (%)', sqlerrm;
  end;
end $$;

-- -----------------------------------------------------------------------------
-- schedule_followup (CPN, vaccins, PF)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid := pg_temp.nouveau_patient('Faye', 'Bineta');
  v_a   public.appointments;
  v_b   public.appointments;
begin
  -- Séance du jour J pleine : le jour de séance suivant (J + 7), à l'heure de la séance.
  v_a := public.schedule_followup(v_p, 'vaccination', current_setting('test.j')::date, 'vaccination:penta2');
  if v_a.local_date <> current_setting('test.j')::date + 7 or v_a.session_id is null
     or (v_a.starts_at at time zone 'Africa/Dakar')::time <> '08:00'
     or v_a.source <> 'followup' or v_a.source_ref <> 'vaccination:penta2' then
    raise exception 'ÉCHEC : rendez-vous de suivi (vaccination) : %', v_a;
  end if;
  v_b := public.schedule_followup(v_p, 'vaccination', current_setting('test.j')::date + 3, 'vaccination:penta2');
  if v_b.id <> v_a.id then
    raise exception 'ÉCHEC : schedule_followup rejoué crée un doublon';
  end if;
  -- CPN sans séance, le jour férié : le lendemain, à l'heure d'ouverture.
  v_a := public.schedule_followup(v_p, 'cpn', current_setting('test.j')::date + 1, 'cpn:2');
  if v_a.local_date <> current_setting('test.j')::date + 2 or v_a.holiday_confirmed then
    raise exception 'ÉCHEC : rendez-vous de suivi placé un jour férié : %', v_a;
  end if;
  begin
    perform public.schedule_followup(v_p, 'inconnu', current_setting('test.j')::date, 'test');
    raise exception 'ÉCHEC : type inconnu accepté';
  exception when invalid_parameter_value then
    null;
  end;
  raise notice 'OK : schedule_followup : séance pleine et jour férié évités, rejouable, type inconnu refusé';
end $$;

-- -----------------------------------------------------------------------------
-- Fusion : les rendez-vous suivent le dossier gardé
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0d');
do $$
declare
  v_garde uuid := pg_temp.nouveau_patient('Diop', 'Khadija');
begin
  perform public.merge_patients(v_garde, current_setting('test.p_diop')::uuid, 'Même personne');
  if exists (select 1 from public.appointments where patient_id = current_setting('test.p_diop')::uuid)
     or (public.patient_appointment_stats(v_garde) ->> 'no_show_rate') <> '50' then
    raise exception 'ÉCHEC : rendez-vous restés sur le doublon';
  end if;
  raise notice 'OK : fusion : rendez-vous et taux d''absence suivent le dossier gardé';
end $$;

-- -----------------------------------------------------------------------------
-- Lecture seule, anonymes
-- -----------------------------------------------------------------------------
reset role;
update public.organizations set status = 'read_only' where id = current_setting('test.org_a')::uuid;
set local role authenticated;
select pg_temp.en_tant_que('09');
do $$
begin
  if (select count(*) from public.list_appointments(current_setting('test.org_a')::uuid,
        current_setting('test.j')::date, current_setting('test.j')::date + 2)) = 0 then
    raise exception 'ÉCHEC : agenda illisible en lecture seule';
  end if;
  begin
    perform public.book_appointment(current_setting('test.org_a')::uuid,
      current_setting('test.p_ferie')::uuid, pg_temp.type_a('consultation'),
      pg_temp.a(2, '11:00'), p_confirm => true);
    raise exception 'ÉCHEC : rendez-vous pris en lecture seule';
  exception when invalid_parameter_value then
    raise notice 'OK : lecture seule : agenda lisible, aucune prise de rendez-vous';
  end;
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.appointments;
    raise exception 'ÉCHEC : rendez-vous lisibles sans connexion';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.appointments_to_remind(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : liste des rappels sans connexion';
  exception when insufficient_privilege then
    raise notice 'OK : rien sans connexion';
  end;
end $$;

reset role;

rollback;
