-- =============================================================================
-- Données de test de l'agenda (étape 13) — fajkat-dev uniquement, PAS une migration
-- -----------------------------------------------------------------------------
-- À coller tel quel dans le SQL Editor. Rejouable : rien n'est créé deux fois
-- (patients « TEST Agenda … », rendez-vous à la même heure, séances « TEST … »).
--
-- « Poste de santé Test » : 3 patients TEST Agenda 1 / 2 / 3 (âge exact, âge déclaré,
--   enfant né vers…) ; aujourd'hui : consultation, planification familiale (type discret),
--   consultation annulée ; les jours suivants : CPN, vaccination, dépistage (discret) ;
--   3 rendez-vous dans la séance de vaccination du prochain mardi (créée si elle n'existe
--   pas) ; une séance « TEST Séance de 3 places » remplie (tampon « Complet »).
-- « Clinique NDIAYE » : 2 patients, 2 rendez-vous demain, un avec praticien, un sans.
--
-- Chaque rendez-vous est pris par book_appointment en se faisant passer pour l'owner de
-- la structure : mêmes contrôles que l'application (les avertissements, jour férié ou
-- pause, sont acceptés d'office). Un type discret (PF) n'est pris que par un rôle médical
-- (étape 14, partie C) : l'owner est déclaré « exerce » le temps du script, puis remis
-- comme avant. Pour retirer ces données : bloc en bas du fichier.
-- =============================================================================

begin;

-- Structures, owners, dates ---------------------------------------------------------
do $$
declare
  v_nb integer;
begin
  select count(*) into v_nb from public.organizations
   where name = 'Poste de santé Test' and deleted_at is null;
  if v_nb <> 1 then
    raise exception 'Il faut exactement une structure « Poste de santé Test » (trouvées : %).', v_nb;
  end if;
  select count(*) into v_nb from public.organizations
   where name = 'Clinique NDIAYE' and deleted_at is null;
  if v_nb <> 1 then
    raise exception 'Il faut exactement une structure « Clinique NDIAYE » (trouvées : %).', v_nb;
  end if;
end $$;

select set_config('donnees.poste', id::text, true) from public.organizations
 where name = 'Poste de santé Test' and deleted_at is null;
select set_config('donnees.clinique', id::text, true) from public.organizations
 where name = 'Clinique NDIAYE' and deleted_at is null;
select set_config('donnees.owner_poste', (select user_id::text from public.memberships
  where org_id = current_setting('donnees.poste')::uuid and role = 'owner'
    and is_active and deleted_at is null order by created_at limit 1), true);
select set_config('donnees.owner_clinique', (select user_id::text from public.memberships
  where org_id = current_setting('donnees.clinique')::uuid and role = 'owner'
    and is_active and deleted_at is null order by created_at limit 1), true);
-- Owners « exercent » le temps du script (valeur d'origine gardée, remise à la fin).
create temporary table donnees_exercice on commit drop as
  select id, is_clinician from public.memberships
   where org_id in (current_setting('donnees.poste')::uuid, current_setting('donnees.clinique')::uuid)
     and role = 'owner';
update public.memberships set is_clinician = true
 where id in (select id from donnees_exercice);
select set_config('donnees.auj',
  public.org_local_date(current_setting('donnees.poste')::uuid)::text, true);

-- Aides (créées avant le changement de rôle) -----------------------------------------
create function pg_temp.en_tant_que(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Type par code (security definer : les types discrets sont cachés à certains rôles).
create function pg_temp.type_rdv(p_org uuid, p_code text) returns uuid
language sql security definer as $$
  select id from public.appointment_types
   where org_id = p_org and template_code = p_code and deleted_at is null
   order by is_active desc limit 1;
$$;

-- Patient « TEST <prénom> », créé s'il n'existe pas encore.
create function pg_temp.patient(p_org uuid, p_prenom text, p_sexe text, p_naissance date,
                                p_estimee boolean, p_age smallint) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id from public.patients
   where org_id = p_org and last_name = 'TEST' and first_name = p_prenom
     and deleted_at is null and merged_into_id is null
   limit 1;
  if v_id is null then
    insert into public.patients (org_id, last_name, first_name, sex, birth_date,
                                 birth_date_estimated, declared_age)
    values (p_org, 'TEST', p_prenom, p_sexe, p_naissance, coalesce(p_estimee, false), p_age)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Rendez-vous à une heure locale, pris s'il n'existe pas déjà (même patient, type, heure).
create function pg_temp.rdv(p_org uuid, p_patient uuid, p_type text, p_jour date, p_heure time,
                            p_praticien uuid default null) returns uuid
language plpgsql as $$
declare
  v_type   uuid := pg_temp.type_rdv(p_org, p_type);
  v_debut  timestamptz := (p_jour + p_heure) at time zone
                            (select timezone from public.organizations where id = p_org);
  v_id     uuid;
begin
  if v_type is null then
    raise exception 'Type de rendez-vous « % » absent des paramètres.', p_type;
  end if;
  select id into v_id from public.appointments
   where patient_id = p_patient and appointment_type_id = v_type and starts_at = v_debut
     and deleted_at is null
   limit 1;
  if v_id is null then
    select id into v_id from public.book_appointment(p_org, p_patient, v_type, v_debut,
                                                      p_practitioner_id => p_praticien,
                                                      p_confirm => true);
  end if;
  return v_id;
end;
$$;

grant execute on function pg_temp.en_tant_que(text), pg_temp.type_rdv(uuid, text),
  pg_temp.patient(uuid, text, text, date, boolean, smallint),
  pg_temp.rdv(uuid, uuid, text, date, time, uuid) to authenticated;

-- Séances du poste (en propriétaire de la base : créées seulement si aucune séance du même
-- type ne chevauche déjà la plage, ce que la base refuserait) ------------------------------
-- Prochain mardi (aujourd'hui si l'on est mardi) et J + 3 pour la séance de 3 places.
select set_config('donnees.mardi', (current_setting('donnees.auj')::date
  + ((2 - extract(isodow from current_setting('donnees.auj')::date)::integer + 7) % 7))::text, true);
select set_config('donnees.j3', (current_setting('donnees.auj')::date + 3)::text, true);

insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                         end_time, capacity, label, created_by)
select current_setting('donnees.poste')::uuid,
       pg_temp.type_rdv(current_setting('donnees.poste')::uuid, 'vaccination'), 2, '08:00',
       '12:00', 40, 'TEST Séance de vaccination', current_setting('donnees.owner_poste')::uuid
 where not exists (
   select 1 from public.appointment_sessions
    where org_id = current_setting('donnees.poste')::uuid and weekday = 2 and is_active
      and deleted_at is null and start_time < '12:00' and end_time > '08:00'
      and appointment_type_id = pg_temp.type_rdv(current_setting('donnees.poste')::uuid, 'vaccination'));

insert into public.appointment_sessions (org_id, appointment_type_id, weekday, start_time,
                                         end_time, capacity, label, created_by)
select current_setting('donnees.poste')::uuid,
       pg_temp.type_rdv(current_setting('donnees.poste')::uuid, 'soins'),
       extract(isodow from current_setting('donnees.j3')::date)::integer, '14:00', '16:00', 3,
       'TEST Séance de 3 places', current_setting('donnees.owner_poste')::uuid
 where not exists (
   select 1 from public.appointment_sessions
    where org_id = current_setting('donnees.poste')::uuid and label = 'TEST Séance de 3 places'
      and deleted_at is null);

-- Poste de santé Test : patients et rendez-vous (en tant que l'owner) -------------------
set local role authenticated;
select pg_temp.en_tant_que(current_setting('donnees.owner_poste'));

do $$
declare
  v_org  uuid := current_setting('donnees.poste')::uuid;
  v_auj  date := current_setting('donnees.auj')::date;
  v_mar  date := current_setting('donnees.mardi')::date;
  v_j3   date := current_setting('donnees.j3')::date;
  v_p1   uuid := pg_temp.patient(v_org, 'Agenda 1', 'F', date '1990-03-12', false, null);
  v_p2   uuid := pg_temp.patient(v_org, 'Agenda 2', 'F', null, false, 28::smallint);
  v_p3   uuid := pg_temp.patient(v_org, 'Agenda 3', 'M', (v_auj - interval '2 years 3 months')::date,
                                 true, null);
  v_ann  uuid;
begin
  -- Aujourd'hui.
  perform pg_temp.rdv(v_org, v_p1, 'consultation', v_auj, '09:00');
  perform pg_temp.rdv(v_org, v_p2, 'pf', v_auj, '10:00');
  v_ann := pg_temp.rdv(v_org, v_p3, 'consultation', v_auj, '11:00');
  if (select status from public.appointments where id = v_ann) = 'scheduled' then
    perform public.set_appointment_status(v_ann, 'cancelled', 'Données de test : annulé');
  end if;
  -- Les jours suivants.
  perform pg_temp.rdv(v_org, v_p1, 'cpn', v_auj + 1, '09:30');
  perform pg_temp.rdv(v_org, v_p2, 'vaccination', v_auj + 2, '15:00');
  perform pg_temp.rdv(v_org, v_p3, 'depistage', v_auj + 2, '10:00');
  -- Séance de vaccination du prochain mardi : 3 rendez-vous.
  perform pg_temp.rdv(v_org, v_p1, 'vaccination', v_mar, '08:00');
  perform pg_temp.rdv(v_org, v_p2, 'vaccination', v_mar, '08:15');
  perform pg_temp.rdv(v_org, v_p3, 'vaccination', v_mar, '08:30');
  -- Séance de 3 places : remplie.
  perform pg_temp.rdv(v_org, v_p1, 'soins', v_j3, '14:00');
  perform pg_temp.rdv(v_org, v_p2, 'soins', v_j3, '14:20');
  perform pg_temp.rdv(v_org, v_p3, 'soins', v_j3, '14:40');
  raise notice 'Poste de santé Test : % rendez-vous de test (aujourd''hui %, mardi %, séance pleine le %).',
    (select count(*) from public.appointments
      where patient_id in (v_p1, v_p2, v_p3) and deleted_at is null),
    to_char(v_auj, 'DD/MM'), to_char(v_mar, 'DD/MM'), to_char(v_j3, 'DD/MM');
end $$;

-- Clinique NDIAYE : 2 rendez-vous demain, un avec praticien, un sans --------------------
reset role;
select set_config('donnees.praticien', coalesce((
  select m.id::text from public.memberships m
   where m.org_id = current_setting('donnees.clinique')::uuid
     and public.is_practitioner(m.org_id, m.id)
   order by (m.role = 'medecin') desc, m.created_at limit 1), ''), true);
select set_config('donnees.demain_clinique',
  (public.org_local_date(current_setting('donnees.clinique')::uuid) + 1)::text, true);
set local role authenticated;
select pg_temp.en_tant_que(current_setting('donnees.owner_clinique'));

do $$
declare
  v_org   uuid := current_setting('donnees.clinique')::uuid;
  v_dem   date := current_setting('donnees.demain_clinique')::date;
  v_prat  uuid := nullif(current_setting('donnees.praticien'), '')::uuid;
  v_c1    uuid := pg_temp.patient(v_org, 'Agenda C1', 'M', null, false, 45::smallint);
  v_c2    uuid := pg_temp.patient(v_org, 'Agenda C2', 'F', date '1985-07-01', false, null);
begin
  if v_prat is null then
    raise notice 'Clinique NDIAYE : aucun praticien (membre soignant actif, ou owner / admin qui exerce) : les deux rendez-vous sont pris sans praticien.';
  end if;
  perform pg_temp.rdv(v_org, v_c1, 'consultation', v_dem, '10:00', v_prat);
  perform pg_temp.rdv(v_org, v_c2, 'consultation', v_dem, '11:00');
  raise notice 'Clinique NDIAYE : % rendez-vous de test le %.',
    (select count(*) from public.appointments
      where patient_id in (v_c1, v_c2) and deleted_at is null), to_char(v_dem, 'DD/MM');
end $$;

reset role;
update public.memberships m set is_clinician = d.is_clinician
  from donnees_exercice d where m.id = d.id;
commit;


-- =============================================================================
-- RETRAIT DES DONNÉES DE TEST (suppression douce) — à lancer séparément :
-- copiez le bloc ci-dessous SANS les lignes « /* » et « */ », puis exécutez-le.
-- Rendez-vous, séances « TEST … » et patients « TEST Agenda … » reçoivent deleted_at ;
-- rien n'est effacé physiquement.
-- =============================================================================
/*
begin;

update public.appointments a
   set deleted_at = now()
  from public.patients p, public.organizations o
 where a.patient_id = p.id and p.org_id = o.id
   and o.name in ('Poste de santé Test', 'Clinique NDIAYE')
   and p.last_name = 'TEST' and p.first_name like 'Agenda%'
   and a.deleted_at is null;

update public.appointment_sessions s
   set is_active = false, deleted_at = now()
  from public.organizations o
 where s.org_id = o.id and o.name in ('Poste de santé Test', 'Clinique NDIAYE')
   and s.label like 'TEST %' and s.deleted_at is null;

update public.patients p
   set deleted_at = now()
  from public.organizations o
 where p.org_id = o.id and o.name in ('Poste de santé Test', 'Clinique NDIAYE')
   and p.last_name = 'TEST' and p.first_name like 'Agenda%' and p.deleted_at is null;

commit;
*/
