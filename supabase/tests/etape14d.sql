-- =============================================================================
-- Tests — étape 14 (correctif) : passages clos
-- -----------------------------------------------------------------------------
-- Vérifie : brouillon enregistré, passage inchangé ; consultation validée, passage
-- « Terminé » (heure de la validation) ; passage orienté vers une autre file ou remis en
-- attente pendant la consultation : inchangé à la validation ; passages d'un jour passé
-- encore ouverts, clos à la première arrivée du jour dans la structure (« Terminé » s'il
-- était en consultation, sinon « Parti sans être vu » ; fin du jour du passage ; marque
-- closed_automatically ; « closed_auto » dans la chronologie) ; passages d'une autre
-- structure intacts ; fonctions internes non exécutables par le client.
-- Lancement : psql "<base locale>" -v ON_ERROR_STOP=1 -f supabase/tests/etape14d.sql
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a14d-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e14d-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '09']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14d-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 14D', 'poste_sante', 'SN', 'Kolda')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a14d-00000000000b", "role": "authenticated"}', true);
select set_config('test.autre',
  public.create_organization('Poste de santé 14D bis', 'poste_sante', 'SN', 'Kolda')::text, true);
reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a14d-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('09', 'accueil')) v(c, r);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a14d-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.passage(p_id uuid) returns public.visits language sql security definer as $$
  select * from public.visits where id = p_id;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.passage(uuid) to authenticated;

-- Patients des deux structures ; passages ouverts d'hier, écrits directement (la base date
-- un passage du jour) : en attente, en consultation ; et un dans l'autre structure.
select set_config('request.jwt.claims', '', true);
select set_config('test.hier', (public.org_local_date(current_setting('test.org')::uuid) - 1)::text, true);
with p as (
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org')::uuid, 'Sarr', 'Awa', 'F', 30),
         (current_setting('test.org')::uuid, 'Fall', 'Modou', 'M', 41),
         (current_setting('test.autre')::uuid, 'Ba', 'Coumba', 'F', 25)
  returning id, org_id, first_name)
select set_config('test.p_' || lower(first_name), id::text, true) from p;
insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                           ticket_number, status, arrived_at, consultation_at)
select o, p, (select id from public.queue_services where org_id = o and template_code = 'consultation'),
       current_setting('test.hier')::date, seq, 'A-00' || seq, st,
       now() - interval '1 day', case when st = 'consultation' then now() - interval '1 day' end
  from (values (current_setting('test.org')::uuid, current_setting('test.p_awa')::uuid, 1, 'waiting'),
               (current_setting('test.org')::uuid, current_setting('test.p_modou')::uuid, 2, 'consultation'),
               (current_setting('test.autre')::uuid, current_setting('test.p_coumba')::uuid, 1, 'vitals'))
       v(o, p, seq, st);

-- Première arrivée du jour (accueil) : les passages d'hier de la structure sont clos.
set local role authenticated;
select pg_temp.en_tant_que('09');
select set_config('test.v', (public.register_arrival(current_setting('test.org')::uuid,
  current_setting('test.p_awa')::uuid,
  (select id from public.queue_services where org_id = current_setting('test.org')::uuid
     and template_code = 'consultation'))).id::text, true);
reset role;
do $$
declare
  v_fin timestamptz := ((current_setting('test.hier')::date + 1)::timestamp at time zone 'Africa/Dakar')
                       - interval '1 second';
begin
  if (select array_agg(status || ' ' || coalesce(finished_at, left_at)::text order by ticket_seq)
        from public.visits
       where org_id = current_setting('test.org')::uuid and visit_date = current_setting('test.hier')::date)
     <> array['left ' || v_fin::text, 'done ' || v_fin::text] then
    raise exception 'ÉCHEC : passages d''hier : %', (select array_agg(status || ' ' || coalesce(finished_at, left_at)::text order by ticket_seq)
        from public.visits where org_id = current_setting('test.org')::uuid and visit_date = current_setting('test.hier')::date);
  end if;
  if (select status from public.visits where org_id = current_setting('test.autre')::uuid) <> 'vitals' then
    raise exception 'ÉCHEC : passage d''une autre structure clos';
  end if;
  if exists (select 1 from public.visits where org_id = current_setting('test.org')::uuid
              and visit_date = current_setting('test.hier')::date and not closed_automatically)
     or exists (select 1 from public.visits where visit_date = public.org_local_date(org_id)
                 and closed_automatically) then
    raise exception 'ÉCHEC : marque closed_automatically';
  end if;
  raise notice 'OK : passages d''hier clos à la première arrivée (en attente : parti sans être vu ; en consultation : terminé ; fin du jour du passage) ; autre structure intacte';
end $$;

-- Chronologie : passage d'hier « closed_auto » (l'accueil la lit).
set local role authenticated;
select pg_temp.en_tant_que('09');
do $$
begin
  if (select array_agg(status order by occurred_at) from public.patient_timeline(
        current_setting('test.p_awa')::uuid, array['visit'])) <> array['closed_auto', 'waiting'] then
    raise exception 'ÉCHEC : chronologie : %', (select array_agg(status order by occurred_at)
      from public.patient_timeline(current_setting('test.p_awa')::uuid, array['visit']));
  end if;
  raise notice 'OK : chronologie : passage d''hier « clos automatiquement »';
end $$;
reset role;

-- Validation d'une consultation liée au passage : passage terminé ; brouillon : inchangé.
set local role authenticated;
select pg_temp.en_tant_que('09');
select public.move_visit(current_setting('test.v')::uuid, 'consultation');
select pg_temp.en_tant_que('0c');
do $$
declare
  v   jsonb;
  s   jsonb;
begin
  v := public.start_encounter(current_setting('test.p_awa')::uuid, current_setting('test.v')::uuid);
  s := public.save_encounter_draft((v ->> 'id')::uuid, (v ->> 'version')::integer, '{"reason": "Fièvre"}');
  if (pg_temp.passage(current_setting('test.v')::uuid)).status <> 'consultation' then
    raise exception 'ÉCHEC : passage modifié par un brouillon';
  end if;
  perform public.validate_encounter((v ->> 'id')::uuid, (s ->> 'version')::integer);
  if (pg_temp.passage(current_setting('test.v')::uuid)).status <> 'done'
     or (pg_temp.passage(current_setting('test.v')::uuid)).finished_at is null then
    raise exception 'ÉCHEC : passage non terminé à la validation : %', pg_temp.passage(current_setting('test.v')::uuid);
  end if;
  -- Il quitte le tableau du jour (colonne Terminé).
  if exists (select 1 from public.get_queue_board(current_setting('test.org')::uuid)
              where visit_id = current_setting('test.v')::uuid and status <> 'done') then
    raise exception 'ÉCHEC : passage encore ouvert au tableau';
  end if;
  raise notice 'OK : brouillon : passage inchangé ; validation : passage terminé';
end $$;

-- Pendant la consultation, passage orienté vers une autre file (simulé en base : aucune
-- fonction ne le fait aujourd'hui), ou remis en attente puis rappelé : la validation ne
-- touche pas au passage.
select pg_temp.en_tant_que('09');
select set_config('test.v2', (public.register_arrival(current_setting('test.org')::uuid,
  current_setting('test.p_modou')::uuid,
  (select id from public.queue_services where org_id = current_setting('test.org')::uuid
     and template_code = 'consultation'))).id::text, true);
select public.move_visit(current_setting('test.v2')::uuid, 'consultation');
select pg_temp.en_tant_que('0c');
select set_config('test.e2', (public.start_encounter(current_setting('test.p_modou')::uuid,
  current_setting('test.v2')::uuid)) ->> 'id', true);
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('test.file2', (select id::text from public.queue_services
  where org_id = current_setting('test.org')::uuid and template_code <> 'consultation'
    and is_active and deleted_at is null order by sort_order limit 1), true);
update public.visits set queue_service_id = current_setting('test.file2')::uuid, status = 'waiting'
 where id = current_setting('test.v2')::uuid;
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_enc jsonb := public.get_encounter(current_setting('test.e2')::uuid);
  s     jsonb;
begin
  s := public.save_encounter_draft(current_setting('test.e2')::uuid, (v_enc ->> 'version')::integer,
    '{"reason": "Douleurs"}');
  perform public.validate_encounter(current_setting('test.e2')::uuid, (s ->> 'version')::integer);
  if (pg_temp.passage(current_setting('test.v2')::uuid)).status <> 'waiting'
     or (pg_temp.passage(current_setting('test.v2')::uuid)).queue_service_id
        <> current_setting('test.file2')::uuid then
    raise exception 'ÉCHEC : passage orienté fermé : %', pg_temp.passage(current_setting('test.v2')::uuid);
  end if;
  raise notice 'OK : passage orienté vers une autre file pendant la consultation : toujours en attente après la validation';
end $$;

-- Remis en attente puis rappelé en consultation après le début de la consultation : inchangé.
select pg_temp.en_tant_que('09');
select public.move_visit(current_setting('test.v2')::uuid, 'consultation');
select pg_temp.en_tant_que('0c');
select set_config('test.e3', (public.start_encounter(current_setting('test.p_modou')::uuid,
  current_setting('test.v2')::uuid)) ->> 'id', true);
select pg_temp.en_tant_que('09');
select public.move_visit(current_setting('test.v2')::uuid, 'waiting');
select public.move_visit(current_setting('test.v2')::uuid, 'consultation');
-- Tout ce test tient dans une transaction, où now() est figée : le rappel est daté d'une
-- seconde après le début de la consultation, comme dans la réalité.
reset role;
update public.visits set status_changed_at = now() + interval '1 second'
 where id = current_setting('test.v2')::uuid;
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_enc jsonb := public.get_encounter(current_setting('test.e3')::uuid);
  s     jsonb;
begin
  s := public.save_encounter_draft(current_setting('test.e3')::uuid, (v_enc ->> 'version')::integer,
    '{"reason": "Contrôle"}');
  perform public.validate_encounter(current_setting('test.e3')::uuid, (s ->> 'version')::integer);
  if (pg_temp.passage(current_setting('test.v2')::uuid)).status <> 'consultation' then
    raise exception 'ÉCHEC : passage déplacé pendant la consultation, fermé quand même';
  end if;
  raise notice 'OK : passage remis en attente puis rappelé pendant la consultation : inchangé';
end $$;

-- File changée pendant la consultation, statut resté « En consultation » : inchangé.
reset role;
update public.visits set queue_service_id = (select id from public.queue_services
  where org_id = current_setting('test.org')::uuid and template_code = 'consultation')
 where id = current_setting('test.v2')::uuid;
set local role authenticated;
select pg_temp.en_tant_que('0c');
select set_config('test.e4', (public.start_encounter(current_setting('test.p_modou')::uuid,
  current_setting('test.v2')::uuid)) ->> 'id', true);
reset role;
update public.visits set queue_service_id = current_setting('test.file2')::uuid
 where id = current_setting('test.v2')::uuid;
set local role authenticated;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_enc jsonb := public.get_encounter(current_setting('test.e4')::uuid);
  s     jsonb;
begin
  s := public.save_encounter_draft(current_setting('test.e4')::uuid, (v_enc ->> 'version')::integer,
    '{"reason": "Suivi"}');
  perform public.validate_encounter(current_setting('test.e4')::uuid, (s ->> 'version')::integer);
  if (pg_temp.passage(current_setting('test.v2')::uuid)).status <> 'consultation' then
    raise exception 'ÉCHEC : passage changé de file pendant la consultation, fermé quand même';
  end if;
  raise notice 'OK : file changée pendant la consultation : passage inchangé à la validation';
end $$;

reset role;
do $$
begin
  if has_function_privilege('authenticated', 'public.close_past_visits(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.encounters_close_visit()', 'execute')
     or has_function_privilege('authenticated', 'public.visits_close_past()', 'execute')
     or has_function_privilege('authenticated', 'public.visits_queue_change()', 'execute') then
    raise exception 'ÉCHEC : fonction interne exécutable par le client';
  end if;
  raise notice 'OK : fonctions de clôture non exécutables par le client';
end $$;

rollback;
