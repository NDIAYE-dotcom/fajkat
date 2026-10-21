-- =============================================================================
-- Tests — étape 13, partie E (statuts, arrivée, rappels, rendez-vous du patient, séries)
-- -----------------------------------------------------------------------------
-- Vérifie : rappels de la veille (PF jamais listée sur un téléphone qui n'est pas celui
-- de la patiente, même pour l'owner ; titulaire inconnu : pas listée ; téléphone de la
-- famille pour un autre type : listé ; message sans type discret) ; « Rappel fait »
-- (accueil, groupe d'un téléphone, refus d'un rendez-vous non rappelable sans rien
-- révéler, décocher) ; « Confirmé par le patient » ; annulation : motif obligatoire,
-- masqué à l'accueil pour un type discret ; arrivée d'une PF masquée : file du vrai type
-- malgré la file envoyée ; list_patient_appointments (masquage, note, droits) ; séries
-- masquées (series_id / series_index) ; check_appointment_series (jour férié, séance
-- pleine, même jour) et book_appointment_series (tout ou rien, confirmation, séance par
-- date, réservé à qui voit le type).
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13f.sql
-- Prérequis : migrations des étapes 3 à 13 appliquées (dont etape13f_suivi).
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a13f-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13f-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0c', '06', '09', '05']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13f-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé F', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a13f-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('06', 'caissier'), ('09', 'accueil'), ('05', 'comptable')) v(c, r);
-- Owner qui exerce une profession soignante (is_clinician) : il voit les types discrets
-- comme un soignant (étape 14, partie C). L'owner qui n'exerce pas : etape13c.sql, etape14c.sql.
update public.memberships set is_clinician = true
 where org_id = current_setting('test.org')::uuid
   and user_id = '00000000-0000-4000-a13f-00000000000a';
-- A = aujourd'hui, D = demain ; fêtes fixes retirées, jour férié à D + 7.
select set_config('test.a', public.org_local_date(current_setting('test.org')::uuid)::text, true);
select set_config('test.d', (current_setting('test.a')::date + 1)::text, true);
update public.holidays set deleted_at = now() where org_id = current_setting('test.org')::uuid;
insert into public.holidays (org_id, holiday_date, label)
values (current_setting('test.org')::uuid, current_setting('test.d')::date + 7, 'Fête de test');

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a13f-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.type_f(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
create function pg_temp.file_f(p_code text) returns uuid language sql security definer as $$
  select queue_service_id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
-- Heure locale du jour D + n.
create function pg_temp.a(p_jours integer, p_heure time) returns timestamptz language sql as $$
  select ((current_setting('test.d')::date + p_jours) + p_heure) at time zone 'Africa/Dakar';
$$;
create function pg_temp.rdv(p_id uuid) returns public.appointments language sql security definer as $$
  select * from public.appointments where id = p_id;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.type_f(text), pg_temp.file_f(text),
  pg_temp.a(integer, time), pg_temp.rdv(uuid) to authenticated;

-- Séance PF le jour de la semaine de D (et de D + 7, D + 14…) : 08:00 – 10:00, 1 place.
-- Les rendez-vous de demain sont pris après 10:00, hors de cette séance.
insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                         end_time, capacity)
values (current_setting('test.org')::uuid, pg_temp.type_f('pf'),
        extract(isodow from current_setting('test.d')::date + 14), '08:00', '10:00', 1);
select set_config('test.seance_pf', (select id::text from public.appointment_sessions
  where org_id = current_setting('test.org')::uuid and appointment_type_id = pg_temp.type_f('pf')), true);

set local role authenticated;

-- Patientes et rendez-vous de demain (owner) ----------------------------------------------
--   Awa  : PF, téléphone du mari          -> jamais dans les rappels ;
--   Khady: PF, son propre téléphone       -> dans les rappels, message neutre ;
--   Binta: PF, titulaire inconnu          -> jamais dans les rappels ;
--   Modou et Aïda : vaccination, même téléphone (la mère) -> rappelés ensemble.
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_id  uuid;
  r     record;
begin
  for r in select * from (values
      ('awa',   'Ndiaye', 'Awa',   'F', '+221770000001', 'conjoint', 'pf',          '10:00'),
      ('khady', 'Sow',    'Khady', 'F', '+221770000002', 'patient',  'pf',          '10:20'),
      ('binta', 'Fall',   'Binta', 'F', '+221770000003', null,       'pf',          '10:40'),
      ('modou', 'Diop',   'Modou', 'M', '+221770000004', 'mere',     'vaccination', '11:00'),
      ('aida',  'Diop',   'Aïda',  'F', '+221770000004', 'mere',     'vaccination', '11:15'))
    v(cle, nom, prenom, sexe, tel, titulaire, type_code, heure)
  loop
    insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone, phone_owner)
    values (v_org, r.nom, r.prenom, r.sexe, 25, r.tel, r.titulaire) returning id into v_id;
    perform set_config('test.p_' || r.cle, v_id::text, true);
    perform set_config('test.r_' || r.cle, (select b.id::text from public.book_appointment(v_org, v_id,
      pg_temp.type_f(r.type_code), pg_temp.a(0, r.heure::time),
      p_note => case when r.cle = 'khady' then 'Implant posé' end, p_confirm => true) b), true);
  end loop;
  raise notice 'OK : 5 rendez-vous demain (3 PF, 2 vaccinations sur un téléphone partagé)';
end $$;

-- -----------------------------------------------------------------------------
-- Rappels de la veille
-- -----------------------------------------------------------------------------
do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_code text;
  v_ids  uuid[];
  v_l    record;
begin
  foreach v_code in array array['0a', '0c', '09', '06'] loop
    perform pg_temp.en_tant_que(v_code);
    select array_agg(appointment_id order by starts_at) into v_ids
      from public.appointments_to_remind(v_org);
    if v_ids <> array[current_setting('test.r_khady')::uuid, current_setting('test.r_modou')::uuid,
                      current_setting('test.r_aida')::uuid] then
      raise exception 'ÉCHEC : rappels du rôle % : %', v_code, v_ids;
    end if;
    select * into v_l from public.appointments_to_remind(v_org)
     where appointment_id = current_setting('test.r_khady')::uuid;
    if v_l.patient_label <> 'un rendez-vous au poste de santé F' or v_l.file_number is null
       or v_l.patient_sex is distinct from 'F' then
      raise exception 'ÉCHEC : message de rappel de la PF : %', v_l;
    end if;
    if v_code in ('09', '06') and (v_l.type_label <> 'Consultation' or v_l.is_discreet) then
      raise exception 'ÉCHEC : PF nommée dans les rappels du rôle % : %', v_code, v_l;
    end if;
  end loop;
  raise notice 'OK : rappels : PF seulement sur le téléphone de la patiente (ni conjoint, ni titulaire inconnu), pour tous les rôles ; message et libellé neutres';
end $$;

-- « Rappel fait » et « Confirmé par le patient » par l'accueil.
select pg_temp.en_tant_que('09');
do $$
declare
  v_n integer;
  v_l record;
begin
  select count(*) into v_n from public.set_appointment_reminder(
    array[current_setting('test.r_modou')::uuid, current_setting('test.r_aida')::uuid], true)
   where reminder_done_at is not null;
  if v_n <> 2 then
    raise exception 'ÉCHEC : rappel fait pour la famille (%)', v_n;
  end if;
  select * into v_l from public.appointments_to_remind(current_setting('test.org')::uuid)
   where appointment_id = current_setting('test.r_aida')::uuid;
  if v_l.reminder_done_at is null or v_l.reminder_done_by_name <> 'Test 09' then
    raise exception 'ÉCHEC : rappel fait non relu : %', v_l;
  end if;
  -- Rendez-vous exclu des rappels (PF sur le téléphone du mari) : pour l'accueil, qui ne
  -- voit pas le vrai type, accepté comme un autre (un refus révélerait la PF, étape 14 C) ;
  -- il ne figure toujours pas dans sa liste.
  perform public.set_appointment_reminder(array[current_setting('test.r_awa')::uuid], true);
  if exists (select 1 from public.appointments_to_remind(current_setting('test.org')::uuid)
              where appointment_id = current_setting('test.r_awa')::uuid) then
    raise exception 'ÉCHEC : PF sur le téléphone du mari dans les rappels';
  end if;
  -- Pour un soignant habilité : refusé comme s'il n'existait pas.
  perform pg_temp.en_tant_que('0c');
  begin
    perform public.set_appointment_reminder(array[current_setting('test.r_awa')::uuid], true);
    raise exception 'ÉCHEC : rappel coché pour une PF sur le téléphone du mari';
  exception when insufficient_privilege then
    if sqlerrm <> 'Rendez-vous introuvable.' then raise; end if;
  end;
  perform pg_temp.en_tant_que('09');
  -- Décocher.
  perform public.set_appointment_reminder(array[current_setting('test.r_aida')::uuid], false);
  if (pg_temp.rdv(current_setting('test.r_aida')::uuid)).reminder_done_at is not null
     or (pg_temp.rdv(current_setting('test.r_aida')::uuid)).reminder_done_by is not null then
    raise exception 'ÉCHEC : rappel décoché';
  end if;
  -- Confirmé par le patient.
  perform public.set_appointment_status(current_setting('test.r_modou')::uuid, 'confirmed');
  if (pg_temp.rdv(current_setting('test.r_modou')::uuid)).status <> 'confirmed' then
    raise exception 'ÉCHEC : confirmation par le patient';
  end if;
  raise notice 'OK : accueil : rappel fait pour un téléphone (tous ses rendez-vous), décoché ; PF exclue : « introuvable » ; confirmé par le patient';
end $$;

-- Le comptable n'a pas l'agenda.
select pg_temp.en_tant_que('05');
do $$
begin
  perform public.appointments_to_remind(current_setting('test.org')::uuid);
  raise exception 'ÉCHEC : le comptable lit les rappels';
exception when insufficient_privilege then
  begin
    perform public.list_patient_appointments(current_setting('test.p_khady')::uuid);
    raise exception 'ÉCHEC : le comptable lit les rendez-vous d''un patient';
  exception when insufficient_privilege then
    raise notice 'OK : comptable : ni rappels, ni rendez-vous d''un patient';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Annulation : motif obligatoire, masqué pour un type discret
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_a     public.appointments;
  v_motif text;
begin
  foreach v_motif in array array[null, '', '   '] loop
    begin
      perform public.set_appointment_status(current_setting('test.r_binta')::uuid, 'cancelled',
                                            v_motif);
      raise exception 'ÉCHEC : annulation sans motif';
    exception when invalid_parameter_value then
      if sqlerrm <> 'Indiquez le motif de l''annulation.' then raise; end if;
    end;
  end loop;
  v_a := public.set_appointment_status(current_setting('test.r_binta')::uuid, 'cancelled',
                                       '  Patient en voyage ');
  if v_a.status <> 'cancelled' or v_a.cancel_reason is not null or v_a.series_id is not null
     or (pg_temp.rdv(v_a.id)).cancel_reason <> 'Patient en voyage' then
    raise exception 'ÉCHEC : annulation d''une PF par l''accueil : %', v_a;
  end if;
  raise notice 'OK : annulation : motif obligatoire (vide refusé), gardé sans espaces, masqué à l''accueil pour une PF';
end $$;

-- -----------------------------------------------------------------------------
-- Arrivée d'une PF masquée : file du vrai type
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
begin
  perform set_config('test.r_jour', (select b.id::text from public.book_appointment(
    current_setting('test.org')::uuid, current_setting('test.p_khady')::uuid, pg_temp.type_f('pf'),
    (current_setting('test.a')::date + time '07:30') at time zone 'Africa/Dakar',
    p_confirm => true) b), true);
end $$;
select pg_temp.en_tant_que('09');
do $$
declare
  v_l record;
  v_v public.visits;
begin
  select * into v_l from public.list_appointments(current_setting('test.org')::uuid,
    current_setting('test.a')::date, current_setting('test.a')::date)
   where id = current_setting('test.r_jour')::uuid;
  -- L'application envoie la file du type qu'elle voit (Consultation).
  v_v := public.arrive_appointment(v_l.id, pg_temp.file_f('consultation'), 'normal');
  if v_v.queue_service_id <> pg_temp.file_f('pf') or pg_temp.file_f('pf') = pg_temp.file_f('consultation')
     or (pg_temp.rdv(v_l.id)).status <> 'arrived' then
    raise exception 'ÉCHEC : PF masquée entrée dans la file envoyée : %', v_v;
  end if;
  raise notice 'OK : arrivée d''une PF par l''accueil : file « % » du vrai type, file envoyée ignorée',
    (select label from public.queue_services where id = v_v.queue_service_id);
end $$;

-- -----------------------------------------------------------------------------
-- Séries contrôlées date par date
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
begin
  perform public.check_appointment_series(current_setting('test.org')::uuid,
    current_setting('test.p_khady')::uuid, pg_temp.type_f('pf'),
    jsonb_build_array(jsonb_build_object('starts_at', pg_temp.a(30, '09:00')),
                      jsonb_build_object('starts_at', pg_temp.a(120, '09:00'))));
  raise exception 'ÉCHEC : l''accueil contrôle une série de PF';
exception when insufficient_privilege then
  begin
    perform public.book_appointment_series(current_setting('test.org')::uuid,
      current_setting('test.p_khady')::uuid, pg_temp.type_f('pf'),
      jsonb_build_array(jsonb_build_object('starts_at', pg_temp.a(30, '09:00')),
                        jsonb_build_object('starts_at', pg_temp.a(120, '09:00'))), p_confirm => true);
    raise exception 'ÉCHEC : l''accueil prend une série de PF';
  exception when insufficient_privilege then
    raise notice 'OK : accueil : contrôle et prise d''une série de PF refusés';
  end;
end $$;

select pg_temp.en_tant_que('0c');
do $$
declare
  v_org   uuid := current_setting('test.org')::uuid;
  v_p     uuid := current_setting('test.p_khady')::uuid;
  v_ctrl  jsonb;
  v_items jsonb;
  v_n     integer;
begin
  -- Séance PF de D + 14 occupée par une autre patiente.
  perform public.book_appointment(v_org, current_setting('test.p_awa')::uuid, pg_temp.type_f('pf'),
    pg_temp.a(14, '08:00'), p_confirm => true);
  -- D + 7 : férié ; D + 14 : séance pleine ; deux dates le même jour.
  v_items := jsonb_build_array(
    jsonb_build_object('starts_at', pg_temp.a(7, '11:00')),
    jsonb_build_object('starts_at', pg_temp.a(14, '08:30')),
    jsonb_build_object('starts_at', pg_temp.a(21, '11:00')),
    jsonb_build_object('starts_at', pg_temp.a(21, '15:00')));
  v_ctrl := public.check_appointment_series(v_org, v_p, pg_temp.type_f('pf'), v_items);
  if jsonb_array_length(v_ctrl) <> 4
     or not (v_ctrl -> 0 -> 'warnings') @> '[{"code": "holiday"}]'
     or jsonb_array_length(v_ctrl -> 0 -> 'blocking') <> 0
     or not (v_ctrl -> 1 -> 'blocking') @> '[{"code": "full"}]'
     or (v_ctrl -> 1 ->> 'session_id')::uuid <> current_setting('test.seance_pf')::uuid
     or jsonb_array_length(v_ctrl -> 2 -> 'blocking') <> 0
     or not (v_ctrl -> 3 -> 'blocking') @> '[{"code": "series_same_day"}]'
     or coalesce(current_setting('fajkat.hors_seance', true), '') <> '' then
    raise exception 'ÉCHEC : contrôle de la série : %', v_ctrl;
  end if;
  raise notice 'OK : contrôle date par date : jour férié à confirmer, séance pleine refusée, deux dates le même jour refusées';

  -- Tout ou rien : une date refusée, aucune n'est prise.
  select count(*) into v_n from public.appointments where patient_id = v_p and series_id is not null;
  begin
    perform public.book_appointment_series(v_org, v_p, pg_temp.type_f('pf'), v_items, p_confirm => true);
    raise exception 'ÉCHEC : série prise malgré une date refusée';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.appointments where patient_id = v_p and series_id is not null) <> v_n then
    raise exception 'ÉCHEC : une partie de la série a été prise';
  end if;

  -- Dates corrigées : D + 14 hors séance (pleine, à confirmer), D + 21 une seule fois.
  v_items := jsonb_build_array(
    jsonb_build_object('starts_at', pg_temp.a(7, '11:00')),
    jsonb_build_object('starts_at', pg_temp.a(14, '10:30'), 'outside_session', true),
    jsonb_build_object('starts_at', pg_temp.a(21, '11:00')));
  begin
    perform public.book_appointment_series(v_org, v_p, pg_temp.type_f('pf'), v_items);
    raise exception 'ÉCHEC : série avec un jour férié prise sans confirmation';
  exception when invalid_parameter_value then
    if sqlerrm !~ 'jour férié' then raise; end if;
  end;
  perform public.book_appointment_series(v_org, v_p, pg_temp.type_f('pf'), v_items,
                                        p_note => 'Contrôle tension', p_confirm => true);
  if (select count(*) from public.appointments
       where patient_id = v_p and series_id is not null and appointment_type_id = pg_temp.type_f('pf')) <> 3
     or (select count(distinct series_id) from public.appointments
          where patient_id = v_p and series_id is not null) <> 1
     or (select array_agg(series_index order by starts_at) from public.appointments
          where patient_id = v_p and series_id is not null) <> array[1, 2, 3]::smallint[]
     or (select bool_and(holiday_confirmed = (local_date = current_setting('test.d')::date + 7))
           from public.appointments where patient_id = v_p and series_id is not null) is not true
     or exists (select 1 from public.appointments
                 where patient_id = v_p and series_id is not null and session_id is not null)
     or coalesce(current_setting('fajkat.hors_seance', true), '') <> '' then
    raise exception 'ÉCHEC : série corrigée et confirmée';
  end if;
  raise notice 'OK : série : tout ou rien, jour férié confirmé, hors séance pour une date, même série numérotée 1 à 3';
end $$;

-- -----------------------------------------------------------------------------
-- Séries masquées et rendez-vous du patient
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_p     uuid := current_setting('test.p_khady')::uuid;
  v_texte text;
  v_l     record;
  v_neuf  public.appointments;
begin
  select string_agg(l::text, ' ') into v_texte from public.list_patient_appointments(v_p) l;
  if (select count(*) from public.list_patient_appointments(v_p)) <> 5
     or exists (select 1 from public.list_patient_appointments(v_p)
                 where series_id is not null or series_index is not null or note is not null
                    or is_discreet or type_label <> 'Consultation')
     or v_texte ~ pg_temp.type_f('pf')::text or v_texte ~* 'implant|tension|planification' then
    raise exception 'ÉCHEC : rendez-vous de la patiente vus par l''accueil : %', v_texte;
  end if;
  if (select count(*) from public.list_appointments(current_setting('test.org')::uuid,
        current_setting('test.d')::date + 7, current_setting('test.d')::date + 21)
       where patient_id = v_p) <> 3
     or exists (select 1 from public.list_appointments(current_setting('test.org')::uuid,
        current_setting('test.d')::date + 7, current_setting('test.d')::date + 21)
       where patient_id = v_p
         and (series_id is not null or series_index is not null or source_ref is not null)) then
    raise exception 'ÉCHEC : série visible dans l''agenda de l''accueil';
  end if;
  select * into v_l from public.list_patient_appointments(v_p) where local_date = current_setting('test.d')::date + 21;
  v_neuf := public.reschedule_appointment(v_l.id, pg_temp.a(22, '11:00'), p_confirm => true);
  if v_neuf.series_id is not null or v_neuf.series_index is not null
     or (pg_temp.rdv(v_neuf.id)).series_index <> 3 then
    raise exception 'ÉCHEC : report d''un rendez-vous de série par l''accueil : %', v_neuf;
  end if;
  raise notice 'OK : accueil : ni série, ni note, ni type PF (fiche, agenda, report) ; la base garde la série';
end $$;

select pg_temp.en_tant_que('0c');
do $$
declare
  v_p uuid := current_setting('test.p_khady')::uuid;
  v_s jsonb;
begin
  if (select count(*) from public.list_patient_appointments(v_p)
       where series_index is not null and type_label = 'Planification familiale') <> 4
     or not exists (select 1 from public.list_patient_appointments(v_p) where note = 'Implant posé')
     or (select status from public.list_patient_appointments(v_p) where ticket_number is not null) <> 'arrived' then
    raise exception 'ÉCHEC : rendez-vous de la patiente vus par l''infirmier';
  end if;
  v_s := public.patient_appointment_stats(v_p);
  raise notice 'OK : infirmier : vrai type, série, note et ticket du passage (stats : %)', v_s;
end $$;

reset role;
rollback;
