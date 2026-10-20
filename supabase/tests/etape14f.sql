-- =============================================================================
-- Tests — étape 14, partie D (suite) : qualité du praticien ; rendez-vous d'un jour passé
-- -----------------------------------------------------------------------------
-- Vérifie : qualité du praticien (fonction de sa fiche, sinon titre du profil) lue par les
-- soignants qui impriment, refusée à l'accueil et à l'aide-soignant ; clôture des
-- rendez-vous des jours finis : sans passage « Non venu », avec un passage « Venu » relié au
-- passage, avec deux passages « Venu » sans lien, avec une consultation sans passage
-- « Venu », « Parti sans être vu » noté par l'équipe : « Non venu » ; jamais le jour même ;
-- rendez-vous discret : même statut et même ligne pour tous, rien qui trahisse le type chez
-- l'accueil (agenda, onglet Rendez-vous, chronologie) ; rejouable sans effet de plus ;
-- statut remis à la main : marque retirée et jamais reclos ; première arrivée du jour qui
-- clôt ; close_past_appointments réservée aux membres, fonction interne fermée au client.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14f.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a14f-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14f-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '09']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14f-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 14F', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14f-00000000000b", "role": "authenticated"}', true);
select set_config('test.autre',
  public.create_organization('Poste de santé 14F bis', 'poste_sante', 'SN', 'Kolda')::text, true);
reset role;

-- 0a owner (n'exerce pas), 0c infirmier, 0d aide-soignant, 09 accueil ; 0b owner de l'autre.
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a14f-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('0d', 'aide_soignant'), ('09', 'accueil')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a14f-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.refus(p_sql text, p_code text, p_extrait text default null)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ÉCHEC : accepté alors que refusé était attendu : %', p_sql;
exception
  when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
    if sqlstate <> p_code or (p_extrait is not null and position(p_extrait in sqlerrm) = 0) then
      raise exception 'ÉCHEC : % -> % « % » (attendu % « % »)', p_sql, sqlstate, sqlerrm,
        p_code, coalesce(p_extrait, '');
    end if;
end;
$$;
create function pg_temp.rdv(p_nom text) returns public.appointments language sql security definer as $$
  select a.* from public.appointments a join public.patients p on p.id = a.patient_id
   where a.org_id = current_setting('test.org')::uuid and p.first_name = p_nom;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.refus(text, text, text),
  pg_temp.rdv(text) to authenticated;
grant execute on function pg_temp.refus(text, text, text) to anon;

-- -----------------------------------------------------------------------------
-- 1. Qualité du praticien
-- -----------------------------------------------------------------------------
update public.staff_files set job_title = 'Infirmier chef de poste'
 where membership_id = (select id from public.memberships
                         where org_id = current_setting('test.org')::uuid
                           and user_id = '00000000-0000-4000-a14f-00000000000c');
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_p uuid;
  v   jsonb;
  s   jsonb;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'Diop', 'Ordonnance', 'F', 31) returning id into v_p;
  v := public.start_encounter(v_p, null);
  s := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer,
         '{"reason": "Fièvre", "prescription": {"items": [{"product_name": "Paracétamol"}]}}');
  perform public.validate_encounter((v ->> 'id')::uuid, (s ->> 'version')::integer);
  perform set_config('test.c', v ->> 'id', true);
  if (select prescriber_title from public.prescription_prescriber_titles((v ->> 'id')::uuid))
     is distinct from 'Infirmier chef de poste' then
    raise exception 'ÉCHEC : qualité du praticien';
  end if;
  raise notice 'OK : qualité du praticien lue par le soignant qui imprime';
end $$;
do $$
declare
  v_code text;
begin
  foreach v_code in array array['09', '0d', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    perform pg_temp.refus(format('select * from public.prescription_prescriber_titles(%L)',
                                 current_setting('test.c')), '42501');
  end loop;
  raise notice 'OK : qualité du praticien refusée à l''accueil, à l''aide-soignant et à l''owner qui n''exerce pas';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Rendez-vous d'un jour passé : données écrites directement, déclencheurs coupés (la
--    base ne prend pas de rendez-vous ni de passage dans le passé).
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select set_config('test.hier', (public.org_local_date(current_setting('test.org')::uuid) - 1)::text, true);
select set_config('test.auj', public.org_local_date(current_setting('test.org')::uuid)::text, true);
-- Absent (sans passage), Passage (un), Deux (deux passages), Consult (consultation sans
-- passage), Parti (« Parti sans être vu » noté), Jour (rendez-vous d'aujourd'hui),
-- Discret (PF, sans passage), Corrige (remis à « prévu » à la main ensuite).
insert into public.patients (org_id, last_name, first_name, sex, declared_age)
select current_setting('test.org')::uuid, 'Rdv', n, 'F', 30
  from unnest(array['Absent', 'Passage', 'Deux', 'Consult', 'Parti', 'Jour', 'Discret', 'Corrige']) n;

set local session_replication_role = replica;
insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                           ticket_number, status, arrived_at, finished_at, left_at)
select current_setting('test.org')::uuid, p.id,
       (select id from public.queue_services where org_id = current_setting('test.org')::uuid
           and template_code = 'consultation'),
       current_setting('test.hier')::date, v.seq, 'A-0' || v.seq, v.st,
       ((current_setting('test.hier')::date + v.h)::timestamp at time zone 'Africa/Dakar'),
       case when v.st = 'done' then now() - interval '20 hours' end,
       case when v.st = 'left' then now() - interval '20 hours' end
  from (values ('Passage', 10, 'done', time '09:10'), ('Deux', 11, 'done', time '08:00'),
               ('Deux', 12, 'done', time '15:00'), ('Parti', 13, 'left', time '10:00'))
       v(nom, seq, st, h)
  join public.patients p on p.first_name = v.nom and p.org_id = current_setting('test.org')::uuid;

insert into public.encounters (org_id, patient_id, encounter_type_id, author_id, started_at)
select current_setting('test.org')::uuid, p.id,
       (select id from public.encounter_types where org_id = current_setting('test.org')::uuid
           and template_code = 'consultation'),
       '00000000-0000-4000-a14f-00000000000c',
       ((current_setting('test.hier')::date + time '11:00')::timestamp at time zone 'Africa/Dakar')
  from public.patients p where p.first_name = 'Consult';

insert into public.appointments (org_id, patient_id, appointment_type_id, starts_at, ends_at,
                                 local_date, status, source)
select current_setting('test.org')::uuid, p.id,
       (select id from public.appointment_types where org_id = current_setting('test.org')::uuid
           and template_code = case when p.first_name = 'Discret' then 'pf' else 'consultation' end),
       (d + time '14:00')::timestamp at time zone 'Africa/Dakar',
       (d + time '14:20')::timestamp at time zone 'Africa/Dakar',
       d, case when p.first_name = 'Passage' then 'confirmed' else 'scheduled' end, 'agenda'
  from public.patients p,
       lateral (select case when p.first_name = 'Jour' then current_setting('test.auj')::date
                            else current_setting('test.hier')::date end as d) j(d)
 where p.org_id = current_setting('test.org')::uuid and p.last_name = 'Rdv';
set local session_replication_role = origin;

-- Ouverture de l'agenda par l'accueil.
set local role authenticated;
select pg_temp.en_tant_que('09');
select set_config('test.n', public.close_past_appointments(current_setting('test.org')::uuid)::text, true);
reset role;
do $$
declare
  v_passage uuid := (select id from public.visits where ticket_number = 'A-010'
                      and org_id = current_setting('test.org')::uuid);
begin
  if current_setting('test.n')::int <> 7 then
    raise exception 'ÉCHEC : 7 rendez-vous clos attendus, %', current_setting('test.n');
  end if;
  if (pg_temp.rdv('Absent')).status <> 'no_show' or not (pg_temp.rdv('Absent')).closed_automatically then
    raise exception 'ÉCHEC : sans passage : « Non venu » automatique';
  end if;
  if (pg_temp.rdv('Passage')).status <> 'arrived' or (pg_temp.rdv('Passage')).visit_id <> v_passage
     or (pg_temp.rdv('Passage')).arrived_at <> (select arrived_at from public.visits where id = v_passage)
     or not (pg_temp.rdv('Passage')).closed_automatically then
    raise exception 'ÉCHEC : un passage : « Venu », relié au passage : %', pg_temp.rdv('Passage');
  end if;
  if (pg_temp.rdv('Deux')).status <> 'arrived' or (pg_temp.rdv('Deux')).visit_id is not null then
    raise exception 'ÉCHEC : deux passages : « Venu » sans lien';
  end if;
  if (pg_temp.rdv('Consult')).status <> 'arrived' then
    raise exception 'ÉCHEC : consultation sans passage : « Venu »';
  end if;
  if (pg_temp.rdv('Parti')).status <> 'no_show' then
    raise exception 'ÉCHEC : « Parti sans être vu » noté : « Non venu »';
  end if;
  if (pg_temp.rdv('Jour')).status <> 'scheduled' or (pg_temp.rdv('Jour')).auto_closed_at is not null then
    raise exception 'ÉCHEC : rendez-vous du jour clos';
  end if;
  if (pg_temp.rdv('Discret')).status <> 'no_show' or not (pg_temp.rdv('Discret')).closed_automatically then
    raise exception 'ÉCHEC : rendez-vous discret : « Non venu » automatique';
  end if;
  raise notice 'OK : clôture (sans passage, un passage relié, deux passages, consultation, parti sans être vu, jour même)';
end $$;

-- Rejouable sans effet de plus.
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
begin
  if public.close_past_appointments(current_setting('test.org')::uuid) <> 0 then
    raise exception 'ÉCHEC : deuxième clôture';
  end if;
  raise notice 'OK : clôture rejouable sans effet de plus';
end $$;

-- Rendez-vous discret chez l'accueil : même ligne qu'un « Non venu » ordinaire.
select pg_temp.en_tant_que('09');
do $$
declare
  d record;
  o record;
begin
  select * into d from public.list_appointments(current_setting('test.org')::uuid,
    current_setting('test.hier')::date, current_setting('test.hier')::date)
   where patient_first_name = 'Discret';
  select * into o from public.list_appointments(current_setting('test.org')::uuid,
    current_setting('test.hier')::date, current_setting('test.hier')::date)
   where patient_first_name = 'Absent';
  if d.status <> 'no_show' or not d.closed_automatically or d.type_label <> 'Consultation'
     or d.is_discreet or d.session_id is not null or d.series_id is not null
     or d.source_ref is not null or d.cancel_reason is not null or d.note is not null
     or d.visit_id is not null
     or (d.status, d.closed_automatically, d.type_label, d.source)
        is distinct from (o.status, o.closed_automatically, o.type_label, o.source) then
    raise exception 'ÉCHEC : agenda, rendez-vous discret chez l''accueil : % / %', d, o;
  end if;
  select * into d from public.list_patient_appointments((pg_temp.rdv('Discret')).patient_id);
  if d.status <> 'no_show' or not d.closed_automatically or d.type_label <> 'Consultation'
     or d.is_discreet then
    raise exception 'ÉCHEC : onglet Rendez-vous, rendez-vous discret chez l''accueil : %', d;
  end if;
  select * into d from public.patient_timeline((pg_temp.rdv('Discret')).patient_id, array['appointment']);
  if d.status <> 'no_show_auto' or d.title <> 'Consultation' then
    raise exception 'ÉCHEC : chronologie, rendez-vous discret chez l''accueil : %', d;
  end if;
  raise notice 'OK : rendez-vous discret clos : même statut et même ligne pour l''accueil, type masqué';
end $$;
-- Le soignant voit le vrai type, avec la même marque.
select pg_temp.en_tant_que('0c');
do $$
declare
  d record;
begin
  select * into d from public.patient_timeline((pg_temp.rdv('Discret')).patient_id, array['appointment']);
  if d.status <> 'no_show_auto' or d.title = 'Consultation' then
    raise exception 'ÉCHEC : chronologie, rendez-vous discret chez le soignant : %', d;
  end if;
  if (select status from public.patient_timeline((pg_temp.rdv('Passage')).patient_id, array['appointment']))
     <> 'arrived_auto' then
    raise exception 'ÉCHEC : chronologie « arrived_auto »';
  end if;
  raise notice 'OK : chronologie : no_show_auto / arrived_auto';
end $$;

-- Remis à « prévu » à la main : marque retirée, jamais reclos.
select public.set_appointment_status((pg_temp.rdv('Absent')).id, 'scheduled');
do $$
begin
  if (pg_temp.rdv('Absent')).status <> 'scheduled' or (pg_temp.rdv('Absent')).closed_automatically then
    raise exception 'ÉCHEC : remise à « prévu » : marque « automatique » retirée';
  end if;
  perform public.close_past_appointments(current_setting('test.org')::uuid);
  if (pg_temp.rdv('Absent')).status <> 'scheduled' then
    raise exception 'ÉCHEC : rendez-vous corrigé à la main reclos';
  end if;
  raise notice 'OK : corrigé à la main : marque retirée, jamais reclos';
end $$;
reset role;

-- Première arrivée du jour : clôt aussi les rendez-vous des jours finis.
set local session_replication_role = replica;
update public.appointments set local_date = current_setting('test.hier')::date,
       starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day'
 where id = (pg_temp.rdv('Jour')).id;
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.en_tant_que('09');
select public.register_arrival(current_setting('test.org')::uuid, (pg_temp.rdv('Corrige')).patient_id,
  (select id from public.queue_services where org_id = current_setting('test.org')::uuid
      and template_code = 'consultation'));
reset role;
do $$
begin
  if (pg_temp.rdv('Jour')).status <> 'no_show' or not (pg_temp.rdv('Jour')).closed_automatically then
    raise exception 'ÉCHEC : première arrivée du jour sans clôture des rendez-vous';
  end if;
  raise notice 'OK : première arrivée du jour : rendez-vous des jours finis clos';
end $$;

-- Droits.
set local role authenticated;
select pg_temp.en_tant_que('0b');
select pg_temp.refus(format('select public.close_past_appointments(%L)', current_setting('test.org')),
                     '42501');
select pg_temp.en_tant_que('09');
select pg_temp.refus(format('select public.appointments_close_past(%L)', current_setting('test.org')),
                     '42501');
reset role;
set local role anon;
select pg_temp.refus(format('select public.close_past_appointments(%L)', current_setting('test.org')),
                     '42501');
do $$ begin raise notice 'OK : clôture réservée aux membres ; fonction interne fermée au client'; end $$;

rollback;
