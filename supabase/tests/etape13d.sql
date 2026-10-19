-- =============================================================================
-- Tests — étape 13, partie C (garde-fous des séances)
-- -----------------------------------------------------------------------------
-- Vérifie : deux séances du même type qui se chevauchent le même jour sont refusées
-- (création et modification), sauf en clinique pour deux praticiens différents ; une
-- séance qui a des rendez-vous à venir ne change ni de type, ni de jour, ni d'horaires
-- qui les laisseraient dehors, ni de capacité sous le nombre pris ; elle peut être
-- retirée (ses rendez-vous restent prévus) ; sans rendez-vous à venir, tout est permis.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13d.sql
-- Prérequis : migrations des étapes 3 à 13 appliquées (dont etape13d_seances).
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a13d-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13d-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0e', '0f']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13d-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé D', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13d-00000000000b", "role": "authenticated"}', true);
select set_config('test.clinique',
  public.create_organization('Clinique D', 'clinique', 'SN', 'Dakar')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.clinique')::uuid, ('00000000-0000-4000-a13d-0000000000' || c)::uuid,
       'medecin', true
  from unnest(array['0e', '0f']) c;
update public.holidays set deleted_at = now()
 where org_id in (current_setting('test.org')::uuid, current_setting('test.clinique')::uuid);
-- Prochain mardi, jamais aujourd'hui.
select set_config('test.mardi', (public.org_local_date(current_setting('test.org')::uuid)
  + coalesce(nullif((9 - extract(isodow from public.org_local_date(current_setting('test.org')::uuid))::integer) % 7, 0), 7))::text, true);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a13d-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.type_d(p_org uuid, p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types where org_id = p_org and template_code = p_code;
$$;
-- Message du refus attendu (22023), ou null si l'instruction passe.
create function pg_temp.refus(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when invalid_parameter_value then
  return sqlerrm;
end;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.type_d(uuid, text),
  pg_temp.refus(text) to authenticated;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Chevauchement (poste)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_vac uuid := pg_temp.type_d(current_setting('test.org')::uuid, 'vaccination');
  v_id  uuid;
  v_m   text;
begin
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time, capacity)
  values (v_org, v_vac, 2, '08:00', '12:00', 40) returning id into v_id;
  perform set_config('test.seance', v_id::text, true);

  v_m := pg_temp.refus(format(
    'insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time)
     values (%L, %L, 2, %L, %L)', v_org, v_vac, '08:00', '12:00'));
  if v_m is null or v_m !~ 'existe déjà le mardi de 08:00 à 12:00' then
    raise exception 'ÉCHEC : deux séances Vaccination le mardi 08:00 – 12:00 : %', v_m;
  end if;
  if pg_temp.refus(format(
       'insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time)
        values (%L, %L, 2, %L, %L)', v_org, v_vac, '11:00', '13:00')) is null then
    raise exception 'ÉCHEC : chevauchement partiel accepté';
  end if;
  raise notice 'OK : séances qui se chevauchent refusées (%)', v_m;

  -- Bout à bout, autre jour, autre type : acceptés.
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time)
  values (v_org, v_vac, 2, '12:00', '14:00') returning id into v_id;
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time)
  values (v_org, v_vac, 4, '08:00', '12:00'),
         (v_org, pg_temp.type_d(v_org, 'cpn'), 2, '08:00', '12:00');
  -- Modification qui crée un chevauchement : refusée ; une séance retirée ne compte pas.
  if pg_temp.refus(format('update public.appointment_sessions set start_time = %L where id = %L',
                          '10:00', v_id)) is null then
    raise exception 'ÉCHEC : chevauchement créé par une modification';
  end if;
  update public.appointment_sessions set is_active = false where id = v_id;
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time)
  values (v_org, v_vac, 2, '12:00', '14:00') returning id into v_id;
  if pg_temp.refus(format('update public.appointment_sessions set is_active = true
                            where appointment_type_id = %L and weekday = 2 and start_time = %L
                              and not is_active', v_vac, '12:00')) is null then
    raise exception 'ÉCHEC : séance remise alors qu''elle chevauche une autre';
  end if;
  raise notice 'OK : bout à bout, autre jour, autre type acceptés ; modification et remise contrôlées';
end $$;

-- -----------------------------------------------------------------------------
-- Clinique : deux praticiens différents, chacun sa séance
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0b');
do $$
declare
  v_org uuid := current_setting('test.clinique')::uuid;
  v_typ uuid := pg_temp.type_d(current_setting('test.clinique')::uuid, 'consultation');
  v_e   uuid := (select id from public.memberships where org_id = current_setting('test.clinique')::uuid
                  and user_id = '00000000-0000-4000-a13d-00000000000e');
  v_f   uuid := (select id from public.memberships where org_id = current_setting('test.clinique')::uuid
                  and user_id = '00000000-0000-4000-a13d-00000000000f');
begin
  insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                           end_time, practitioner_membership_id)
  values (v_org, v_typ, 1, '08:00', '12:00', v_e), (v_org, v_typ, 1, '08:00', '12:00', v_f);
  if pg_temp.refus(format(
       'insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
          end_time, practitioner_membership_id) values (%L, %L, 1, %L, %L, %L)',
       v_org, v_typ, '10:00', '11:00', v_e)) is null
     or pg_temp.refus(format(
       'insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
          end_time) values (%L, %L, 1, %L, %L)', v_org, v_typ, '10:00', '11:00')) is null then
    raise exception 'ÉCHEC : même praticien, ou séance ouverte à tous, qui chevauche acceptée';
  end if;
  raise notice 'OK : clinique : deux praticiens différents acceptés ; même praticien ou séance sans praticien refusés';
end $$;

-- -----------------------------------------------------------------------------
-- Séance avec des rendez-vous à venir
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_s   uuid := current_setting('test.seance')::uuid;
  v_p   uuid;
  i     integer;
  v_m   text;
begin
  for i in 0 .. 2 loop
    insert into public.patients (org_id, last_name, first_name, sex, declared_age)
    values (v_org, 'Seance', 'Enfant ' || i, 'F', 1) returning id into v_p;
    perform public.book_appointment(v_org, v_p, pg_temp.type_d(v_org, 'vaccination'),
      (current_setting('test.mardi')::date + time '08:00' + make_interval(mins => 20 * i))
        at time zone 'Africa/Dakar', p_confirm => true);
  end loop;
  if (select count(*) from public.appointments where session_id = v_s) <> 3 then
    raise exception 'ÉCHEC : rendez-vous non rattachés à la séance';
  end if;

  v_m := pg_temp.refus(format('update public.appointment_sessions set appointment_type_id = %L where id = %L',
                              pg_temp.type_d(v_org, 'soins'), v_s));
  if v_m is distinct from 'Cette séance a 3 rendez-vous à venir : déplacez-les avant de changer son type.' then
    raise exception 'ÉCHEC : type changé malgré 3 rendez-vous : %', v_m;
  end if;
  raise notice 'OK : %', v_m;
  v_m := pg_temp.refus(format('update public.appointment_sessions set weekday = 5 where id = %L', v_s));
  if v_m !~ 'changer son jour' then
    raise exception 'ÉCHEC : jour changé malgré les rendez-vous : %', v_m;
  end if;
  v_m := pg_temp.refus(format('update public.appointment_sessions set start_time = %L where id = %L', '08:30', v_s));
  if v_m !~ '2 rendez-vous à venir hors des nouveaux horaires \(le premier : 08:00' then
    raise exception 'ÉCHEC : horaires qui laissent des rendez-vous dehors : %', v_m;
  end if;
  v_m := pg_temp.refus(format('update public.appointment_sessions set capacity = 2 where id = %L', v_s));
  if v_m !~ 'déjà 3 rendez-vous le .* sous 3' then
    raise exception 'ÉCHEC : capacité sous le nombre pris : %', v_m;
  end if;
  raise notice 'OK : jour, horaires et capacité protégés (%)', v_m;

  -- Contournement : retirer, changer le type pendant le retrait, remettre. Refusé.
  update public.appointment_sessions set is_active = false where id = v_s;
  v_m := pg_temp.refus(format('update public.appointment_sessions set appointment_type_id = %L where id = %L',
                              pg_temp.type_d(v_org, 'soins'), v_s));
  if v_m !~ 'changer son type' then
    raise exception 'ÉCHEC : type changé pendant le retrait de la séance : %', v_m;
  end if;
  if pg_temp.refus(format('update public.appointment_sessions set capacity = 1, weekday = 5 where id = %L', v_s)) is null
     or pg_temp.refus(format('update public.appointment_sessions set deleted_at = now(), start_time = %L where id = %L',
                             '09:00', v_s)) is null then
    raise exception 'ÉCHEC : jour, capacité ou horaires changés pendant le retrait';
  end if;
  update public.appointment_sessions set is_active = true where id = v_s;
  if (select appointment_type_id from public.appointment_sessions where id = v_s)
     <> pg_temp.type_d(v_org, 'vaccination') then
    raise exception 'ÉCHEC : la séance remise a changé de type';
  end if;
  raise notice 'OK : séance retirée : type, jour, horaires et capacité toujours protégés (%)', v_m;

  -- Ce qui garde les rendez-vous dedans reste permis.
  update public.appointment_sessions set end_time = '11:30', capacity = 3, label = 'Séance du mardi'
   where id = v_s;
  -- Retrait : permis ; les rendez-vous restent prévus.
  update public.appointment_sessions set is_active = false where id = v_s;
  if (select count(*) from public.appointments where session_id = v_s and status = 'scheduled') <> 3 then
    raise exception 'ÉCHEC : rendez-vous touchés par le retrait de la séance';
  end if;
  update public.appointment_sessions set is_active = true where id = v_s;
  raise notice 'OK : horaires élargis, capacité égale et retrait permis ; les rendez-vous restent prévus';

  -- Rendez-vous annulés : plus rien à protéger.
  perform public.set_appointment_status(a.id, 'cancelled') from public.appointments a where a.session_id = v_s;
  update public.appointment_sessions set appointment_type_id = pg_temp.type_d(v_org, 'soins') where id = v_s;
  raise notice 'OK : sans rendez-vous à venir, le type peut changer';
end $$;

reset role;

rollback;
