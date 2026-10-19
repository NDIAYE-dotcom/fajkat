-- =============================================================================
-- Tests — étape 13, partie C (types discrets masqués, identité dans l'agenda)
-- -----------------------------------------------------------------------------
-- Vérifie : l'accueil et le caissier ne voient jamais le nom d'un type discret (agenda,
-- « À rappeler demain », messages de contrôle, tables des types et des séances) ; libellé
-- neutre = nom de la file d'arrivée, ou « Consultation » si la file est elle-même parlante,
-- rangé sous le vrai type Consultation ; rien ne signale un RDV discret (is_discreet faux,
-- motif d'annulation vide) ; appointment_issues non exécutable en direct ; mots du filet
-- de sécurité (DÉPISTAGE, santé mentale, VBG…) ;
-- soignants, owner et admin voient le vrai nom ; note jamais renvoyée hors soignants ;
-- sexe et naissance renvoyés pour distinguer les homonymes.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape13c.sql
-- Prérequis : migrations des étapes 3 à 13 appliquées (dont etape13c_discretion).
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a13c-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e13c-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0c', '06', '09']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a13c-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé C', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a13c-0000000000' || c)::uuid, r, true
  from (values ('0c', 'infirmier'), ('06', 'caissier'), ('09', 'accueil')) v(c, r);
select set_config('test.demain', (public.org_local_date(current_setting('test.org')::uuid) + 1)::text, true);
-- Fêtes fixes retirées : demain peut tomber un jour férié.
update public.holidays set deleted_at = now() where org_id = current_setting('test.org')::uuid;

-- Créées par le superutilisateur : type_c lit aussi les types discrets.
create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a13c-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
create function pg_temp.type_c(p_code text) returns uuid language sql security definer as $$
  select id from public.appointment_types
   where org_id = current_setting('test.org')::uuid and template_code = p_code;
$$;
grant execute on function pg_temp.en_tant_que(text), pg_temp.type_c(text) to authenticated;
set local role authenticated;

-- Demain (pris par l'owner : l'accueil ne prend pas un type discret, étape 13 D) : une PF
-- (file « Sage-femme »), un dépistage (file
-- « Consultation »), une vaccination ; même patiente pour la PF et la vaccination.
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_p   uuid;
  v_q   uuid;
  v_r   text;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date)
  values (v_org, 'Diop', 'Fatou', 'F', '1990-03-12') returning id into v_p;
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diop', 'Fatou', 'F', 30) returning id into v_q;
  perform set_config('test.p', v_p::text, true);
  perform public.book_appointment(v_org, v_p, pg_temp.type_c('pf'),
    (current_setting('test.demain')::date + time '09:00') at time zone 'Africa/Dakar',
    p_note => 'Implant à retirer', p_confirm => true);
  -- PF annulée avec un motif parlant : jamais renvoyé à l'accueil.
  perform public.set_appointment_status((select id from public.book_appointment(v_org, v_q,
    pg_temp.type_c('pf'), (current_setting('test.demain')::date + time '12:00') at time zone 'Africa/Dakar',
    p_confirm => true)), 'cancelled', 'Effets secondaires de l''implant');
  perform public.book_appointment(v_org, v_q, pg_temp.type_c('depistage'),
    (current_setting('test.demain')::date + time '10:00') at time zone 'Africa/Dakar', p_confirm => true);
  -- Contrôle (accueil) : l'autre rendez-vous du jour est annoncé sans nommer la PF.
  perform pg_temp.en_tant_que('09');
  begin
    perform public.book_appointment(v_org, v_p, pg_temp.type_c('vaccination'),
      (current_setting('test.demain')::date + time '11:00') at time zone 'Africa/Dakar');
    raise exception 'ÉCHEC : avertissement attendu';
  exception when invalid_parameter_value then
    get stacked diagnostics v_r = message_text;
  end;
  if v_r ~* 'planification|pf' or v_r !~ '09:00, Consultation' then
    raise exception 'ÉCHEC : message de contrôle : %', v_r;
  end if;
  raise notice 'OK : message de contrôle sans nom de type discret (%)', v_r;
end $$;

do $$
declare
  v_code text;
  v_l    record;
begin
  foreach v_code in array array['06', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    for v_l in select * from public.list_appointments(current_setting('test.org')::uuid,
                 current_setting('test.demain')::date, current_setting('test.demain')::date) loop
      if v_l.type_label <> 'Consultation' or v_l.is_discreet
         or v_l.appointment_type_id is distinct from pg_temp.type_c('consultation')
         or v_l.session_id is not null or v_l.note is not null or v_l.cancel_reason is not null then
        raise exception 'ÉCHEC : le rôle % voit un type discret ou la note : %', v_code, v_l;
      end if;
    end loop;
    if (select array_agg(type_label order by starts_at) from public.list_appointments(
          current_setting('test.org')::uuid, current_setting('test.demain')::date,
          current_setting('test.demain')::date)) <> array['Consultation', 'Consultation', 'Consultation'] then
      raise exception 'ÉCHEC : libellés neutres attendus (file, sinon « Consultation »)';
    end if;
    if exists (select 1 from public.appointments_to_remind(current_setting('test.org')::uuid)
               where type_label ~* 'planification|d[ée]pistage' or is_discreet) then
      raise exception 'ÉCHEC : « À rappeler demain » nomme un type discret pour le rôle %', v_code;
    end if;
    if exists (select 1 from public.appointment_types where is_discreet)
       or (select count(*) from public.appointment_types
           where org_id = current_setting('test.org')::uuid) <> 5 then
      raise exception 'ÉCHEC : le rôle % lit les types discrets', v_code;
    end if;
  end loop;
  raise notice 'OK : accueil et caissier : « Consultation » sous le vrai type, is_discreet faux, ni séance, ni note, ni motif d''annulation';
end $$;

-- Séance d'un type discret : cachée à l'accueil.
select pg_temp.en_tant_que('0a');
insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time, end_time, capacity)
values (current_setting('test.org')::uuid, pg_temp.type_c('pf'), 3, '08:00', '10:00', 10),
       (current_setting('test.org')::uuid, pg_temp.type_c('vaccination'), 2, '08:00', '12:00', 40);
select pg_temp.en_tant_que('09');
do $$
begin
  if (select count(*) from public.appointment_sessions) <> 1 then
    raise exception 'ÉCHEC : l''accueil voit la séance d''un type discret';
  end if;
  raise notice 'OK : séance d''un type discret cachée à l''accueil';
end $$;

-- Soignant et owner : le vrai nom ; note pour le soignant seulement ; identité renvoyée.
do $$
declare
  v_code text;
begin
  foreach v_code in array array['0c', '0a'] loop
    perform pg_temp.en_tant_que(v_code);
    if (select array_agg(type_label order by starts_at) from public.list_appointments(
          current_setting('test.org')::uuid, current_setting('test.demain')::date,
          current_setting('test.demain')::date)) <> array['Planification familiale', 'Dépistage', 'Planification familiale']
       or (select count(*) from public.appointment_types where is_discreet) <> 2 then
      raise exception 'ÉCHEC : le rôle % ne voit pas le vrai nom', v_code;
    end if;
  end loop;
  perform pg_temp.en_tant_que('0c');
  if (select note from public.list_appointments(current_setting('test.org')::uuid,
        current_setting('test.demain')::date, current_setting('test.demain')::date)
      where patient_id = current_setting('test.p')::uuid) <> 'Implant à retirer' then
    raise exception 'ÉCHEC : l''infirmier ne lit pas la note';
  end if;
  perform pg_temp.en_tant_que('0a');
  if exists (select 1 from public.list_appointments(current_setting('test.org')::uuid,
               current_setting('test.demain')::date, current_setting('test.demain')::date)
             where note is not null) then
    raise exception 'ÉCHEC : l''owner non soignant lit la note';
  end if;
  if (select count(*) from public.list_appointments(current_setting('test.org')::uuid,
        current_setting('test.demain')::date, current_setting('test.demain')::date)
      where patient_sex = 'F' and file_number is not null
        and (birth_date = '1990-03-12' or birth_year is not null)) <> 3 then
    raise exception 'ÉCHEC : identité des homonymes absente';
  end if;
  if (select count(*) from public.list_appointments(current_setting('test.org')::uuid,
        current_setting('test.demain')::date, current_setting('test.demain')::date)
      where is_discreet) <> 3
     or not exists (select 1 from public.list_appointments(current_setting('test.org')::uuid,
          current_setting('test.demain')::date, current_setting('test.demain')::date)
        where cancel_reason ~ 'implant') then
    raise exception 'ÉCHEC : l''owner ne voit pas la discrétion ou le motif d''annulation';
  end if;
  raise notice 'OK : soignant et owner voient le vrai nom, la discrétion et le motif ; note au soignant seul ; sexe, naissance, n° de dossier renvoyés';
end $$;

-- appointment_issues : jamais appelé en direct (seulement par check_ / book_appointment…).
select pg_temp.en_tant_que('09');
do $$
begin
  perform public.appointment_issues(current_setting('test.org')::uuid, pg_temp.type_c('pf'),
    null, now() + interval '1 day', null, null);
  raise exception 'ÉCHEC : appointment_issues exécutable par authenticated';
exception when insufficient_privilege then
  raise notice 'OK : appointment_issues non exécutable en direct';
end $$;

-- Filet de sécurité : types discrets d'office (capitales accentuées comprises).
select pg_temp.en_tant_que('0a');
do $$
declare
  v_libelle text;
begin
  foreach v_libelle in array array['DÉPISTAGE VIH', 'Santé mentale', 'Consultation psy',
                                   'Soins après avortement (SAA)', 'Prise en charge VBG',
                                   'Violences conjugales'] loop
    insert into public.appointment_types (org_id, label, duration_minutes)
    values (current_setting('test.org')::uuid, v_libelle, 20);
  end loop;
  insert into public.appointment_types (org_id, label, duration_minutes)
  values (current_setting('test.org')::uuid, 'Consultation de suivi', 20);
  if (select count(*) from public.appointment_types
      where org_id = current_setting('test.org')::uuid and is_discreet
        and label in ('DÉPISTAGE VIH', 'Santé mentale', 'Consultation psy',
                      'Soins après avortement (SAA)', 'Prise en charge VBG',
                      'Violences conjugales')) <> 6
     or (select is_discreet from public.appointment_types
         where org_id = current_setting('test.org')::uuid and label = 'Consultation de suivi') then
    raise exception 'ÉCHEC : filet de sécurité des types discrets';
  end if;
  raise notice 'OK : DÉPISTAGE, santé mentale, psy, SAA, VBG, violence : discrets d''office';
end $$;

reset role;

rollback;
