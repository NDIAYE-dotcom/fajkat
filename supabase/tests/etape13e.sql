-- =============================================================================
-- Tests — étape 13, partie D (prise de rendez-vous, types discrets, file « Sage-femme »)
-- -----------------------------------------------------------------------------
-- Vérifie : l'accueil et le caissier ne prennent pas un type discret (prise, contrôle,
-- suivi, prochaines séances) et ne lisent pas ses rendez-vous dans la table ; report d'un
-- rendez-vous discret masqué par l'accueil : vrai type gardé, séance du vrai type, séance
-- envoyée ignorée ; contrôle d'un report sur le vrai type ; aucun UPDATE direct ; trigger
-- de garde du type (variable de transaction + rôle médical) ; set_appointment_type
-- réservé aux soignants (séance et durée du nouveau type, ancien type dans l'audit,
-- variable remise à vide) ; next_available_sessions (séance pleine et jour férié sautés,
-- places restantes, ni séance ni type pour un rendez-vous masqué) ; file « Sage-femme »
-- commune à la CPN, la PF et la consultation postnatale dans un nouveau poste.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13e.sql
-- Prérequis : migrations des étapes 3 à 13 appliquées (dont etape13e_prise).
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a13e-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13e-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0c', '06', '09']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13e-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé E', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a13e-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('06', 'caissier'), ('09', 'accueil')) v(c, r);
-- Owner qui exerce une profession soignante (is_clinician) : il voit les types discrets
-- comme un soignant (étape 14, partie C). L'owner qui n'exerce pas : etape13c.sql, etape14c.sql.
update public.memberships set is_clinician = true
 where org_id = current_setting('test.org')::uuid
   and user_id = '00000000-0000-4000-a13e-00000000000a';
-- D = demain ; fêtes fixes retirées, puis un jour férié à D + 7.
select set_config('test.d', (public.org_local_date(current_setting('test.org')::uuid) + 1)::text, true);
update public.holidays set deleted_at = now() where org_id = current_setting('test.org')::uuid;
insert into public.holidays (org_id, holiday_date, label)
values (current_setting('test.org')::uuid, current_setting('test.d')::date + 7, 'Fête de test');

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a13e-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.type_e(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
-- Heure locale du jour D + n.
create function pg_temp.a(p_jours integer, p_heure time) returns timestamptz language sql as $$
  select ((current_setting('test.d')::date + p_jours) + p_heure) at time zone 'Africa/Dakar';
$$;
create function pg_temp.rdv(p_id uuid) returns public.appointments language sql security definer as $$
  select * from public.appointments where id = p_id;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.type_e(text),
  pg_temp.a(integer, time), pg_temp.rdv(uuid) to authenticated;

-- Séances du jour de la semaine de D : PF 08:00 – 10:00 (1 place), consultation
-- 08:00 – 12:00 (10 places).
insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                         end_time, capacity)
select current_setting('test.org')::uuid, pg_temp.type_e(t), extract(isodow from current_setting('test.d')::date),
       '08:00', f, c
  from (values ('pf', time '10:00', 1), ('consultation', time '12:00', 10)) v(t, f, c);
select set_config('test.seance_pf', (select id::text from public.appointment_sessions
  where org_id = current_setting('test.org')::uuid and appointment_type_id = pg_temp.type_e('pf')), true);
select set_config('test.seance_consult', (select id::text from public.appointment_sessions
  where org_id = current_setting('test.org')::uuid
    and appointment_type_id = pg_temp.type_e('consultation')), true);

set local role authenticated;

-- Patientes, et une PF à D 08:00 prise par l'owner qui exerce (séance PF pleine à D).
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_p   uuid;
  v_q   uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Ndiaye', 'Awa', 'F', 27) returning id into v_p;
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Sow', 'Khady', 'F', 34) returning id into v_q;
  perform set_config('test.p', v_p::text, true);
  perform set_config('test.q', v_q::text, true);
  perform set_config('test.pf1', (select id::text from public.book_appointment(v_org, v_p,
    pg_temp.type_e('pf'), pg_temp.a(0, '08:00'), p_confirm => true)), true);
  perform set_config('test.pf3', (select id::text from public.book_appointment(v_org, v_q,
    pg_temp.type_e('pf'), pg_temp.a(21, '08:00'), p_confirm => true)), true);
  raise notice 'OK : l''owner qui exerce prend un rendez-vous de planification familiale';
end $$;

-- -----------------------------------------------------------------------------
-- Accueil et caissier : aucun type discret pris, aucun rendez-vous discret lu en table
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
  v_org  uuid := current_setting('test.org')::uuid;
begin
  foreach v_code in array array['09', '06'] loop
    perform pg_temp.en_tant_que(v_code);
    begin
      perform public.book_appointment(v_org, current_setting('test.q')::uuid,
        pg_temp.type_e('pf'), pg_temp.a(1, '09:00'), p_confirm => true);
      raise exception 'ÉCHEC : le rôle % prend une PF', v_code;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.check_appointment(v_org, current_setting('test.q')::uuid,
        pg_temp.type_e('depistage'), pg_temp.a(1, '09:00'));
      raise exception 'ÉCHEC : le rôle % contrôle un dépistage', v_code;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.schedule_followup(current_setting('test.q')::uuid, 'pf',
        current_setting('test.d')::date + 2, 'test');
      raise exception 'ÉCHEC : le rôle % programme un suivi PF', v_code;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.next_available_sessions(v_org, pg_temp.type_e('pf'));
      raise exception 'ÉCHEC : le rôle % cherche les séances PF', v_code;
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from public.appointments where org_id = v_org) then
      raise exception 'ÉCHEC : le rôle % lit un rendez-vous discret dans la table', v_code;
    end if;
  end loop;
  perform pg_temp.en_tant_que('0a');
  if (select count(*) from public.appointments where org_id = v_org) <> 2 then
    raise exception 'ÉCHEC : l''owner ne lit pas les rendez-vous discrets';
  end if;
  raise notice 'OK : accueil et caissier : prise, contrôle, suivi et séances d''un type discret refusés ; ses rendez-vous absents de la table';
end $$;

-- -----------------------------------------------------------------------------
-- Report par l'accueil d'une PF masquée : comme une consultation (étape 14, partie C) :
-- vrai type et durée gardés, aucune séance, aucun contrôle de places
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org   uuid := current_setting('test.org')::uuid;
  v_neuf  public.appointments;
  v_l     record;
  v_ctrl  jsonb;
begin
  select * into v_l from public.list_appointments(v_org, current_setting('test.d')::date,
                                                  current_setting('test.d')::date);
  if v_l.type_label <> 'Consultation' or v_l.appointment_type_id <> pg_temp.type_e('consultation') then
    raise exception 'ÉCHEC : la PF n''est pas masquée sous « Consultation » : %', v_l;
  end if;
  -- L'application envoie ce qu'elle voit : la séance de consultation.
  v_neuf := public.reschedule_appointment(current_setting('test.pf1')::uuid, pg_temp.a(14, '08:30'),
    p_session_id => current_setting('test.seance_consult')::uuid, p_confirm => true);
  -- Ligne renvoyée à l'accueil : type visible (Consultation), aucune séance.
  if v_neuf.appointment_type_id <> pg_temp.type_e('consultation') or v_neuf.session_id is not null
     or v_neuf::text ~ pg_temp.type_e('pf')::text
     or v_neuf::text ~ current_setting('test.seance_pf') then
    raise exception 'ÉCHEC : reschedule_appointment renvoie le vrai type ou la séance : %', v_neuf;
  end if;
  v_neuf := pg_temp.rdv(v_neuf.id);
  if v_neuf.appointment_type_id <> pg_temp.type_e('pf')
     or v_neuf.session_id is not null
     or v_neuf.ends_at - v_neuf.starts_at
        <> make_interval(mins => (select duration_minutes from public.appointment_types
                                   where id = pg_temp.type_e('pf')))
     or (pg_temp.rdv(current_setting('test.pf1')::uuid)).appointment_type_id <> pg_temp.type_e('pf') then
    raise exception 'ÉCHEC : report masqué : type, séance ou durée : %', v_neuf;
  end if;
  perform set_config('test.pf1b', v_neuf.id::text, true);
  raise notice 'OK : report par l''accueil : type PF et durée gardés, hors séance, séance envoyée ignorée';

  -- Contrôle d'un report (PF de D + 21) vers D + 14, où la séance PF est pleine : réponse
  -- d'une consultation (aucun « séance pleine », rien de la PF).
  v_ctrl := public.check_appointment(v_org, current_setting('test.p')::uuid,
    pg_temp.type_e('consultation'), pg_temp.a(14, '09:00'),
    p_session_id => current_setting('test.seance_consult')::uuid,
    p_exclude_id => current_setting('test.pf3')::uuid);
  if (v_ctrl -> 0 -> 'blocking') @> '[{"code": "full"}]'
     or v_ctrl::text ~* 'planification|pleine'
     or v_ctrl -> 0 -> 'session_id' <> 'null'::jsonb
     or v_ctrl::text ~ current_setting('test.seance_pf')
     or v_ctrl::text ~ pg_temp.type_e('pf')::text then
    raise exception 'ÉCHEC : contrôle du report comme une consultation : %', v_ctrl;
  end if;
  raise notice 'OK : contrôle d''un report masqué : comme une consultation, aucune séance pleine ni PF (%)', v_ctrl;
end $$;

-- -----------------------------------------------------------------------------
-- Prochaines séances : pleine et jour férié sautés, rien de la séance si masqué
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_r   record;
  v_n   integer;
begin
  perform pg_temp.en_tant_que('0c');
  -- D : libre (la PF a été reportée) ; D + 7 : férié ; D + 14 : libre (la PF reportée par
  -- l'accueil l'est hors séance, étape 14 C) ; D + 21 : prise.
  select array_agg(local_date order by local_date) as jours,
         array_agg(places_left order by local_date) as places,
         bool_and(session_id = current_setting('test.seance_pf')::uuid) as seance
    into v_r
    from public.next_available_sessions(v_org, pg_temp.type_e('pf'),
           p_from => current_setting('test.d')::date, p_limit => 2);
  if v_r.jours <> array[current_setting('test.d')::date, current_setting('test.d')::date + 14]
     or v_r.places <> array[1, 1] or not v_r.seance then
    raise exception 'ÉCHEC : prochaines séances PF : %', v_r;
  end if;
  raise notice 'OK : prochaines séances : jour férié sauté ; séance de D + 14 libre (report masqué hors séance)';

  -- Accueil : les prochaines séances d'une PF masquée sont celles d'une consultation.
  perform pg_temp.en_tant_que('09');
  if (select array_agg(row(local_date, start_time, end_time, places_left, session_id)::text order by starts_at)
        from public.next_available_sessions(v_org, p_appointment_id => current_setting('test.pf3')::uuid,
               p_from => current_setting('test.d')::date + 1, p_limit => 3))
     is distinct from
     (select array_agg(row(local_date, start_time, end_time, places_left, session_id)::text order by starts_at)
        from public.next_available_sessions(v_org, pg_temp.type_e('consultation'),
               p_from => current_setting('test.d')::date + 1, p_limit => 3)) then
    raise exception 'ÉCHEC : prochaines séances d''une PF masquée différentes d''une consultation';
  end if;
  if exists (select 1 from public.next_available_sessions(v_org,
               p_appointment_id => current_setting('test.pf3')::uuid,
               p_from => current_setting('test.d')::date + 1, p_limit => 10)
              where session_id = current_setting('test.seance_pf')::uuid) then
    raise exception 'ÉCHEC : séance PF proposée pour une PF masquée';
  end if;
  raise notice 'OK : PF masquée : prochaines séances d''une consultation, rien de la séance PF';
end $$;

-- -----------------------------------------------------------------------------
-- Aucun UPDATE direct ; trigger de garde du type
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
begin
  update public.appointments set appointment_type_id = pg_temp.type_e('consultation')
   where id = current_setting('test.pf3')::uuid;
  raise exception 'ÉCHEC : UPDATE direct permis à authenticated';
exception when insufficient_privilege then
  raise notice 'OK : aucun UPDATE direct sur appointments pour authenticated (%)', sqlerrm;
end $$;

reset role;
do $$
declare
  v_r text;
begin
  -- Sans la variable de set_appointment_type : refusé, même en propriétaire de la base.
  begin
    update public.appointments set appointment_type_id = pg_temp.type_e('consultation')
     where id = current_setting('test.pf3')::uuid;
    raise exception 'ÉCHEC : type changé sans set_appointment_type';
  exception when insufficient_privilege then
    get stacked diagnostics v_r = message_text;
  end;
  -- Variable posée, mais par un rôle non médical : refusé.
  perform pg_temp.en_tant_que('09');
  perform set_config('fajkat.changement_type_rdv', current_setting('test.pf3'), true);
  begin
    update public.appointments set appointment_type_id = pg_temp.type_e('consultation')
     where id = current_setting('test.pf3')::uuid;
    raise exception 'ÉCHEC : type changé par l''accueil avec la variable posée';
  exception when insufficient_privilege then null;
  end;
  -- Variable d'un autre rendez-vous, rôle médical : refusé.
  perform pg_temp.en_tant_que('0c');
  perform set_config('fajkat.changement_type_rdv', current_setting('test.pf1b'), true);
  begin
    update public.appointments set appointment_type_id = pg_temp.type_e('consultation')
     where id = current_setting('test.pf3')::uuid;
    raise exception 'ÉCHEC : variable d''un autre rendez-vous acceptée';
  exception when insufficient_privilege then null;
  end;
  perform set_config('fajkat.changement_type_rdv', '', true);
  raise notice 'OK : trigger : type inchangeable hors set_appointment_type (%)', v_r;
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- set_appointment_type : soignants seulement
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_c   uuid;
begin
  -- L'accueil prend une consultation à D + 28, 09:00.
  select id into v_c from public.book_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('consultation'), pg_temp.a(28, '09:00'), p_confirm => true);
  perform set_config('test.c', v_c::text, true);
  begin
    perform public.set_appointment_type(v_c, pg_temp.type_e('soins'));
    raise exception 'ÉCHEC : l''accueil change le type';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.en_tant_que('06');
  begin
    perform public.set_appointment_type(v_c, pg_temp.type_e('soins'));
    raise exception 'ÉCHEC : le caissier change le type';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : accueil et caissier ne changent pas le type';
end $$;

select pg_temp.en_tant_que('0c');
do $$
declare
  v_a public.appointments;
begin
  v_a := public.set_appointment_type(current_setting('test.c')::uuid, pg_temp.type_e('pf'));
  if v_a.appointment_type_id <> pg_temp.type_e('pf')
     or v_a.session_id is distinct from current_setting('test.seance_pf')::uuid
     or v_a.ends_at - v_a.starts_at <> interval '20 minutes'
     or coalesce(current_setting('fajkat.changement_type_rdv', true), '') <> '' then
    raise exception 'ÉCHEC : changement de type par l''infirmier : %', v_a;
  end if;
  raise notice 'OK : infirmier : consultation -> PF, séance PF et durée de 20 min, variable remise à vide';
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.audit_logs
                  where table_name = 'appointments' and record_id = current_setting('test.c')
                    and action = 'UPDATE'
                    and old_data ->> 'appointment_type_id' = pg_temp.type_e('consultation')::text
                    and new_data ->> 'appointment_type_id' = pg_temp.type_e('pf')::text) then
    raise exception 'ÉCHEC : ancien type absent du journal d''audit';
  end if;
  raise notice 'OK : ancien type gardé dans le journal d''audit';
end $$;
set local role authenticated;

-- L'accueil voit toujours « Consultation » et, en reportant, garde la PF.
select pg_temp.en_tant_que('09');
do $$
declare
  v_l    record;
  v_neuf public.appointments;
begin
  select * into v_l from public.list_appointments(current_setting('test.org')::uuid,
    current_setting('test.d')::date + 28, current_setting('test.d')::date + 28)
   where id = current_setting('test.c')::uuid;
  if v_l.type_label <> 'Consultation' or v_l.session_id is not null then
    raise exception 'ÉCHEC : PF visible pour l''accueil après le changement : %', v_l;
  end if;
  v_neuf := public.reschedule_appointment(current_setting('test.c')::uuid, pg_temp.a(35, '09:00'),
    p_session_id => current_setting('test.seance_consult')::uuid, p_confirm => true);
  if (pg_temp.rdv(v_neuf.id)).appointment_type_id <> pg_temp.type_e('pf') then
    raise exception 'ÉCHEC : report par l''accueil : PF remplacée par « Consultation »';
  end if;
  raise notice 'OK : après le changement, l''accueil voit « Consultation » et son report garde la PF';
end $$;

-- -----------------------------------------------------------------------------
-- Accueil : report puis annulation d'une PF masquée ; aucune réponse ne contient l'id du
-- type PF ni celui de sa séance (ni le module d'origine, ni le motif)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org     uuid := current_setting('test.org')::uuid;
  v_type    text := pg_temp.type_e('pf')::text;
  v_seance  text := current_setting('test.seance_pf');
  v_neuf    public.appointments;
  v_annule  public.appointments;
  v_reponse text;
begin
  v_reponse := public.check_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('consultation'), pg_temp.a(42, '08:30'),
    p_exclude_id => current_setting('test.pf3')::uuid)::text;
  v_neuf := public.reschedule_appointment(current_setting('test.pf3')::uuid, pg_temp.a(42, '08:30'),
    p_confirm => true);
  v_annule := public.set_appointment_status(v_neuf.id, 'cancelled', 'Préfère l''implant');
  v_reponse := v_reponse || v_neuf::text || v_annule::text
    || (select string_agg(r::text, '') from public.next_available_sessions(v_org,
          p_appointment_id => current_setting('test.pf3')::uuid, p_limit => 3) r)
    || (select string_agg(l::text, '') from public.list_appointments(v_org,
          current_setting('test.d')::date + 42, current_setting('test.d')::date + 42) l);
  if v_reponse ~ v_type or v_reponse ~ v_seance or v_reponse ~* 'implant|planification' then
    raise exception 'ÉCHEC : réponse à l''accueil avec le type PF, sa séance ou le motif : %', v_reponse;
  end if;
  if v_annule.status <> 'cancelled' or v_annule.appointment_type_id <> pg_temp.type_e('consultation')
     or (pg_temp.rdv(v_neuf.id)).appointment_type_id <> pg_temp.type_e('pf')
     or (pg_temp.rdv(v_neuf.id)).session_id::text <> v_seance then
    raise exception 'ÉCHEC : report puis annulation : %', v_annule;
  end if;
  raise notice 'OK : accueil : contrôle, report, annulation, séances, agenda : ni type PF, ni séance PF, ni motif dans les réponses (la base garde la PF et sa séance)';
end $$;

-- Prise et suivi par l'owner qui exerce : lignes complètes (il voit les types discrets).
select pg_temp.en_tant_que('0a');
do $$
declare
  v_a public.appointments;
begin
  select * into v_a from public.book_appointment(current_setting('test.org')::uuid,
    current_setting('test.q')::uuid, pg_temp.type_e('pf'), pg_temp.a(49, '08:00'), p_confirm => true);
  if v_a.appointment_type_id <> pg_temp.type_e('pf')
     or v_a.session_id is distinct from current_setting('test.seance_pf')::uuid then
    raise exception 'ÉCHEC : l''owner reçoit une ligne masquée : %', v_a;
  end if;
  raise notice 'OK : owner : ligne complète (vrai type et séance)';
end $$;

-- -----------------------------------------------------------------------------
-- File « Sage-femme » d'un nouveau poste
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  -- Aucun modèle inactif copié : pas de file PF, même désactivée.
  if exists (select 1 from public.queue_services
              where org_id = v_org and (template_code = 'pf' or label ~* 'planification'))
     or (select count(*) from public.queue_services where org_id = v_org) <> 5
     or (select count(distinct t.queue_service_id) from public.appointment_types t
           join public.queue_services q on q.id = t.queue_service_id
          where t.org_id = v_org and t.template_code in ('cpn', 'pf', 'postnatal')
            and q.label = 'Sage-femme' and q.is_active) <> 1
     or (select count(*) from public.appointment_types
          where org_id = v_org and template_code in ('cpn', 'pf', 'postnatal')) <> 3 then
    raise exception 'ÉCHEC : file « Sage-femme » commune à la CPN, la PF et la postnatale';
  end if;
  -- L'owner peut la renommer.
  update public.queue_services set label = 'Maternité'
   where org_id = v_org and label = 'Sage-femme';
  if not exists (select 1 from public.queue_services where org_id = v_org and label = 'Maternité') then
    raise exception 'ÉCHEC : l''owner ne renomme pas la file';
  end if;
  raise notice 'OK : nouveau poste : CPN, PF et postnatale dans la file « Sage-femme », renommable par l''owner';
end $$;

-- -----------------------------------------------------------------------------
-- Hors séance volontaire pendant une séance pleine : avertissement, puis confirmation
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org  uuid := current_setting('test.org')::uuid;
  v_ctrl jsonb;
  v_a    public.appointments;
begin
  -- Séance PF de D + 14 remplie (1 place) par une PF prise par l'owner qui exerce (le
  -- report de l'accueil y est hors séance depuis l'étape 14 C). Sans « hors séance » : refusé.
  perform public.book_appointment(v_org, current_setting('test.p')::uuid, pg_temp.type_e('pf'),
    pg_temp.a(14, '08:00'), p_confirm => true);
  v_ctrl := public.check_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('pf'), pg_temp.a(14, '09:00'));
  if not (v_ctrl -> 0 -> 'blocking') @> '[{"code": "full"}]' then
    raise exception 'ÉCHEC : heure dans une séance pleine acceptée sans « hors séance » : %', v_ctrl;
  end if;
  -- Hors séance : rien de bloquant, avertissement à confirmer, aucune séance rattachée.
  v_ctrl := public.check_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('pf'), pg_temp.a(14, '09:00'), p_outside_session => true);
  if jsonb_array_length(v_ctrl -> 0 -> 'blocking') <> 0
     or not (v_ctrl -> 0 -> 'warnings') @> jsonb_build_array(jsonb_build_object('code', 'outside_full',
       'message', 'La séance de 08:00 est pleine : prendre quand même ce patient hors séance ?'))
     or v_ctrl -> 0 -> 'session_id' <> 'null'::jsonb
     or coalesce(current_setting('fajkat.hors_seance', true), '') <> '' then
    raise exception 'ÉCHEC : contrôle hors séance pendant une séance pleine : %', v_ctrl;
  end if;
  begin
    perform public.book_appointment(v_org, current_setting('test.q')::uuid, pg_temp.type_e('pf'),
      pg_temp.a(14, '09:00'), p_outside_session => true);
    raise exception 'ÉCHEC : hors séance pendant une séance pleine pris sans confirmation';
  exception when others then
    if sqlerrm !~ 'prendre quand même ce patient hors séance' then raise; end if;
  end;
  select * into v_a from public.book_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('pf'), pg_temp.a(14, '09:00'), p_confirm => true, p_outside_session => true);
  if v_a.session_id is not null or coalesce(current_setting('fajkat.hors_seance', true), '') <> '' then
    raise exception 'ÉCHEC : hors séance confirmé : %', v_a;
  end if;
  -- Séance avec des places : pas d'avertissement hors séance.
  v_ctrl := public.check_appointment(v_org, current_setting('test.q')::uuid,
    pg_temp.type_e('consultation'), pg_temp.a(14, '09:00'), p_outside_session => true);
  if v_ctrl::text ~ 'outside_full' then
    raise exception 'ÉCHEC : avertissement hors séance pour une séance qui a des places : %', v_ctrl;
  end if;
  raise notice 'OK : hors séance pendant une séance pleine : avertissement, pris seulement après confirmation, sans séance';
end $$;

reset role;
rollback;
