-- =============================================================================
-- Tests — étape 12, partie A (Accueil, file d'attente, tickets, constantes)
-- -----------------------------------------------------------------------------
-- Vérifie : paramètres pré-remplis (services de file, salles, seuils) ; arrivée par le
-- caissier, numéros A-001 par service et par jour, double ticket refusé ; rôles et
-- isolement ; motif réservé aux soignants (tableau, table, journal) ; constantes
-- (soignants seulement, alertes d'après la table des seuils, 18/11 en alerte, seuil
-- modifié pris en compte, âge, ajout seul, annulation motivée) ; appel du suivant
-- (priorité puis arrivée), rappel ; écran d'appel (jeton, canal secret, message poussé
-- par la base sans nom ni service, révocation) ; déplacements ; suivi public du ticket
-- (jeton aléatoire du jour, sans service) ; ticket de
-- consultation (vente + arrivée, recette en attente, gratuité motivée, tarif manquant) ;
-- fusion de dossiers ; lecture seule ; anonymes.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape12.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3 à 12 appliquées (dont etape12_confidentialite et
-- etape12c_gratuites).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation : A owner du poste, B owner d'une clinique ; chez A : D admin,
-- C infirmier, 05 aide-soignant, 06 caissier, 07 pharmacien, 09 accueil, 10 comptable.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a120-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e12-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '05', '06', '07', '09', '10']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a120-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a120-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org_a')::uuid, ('00000000-0000-4000-a120-0000000000' || c)::uuid,
       r, true
  from (values ('0d', 'admin'), ('0c', 'infirmier'), ('05', 'aide_soignant'),
               ('06', 'caissier'), ('07', 'pharmacien'), ('09', 'accueil'),
               ('10', 'comptable')) v(c, r);

-- Prestations et tarifs (étape 7) : consultation à 1 000 FCFA, une prestation sans tarif.
insert into public.services (org_id, label, category, price)
values (current_setting('test.org_a')::uuid, 'Consultation adulte', 'consultation', 1000),
       (current_setting('test.org_a')::uuid, 'Consultation enfant', 'consultation', null);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a120-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.en_tant_que(text) to authenticated;

-- Raccourcis : service de file et salle de A par lettre / libellé.
create function pg_temp.service(p_lettre text) returns uuid language sql as $$
  select id from public.queue_services
   where org_id = current_setting('test.org_a')::uuid and letter = p_lettre;
$$;
create function pg_temp.salle(p_libelle text) returns uuid language sql as $$
  select id from public.rooms
   where org_id = current_setting('test.org_a')::uuid and label = p_libelle;
$$;
grant execute on function pg_temp.service(text), pg_temp.salle(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres pré-remplis
-- -----------------------------------------------------------------------------
do $$
begin
  -- 5 files au poste : la PF arrive dans la file « Sage-femme » (CPN), étape 13 D.
  if (select count(*) from public.queue_services
      where org_id = current_setting('test.org_a')::uuid) <> 5
     or (select label from public.queue_services
         where org_id = current_setting('test.org_a')::uuid and letter = 'C') <> 'Vaccination'
     or not exists (select 1 from public.queue_services
                    where org_id = current_setting('test.org_b')::uuid and label = 'Imagerie')
     or (select count(*) from public.rooms where org_id = current_setting('test.org_a')::uuid) <> 2
     or (select count(*) from public.vital_thresholds
         where org_id = current_setting('test.org_a')::uuid) < 10 then
    raise exception 'ÉCHEC : services de file, salles ou seuils non pré-remplis';
  end if;
  raise notice 'OK : services de file (lettres), salles et seuils pré-remplis par type';
end $$;

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Arrivées
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');  -- caissier
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid;
  v_v   public.visits;
begin
  insert into public.patients (org_id, last_name, first_name, sex, birth_date)
  values (v_org, 'Ndiaye', 'Fatou', 'F', '1980-05-01') returning id into v_p;
  perform set_config('test.p1', v_p::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, birth_date)
  values (v_org, 'Sow', 'Awa', 'F', (now() - interval '2 years 3 months')::date)
  returning id into v_p;
  perform set_config('test.p2', v_p::text, true);
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Fall', 'Coumba', 'F', 24) returning id into v_p;
  perform set_config('test.p3', v_p::text, true);

  v_v := public.register_arrival(v_org, current_setting('test.p1')::uuid, pg_temp.service('A'),
                                 'normal', 'Dépistage VIH');
  perform set_config('test.v1', v_v.id::text, true);
  if v_v.ticket_number <> 'A-001' or v_v.status <> 'waiting'
     or v_v.visit_date <> (now() at time zone 'Africa/Dakar')::date then
    raise exception 'ÉCHEC : premier ticket inattendu : %', v_v.ticket_number;
  end if;

  v_v := public.register_arrival(v_org, current_setting('test.p2')::uuid, pg_temp.service('A'),
                                 'under_five');
  perform set_config('test.v2', v_v.id::text, true);
  v_v := public.register_arrival(v_org, current_setting('test.p3')::uuid, pg_temp.service('A'),
                                 'pregnant');
  perform set_config('test.v3', v_v.id::text, true);
  if v_v.ticket_number <> 'A-003' then
    raise exception 'ÉCHEC : numéros qui ne se suivent pas';
  end if;
  v_v := public.register_arrival(v_org, current_setting('test.p1')::uuid, pg_temp.service('C'));
  perform set_config('test.v4', v_v.id::text, true);
  if v_v.ticket_number <> 'C-001' then
    raise exception 'ÉCHEC : numérotation par service : %', v_v.ticket_number;
  end if;
  raise notice 'OK : le caissier enregistre les arrivées ; A-001, A-002, A-003, puis C-001';

  begin
    perform public.register_arrival(v_org, current_setting('test.p1')::uuid, pg_temp.service('A'));
    raise exception 'ÉCHEC : double ticket dans le même service';
  exception when invalid_parameter_value then
    raise notice 'OK : un patient n''attend qu''une fois par service (%)', sqlerrm;
  end;

  begin
    insert into public.visits (org_id, patient_id, queue_service_id, visit_date, ticket_seq,
                               ticket_number)
    values (v_org, current_setting('test.p1')::uuid, pg_temp.service('B'), current_date, 9, 'B-009');
    raise exception 'ÉCHEC : passage créé en direct';
  exception when insufficient_privilege then
    raise notice 'OK : passages créés par le serveur seulement';
  end;
end $$;

-- Pharmacien et comptable : hors de la file. B : rien chez A.
select pg_temp.en_tant_que('07');
do $$
begin
  begin
    perform public.register_arrival(current_setting('test.org_a')::uuid,
      current_setting('test.p1')::uuid, pg_temp.service('B'));
    raise exception 'ÉCHEC : le pharmacien enregistre une arrivée';
  exception when insufficient_privilege then
    null;
  end;
  if exists (select 1 from public.visits) then
    raise exception 'ÉCHEC : le pharmacien lit la file';
  end if;
end $$;
select pg_temp.en_tant_que('10');
do $$
begin
  if exists (select 1 from public.visits) then
    raise exception 'ÉCHEC : le comptable lit la file';
  end if;
  raise notice 'OK : pharmacien et comptable hors de la file';
end $$;

select pg_temp.en_tant_que('0b');
do $$
begin
  if exists (select 1 from public.visits) or exists (select 1 from public.rooms
             where org_id = current_setting('test.org_a')::uuid) then
    raise exception 'ÉCHEC : B voit la file de A';
  end if;
  begin
    perform public.get_queue_board(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : B lit le tableau de A';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.register_arrival(current_setting('test.org_a')::uuid,
      current_setting('test.p1')::uuid, pg_temp.service('B'));
    raise exception 'ÉCHEC : B enregistre une arrivée chez A';
  exception when insufficient_privilege then
    raise notice 'OK : isolement entre structures';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Secret médical : le motif
-- -----------------------------------------------------------------------------
do $$
declare
  v_code text;
begin
  foreach v_code in array array['06', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    if (select count(*) from public.get_queue_board(current_setting('test.org_a')::uuid)) <> 4 then
      raise exception 'ÉCHEC : le rôle % ne lit pas le tableau', v_code;
    end if;
    if exists (select 1 from public.get_queue_board(current_setting('test.org_a')::uuid)
               where reason is not null)
       or exists (select 1 from public.visit_reasons) then
      raise exception 'ÉCHEC : le rôle % lit le motif', v_code;
    end if;
  end loop;
  raise notice 'OK : caissier et accueil : service et priorité, jamais le motif';
end $$;

select pg_temp.en_tant_que('0c');  -- infirmier
do $$
begin
  if (select reason from public.get_queue_board(current_setting('test.org_a')::uuid)
      where visit_id = current_setting('test.v1')::uuid) <> 'Dépistage VIH' then
    raise exception 'ÉCHEC : l''infirmier ne lit pas le motif';
  end if;
  raise notice 'OK : l''infirmier lit le motif';
end $$;

reset role;
do $$
begin
  -- Lignes de ce test seulement : fajkat-dev contient aussi des données réelles.
  if exists (select 1 from public.audit_logs
             where org_id = current_setting('test.org_a')::uuid
               and table_name = 'visit_reasons' and coalesce(new_data::text, '') ~* 'dépistage') then
    raise exception 'ÉCHEC : motif recopié dans audit_logs';
  end if;
  if not exists (select 1 from public.audit_logs
                 where org_id = current_setting('test.org_a')::uuid
                   and table_name = 'visit_reasons') then
    raise exception 'ÉCHEC : motif non journalisé';
  end if;
  raise notice 'OK : motif journalisé sans sa valeur';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Constantes
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0c');
do $$
declare
  v_m public.vital_signs;
begin
  v_m := public.save_vitals(current_setting('test.v1')::uuid,
    '{"systolic": 180, "diastolic": 110, "temperature_c": 37.2, "weight_kg": 68.5, "muac_mm": 110}');
  perform set_config('test.vs1', v_m.id::text, true);
  if not v_m.alerts @> '[{"measure": "systolic", "level": "alert", "label": "Tension très élevée"}]'
     or not v_m.alerts @> '[{"measure": "diastolic", "level": "alert"}]' then
    raise exception 'ÉCHEC : 18/11 non signalé en alerte : %', v_m.alerts;
  end if;
  if jsonb_array_length(v_m.alerts) <> 2 then
    raise exception 'ÉCHEC : alertes en double, ou périmètre brachial d''enfant appliqué à un adulte : %',
      v_m.alerts;
  end if;
  if (select status from public.visits where id = current_setting('test.v1')::uuid) <> 'vitals' then
    raise exception 'ÉCHEC : le patient ne passe pas dans « Constantes »';
  end if;
  if (select vitals_level from public.get_queue_board(current_setting('test.org_a')::uuid)
      where visit_id = current_setting('test.v1')::uuid) <> 'alert' then
    raise exception 'ÉCHEC : alerte absente du tableau';
  end if;
  raise notice 'OK : une tension de 18/11 apparaît en alerte (seuil le plus grave seulement)';

  v_m := public.save_vitals(current_setting('test.v2')::uuid, '{"muac_mm": 110, "temperature_c": 38.4}');
  if not v_m.alerts @> '[{"measure": "muac_mm", "label": "Malnutrition aiguë sévère"}]'
     or not v_m.alerts @> '[{"measure": "temperature_c", "level": "warning"}]' then
    raise exception 'ÉCHEC : alertes de l''enfant : %', v_m.alerts;
  end if;
  raise notice 'OK : seuils selon l''âge (périmètre brachial de l''enfant, fièvre)';

  begin
    perform public.save_vitals(current_setting('test.v1')::uuid, '{"systolic": 1200, "diastolic": 80}');
    raise exception 'ÉCHEC : valeur impossible acceptée';
  exception when check_violation then
    null;
  end;
  begin
    perform public.save_vitals(current_setting('test.v1')::uuid, '{"tension": "18/11"}');
    raise exception 'ÉCHEC : mesure inconnue acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : fautes de frappe et mesures inconnues refusées';
  end;

  if (public.vital_alerts(current_setting('test.p1')::uuid, '{"spo2": 89}') -> 0 ->> 'label')
     <> 'Saturation très basse' then
    raise exception 'ÉCHEC : aperçu des alertes';
  end if;
  -- Aucune alerte sur une valeur impossible ni sur une tension incomplète.
  if public.vital_alerts(current_setting('test.p1')::uuid, '{"systolic": 1200, "diastolic": 80}') <> '[]'::jsonb
     or public.vital_alerts(current_setting('test.p1')::uuid, '{"systolic": 200}') <> '[]'::jsonb
     or public.vital_alerts(current_setting('test.p1')::uuid, '{"temperature_c": 375}') <> '[]'::jsonb then
    raise exception 'ÉCHEC : alerte calculée sur une valeur impossible ou une tension incomplète';
  end if;
  if (select count(*) from jsonb_object_keys(public.vital_sign_bounds())) <> 9
     or (public.vital_sign_bounds() -> 'systolic' ->> 'max')::numeric <> 300
     or (public.vital_sign_bounds() -> 'weight_kg' ->> 'min')::numeric <> 0.3 then
    raise exception 'ÉCHEC : bornes de vraisemblance : %', public.vital_sign_bounds();
  end if;
  raise notice 'OK : bornes lues dans la base ; pas d''alerte sur une valeur impossible ou incomplète';

  begin
    update public.vital_signs set systolic = 120 where id = current_setting('test.vs1')::uuid;
    raise exception 'ÉCHEC : mesure modifiée en direct';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.void_vitals(current_setting('test.vs1')::uuid, '');
    raise exception 'ÉCHEC : annulation sans motif';
  exception when invalid_parameter_value then
    null;
  end;
  raise notice 'OK : aperçu des alertes ; mesure jamais modifiée, annulation motivée';
end $$;

-- Caissier, accueil : jamais les constantes.
do $$
declare
  v_code text;
begin
  foreach v_code in array array['06', '09'] loop
    perform pg_temp.en_tant_que(v_code);
    if exists (select 1 from public.vital_signs)
       or exists (select 1 from public.get_queue_board(current_setting('test.org_a')::uuid)
                  where vitals_level is not null) then
      raise exception 'ÉCHEC : le rôle % lit les constantes', v_code;
    end if;
    begin
      perform public.save_vitals(current_setting('test.v3')::uuid, '{"pulse": 80}');
      raise exception 'ÉCHEC : le rôle % saisit des constantes', v_code;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'OK : caissier et accueil sans constantes';
end $$;

-- Aide-soignant : prend les constantes.
select pg_temp.en_tant_que('05');
do $$
begin
  perform public.save_vitals(current_setting('test.v3')::uuid, '{"systolic": 185, "diastolic": 100}');
  raise notice 'OK : l''aide-soignant prend les constantes';
end $$;

-- Seuil changé par l'admin : appliqué aux mesures suivantes.
select pg_temp.en_tant_que('0d');
do $$
begin
  update public.vital_thresholds set at_or_above = 190
   where org_id = current_setting('test.org_a')::uuid and template_code = 'systolic_very_high';
end $$;
select pg_temp.en_tant_que('0c');
do $$
declare
  v_m public.vital_signs;
begin
  v_m := public.save_vitals(current_setting('test.v3')::uuid, '{"systolic": 185, "diastolic": 100}');
  if not v_m.alerts @> '[{"measure": "systolic", "level": "warning", "threshold": 140}]'
     or v_m.alerts @> '[{"measure": "systolic", "level": "alert"}]' then
    raise exception 'ÉCHEC : seuil modifié non pris en compte : %', v_m.alerts;
  end if;
  perform public.void_vitals(v_m.id, 'Brassard mal posé');
  raise notice 'OK : seuils lus dans la table paramétrable (aucune valeur en dur)';
end $$;

select pg_temp.en_tant_que('0c');
do $$
begin
  begin
    update public.vital_thresholds set at_or_above = 200
     where org_id = current_setting('test.org_a')::uuid;
    if found then
      raise exception 'ÉCHEC : l''infirmier modifie les seuils';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK : seuils modifiables par owner et admin seulement';
end $$;

reset role;
do $$
begin
  -- Lignes de ce test seulement : fajkat-dev contient aussi des données réelles.
  if exists (select 1 from public.audit_logs
             where org_id = current_setting('test.org_a')::uuid and table_name = 'vital_signs'
               and (new_data ? 'systolic' or old_data is not null)) then
    raise exception 'ÉCHEC : valeurs de constantes recopiées dans audit_logs';
  end if;
  if (select count(*) from public.vital_signs
      where org_id = current_setting('test.org_a')::uuid and deleted_at is not null) <> 1 then
    raise exception 'ÉCHEC : mesure annulée effacée';
  end if;
  raise notice 'OK : constantes journalisées sans valeurs, mesure annulée conservée';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Écran d'appel
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
begin
  perform public.create_display_screen(current_setting('test.org_a')::uuid, 'Télé');
  raise exception 'ÉCHEC : le caissier crée un écran d''appel';
exception when insufficient_privilege then
  raise notice 'OK : écrans d''appel gérés par owner et admin';
end $$;

select pg_temp.en_tant_que('0d');
do $$
declare
  v_r record;
begin
  select * into v_r from public.create_display_screen(current_setting('test.org_a')::uuid,
                                                      'Télé de la salle d''attente');
  perform set_config('test.ecran', v_r.id::text, true);
  perform set_config('test.jeton', v_r.token, true);
  select * into v_r from public.create_display_screen(current_setting('test.org_a')::uuid,
                                                      'Télé de la vaccination',
                                                      array[pg_temp.service('C')]);
  perform set_config('test.ecran_vacc', v_r.id::text, true);
  begin
    perform token_hash from public.display_screens;
    raise exception 'ÉCHEC : jeton haché lisible';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform channel_topic from public.display_screens;
    raise exception 'ÉCHEC : nom du canal lisible';
  exception when insufficient_privilege then
    raise notice 'OK : ni le jeton ni le canal ne sont lisibles dans la table';
  end;
end $$;

reset role;
select set_config('test.topic', (select channel_topic from public.display_screens
  where id = current_setting('test.ecran')::uuid), true);
select set_config('test.topic_vacc', (select channel_topic from public.display_screens
  where id = current_setting('test.ecran_vacc')::uuid), true);
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Appel du suivant (accueil)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_v public.visits;
begin
  -- En attente ou aux constantes : A-002 (moins de 5 ans), A-003 (enceinte), A-001 (normale).
  v_v := public.call_next(current_setting('test.org_a')::uuid, 'consultation', null,
                          array[pg_temp.service('A')]);
  if v_v.ticket_number <> 'A-002' or v_v.status <> 'consultation' or v_v.call_count <> 1
     or v_v.room_id <> pg_temp.salle('Salle de consultation') then
    raise exception 'ÉCHEC : mauvais patient appelé : % (%)', v_v.ticket_number, v_v.status;
  end if;
  v_v := public.call_next(current_setting('test.org_a')::uuid, 'consultation',
                          pg_temp.salle('Salle de soins'), array[pg_temp.service('A')]);
  if v_v.ticket_number <> 'A-003' or v_v.room_id <> pg_temp.salle('Salle de soins') then
    raise exception 'ÉCHEC : priorité non respectée : %', v_v.ticket_number;
  end if;
  raise notice 'OK : « Appeler le suivant » : priorité, puis heure d''arrivée ; salle choisie';

  v_v := public.call_visit(current_setting('test.v2')::uuid, 'consultation');
  if v_v.call_count <> 2 or v_v.room_id <> pg_temp.salle('Salle de consultation') then
    raise exception 'ÉCHEC : rappel';
  end if;
  raise notice 'OK : rappel du même patient dans la même salle';
end $$;

reset role;
do $$
declare
  v_msg jsonb;
begin
  -- Sans Realtime (base locale), display_send n'envoie rien : on ne vérifie que si
  -- realtime.messages existe.
  if to_regclass('realtime.messages') is null then
    raise notice 'OK : (Realtime absent : envoi Broadcast non vérifié ici)';
    return;
  end if;
  -- Le rappel d'A-002 (2e appel) : tous les messages d'une transaction ont la même heure,
  -- on cherche donc le message attendu plutôt que « le dernier ».
  select payload into v_msg from realtime.messages
   where topic = current_setting('test.topic') and event = 'call'
     and payload ->> 'ticket_number' = 'A-002' and (payload ->> 'call_count')::int = 2;
  if v_msg is null or v_msg ->> 'initials' <> 'A. S.'
     or v_msg ->> 'room' <> 'Salle de consultation' then
    raise exception 'ÉCHEC : appel non poussé vers l''écran : %', v_msg;
  end if;
  -- Messages de ce test seulement (les deux écrans créés plus haut). realtime.send ajoute
  -- un « id » (identifiant du message) quand il manque : seule clé tolérée en plus.
  if exists (select 1 from realtime.messages
             where topic in (current_setting('test.topic'), current_setting('test.topic_vacc'))
               and event = 'call' and payload::text ~* 'sow|awa|ndiaye|fatou|fall|coumba') then
    raise exception 'ÉCHEC : nom du patient envoyé à l''écran';
  end if;
  if exists (select 1 from realtime.messages
             where topic in (current_setting('test.topic'), current_setting('test.topic_vacc'))
               and event = 'call' and private is distinct from false) then
    raise exception 'ÉCHEC : message envoyé sur un canal privé (l''écran sans compte ne le reçoit pas)';
  end if;
  if exists (select 1 from realtime.messages
             where topic in (current_setting('test.topic'), current_setting('test.topic_vacc'))
               and event = 'call'
               and exists (select 1 from jsonb_object_keys(payload - 'id') k
                            where k not in ('call_count', 'called_at', 'initials', 'room',
                                            'ticket_number', 'visit_id'))) then
    raise exception 'ÉCHEC : champ en trop envoyé à l''écran (service ?) : %',
      (select payload from realtime.messages
        where topic = current_setting('test.topic') and event = 'call' limit 1);
  end if;
  if exists (select 1 from realtime.messages where topic = current_setting('test.topic_vacc')) then
    raise exception 'ÉCHEC : écran de la vaccination prévenu pour une consultation';
  end if;
  raise notice 'OK : appel poussé par la base vers l''écran (numéro, initiales, salle ; ni nom ni service)';
end $$;

set local role anon;
do $$
declare
  v_b jsonb;
begin
  v_b := public.get_display_board(current_setting('test.jeton'));
  if v_b ->> 'status' <> 'valid' or v_b ->> 'topic' <> current_setting('test.topic')
     or jsonb_array_length(v_b -> 'calls') <> 2
     or v_b -> 'calls' -> 0 ->> 'ticket_number' <> 'A-002'
     or (v_b -> 'calls')::text ~* 'sow|awa|ndiaye|fatou|fall|coumba'
     or v_b -> 'calls' -> 0 ? 'service' then
    raise exception 'ÉCHEC : écran d''appel : %', v_b;
  end if;
  if public.get_display_board('mauvais-jeton') ->> 'status' <> 'unknown' then
    raise exception 'ÉCHEC : jeton inconnu accepté';
  end if;
  begin
    perform 1 from public.visits;
    raise exception 'ÉCHEC : file lisible sans connexion';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK : écran sans connexion : derniers appels (sans service) et canal, rien d''autre';
end $$;

reset role;
set local role authenticated;
select pg_temp.en_tant_que('0a');
select public.revoke_display_screen(current_setting('test.ecran')::uuid);
reset role;
set local role anon;
do $$
begin
  if public.get_display_board(current_setting('test.jeton')) ->> 'status' <> 'revoked' then
    raise exception 'ÉCHEC : écran révoqué encore valable';
  end if;
end $$;
reset role;
do $$
begin
  if to_regclass('realtime.messages') is not null and not exists (
       select 1 from realtime.messages
        where topic = current_setting('test.topic') and event = 'revoked') then
    raise exception 'ÉCHEC : l''écran ouvert n''est pas prévenu de la révocation';
  end if;
  raise notice 'OK : écran révoqué, prévenu aussitôt';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Déplacements sur le tableau
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_v public.visits;
begin
  v_v := public.move_visit(current_setting('test.v2')::uuid, 'done');
  if v_v.finished_at is null then
    raise exception 'ÉCHEC : fin de passage non horodatée';
  end if;
  begin
    perform public.move_visit(current_setting('test.v2')::uuid, 'consultation');
    raise exception 'ÉCHEC : passage clos déplacé';
  exception when invalid_parameter_value then
    null;
  end;
  v_v := public.move_visit(current_setting('test.v2')::uuid, 'waiting');
  if v_v.finished_at is not null or v_v.status <> 'waiting' then
    raise exception 'ÉCHEC : passage non rouvert';
  end if;
  v_v := public.move_visit(current_setting('test.v2')::uuid, 'left');
  begin
    perform public.move_visit(current_setting('test.v1')::uuid, 'perdu');
    raise exception 'ÉCHEC : étape inconnue acceptée';
  exception when invalid_parameter_value then
    null;
  end;
  if public.call_next(current_setting('test.org_a')::uuid, 'vitals', null,
                      array[pg_temp.service('B')]) is not null then
    raise exception 'ÉCHEC : appel alors que personne n''attend';
  end if;
  raise notice 'OK : déplacements (clos, rouvert, parti), étape inconnue refusée, file vide';
end $$;

-- -----------------------------------------------------------------------------
-- Suivi public du ticket (QR) : C-001 est un ticket de vaccination
-- -----------------------------------------------------------------------------
reset role;
do $$
begin
  if exists (select 1 from public.visits
             where org_id = current_setting('test.org_a')::uuid
               and (public_code !~ '^[0-9a-f]{32}$'
                    or public_code = replace(id::text, '-', ''))) then
    raise exception 'ÉCHEC : jeton du QR trop court ou tiré de l''id du passage';
  end if;
end $$;
select set_config('test.code_v4', (select public_code from public.visits
  where id = current_setting('test.v4')::uuid), true);
select set_config('test.code_v3', (select public_code from public.visits
  where id = current_setting('test.v3')::uuid), true);
set local role anon;
do $$
declare
  v_t jsonb := public.get_ticket_public(current_setting('test.code_v4'));
begin
  if v_t ->> 'status' <> 'waiting' or v_t ->> 'ticket_number' <> 'C-001'
     or (v_t ->> 'ahead')::integer <> 0
     or v_t::text ~* 'ndiaye|fatou|dépistage|vaccination' or v_t ? 'service' then
    raise exception 'ÉCHEC : suivi du ticket : %', v_t;
  end if;
  v_t := public.get_ticket_public(current_setting('test.code_v3'));
  if v_t ->> 'status' <> 'called' or v_t ->> 'room' <> 'Salle de soins' then
    raise exception 'ÉCHEC : salle absente du suivi : %', v_t;
  end if;
  if public.get_ticket_public('inconnu') ->> 'status' <> 'unknown'
     or public.get_ticket_public(current_setting('test.v4')) ->> 'status' <> 'unknown' then
    raise exception 'ÉCHEC : code inconnu ou id du passage accepté';
  end if;
  raise notice 'OK : suivi du ticket sans connexion : numéro, rang, salle ; ni nom, ni motif, ni service';
end $$;

-- Personnes devant : même ordre que « Appeler le suivant » (priorité, puis arrivée), en
-- comptant les patients en attente ET aux constantes ; jamais ceux d'une autre file.
reset role;
set local role authenticated;
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid[];
  v_v   public.visits;
  v_c   text[] := '{}';
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  select v_org, 'Rang', 'Patient ' || i, 'M', 30 + i from generate_series(1, 4) i;
  v_p := array(select id from public.patients where org_id = v_org and last_name = 'Rang'
               order by first_name);
  -- File D (soins), vide jusqu'ici : D-001 et D-002 normales, D-003 normale, D-004 urgence.
  foreach v_v in array array[
      public.register_arrival(v_org, v_p[1], pg_temp.service('D'), 'normal'),
      public.register_arrival(v_org, v_p[2], pg_temp.service('D'), 'normal'),
      public.register_arrival(v_org, v_p[3], pg_temp.service('D'), 'normal'),
      public.register_arrival(v_org, v_p[4], pg_temp.service('D'), 'emergency')] loop
    v_c := v_c || v_v.public_code;
  end loop;
  perform set_config('test.rang', array_to_string(v_c, ','), true);
end $$;

set local role anon;
do $$
declare
  v_c text[] := string_to_array(current_setting('test.rang'), ',');
begin
  if (public.get_ticket_public(v_c[2]) ->> 'ahead')::int <> 2 then
    raise exception 'ÉCHEC : D-002 (normale) derrière D-001 (normale) et D-004 (urgence) : %',
      public.get_ticket_public(v_c[2]);
  end if;
  if (public.get_ticket_public(v_c[4]) ->> 'ahead')::int <> 0 then
    raise exception 'ÉCHEC : l''urgence passe devant tout le monde';
  end if;
  raise notice 'OK : personnes devant : priorité, puis heure d''arrivée (normale derrière normale)';
end $$;

-- D-001 aux constantes : elle reste devant D-002 (call_next l'appellera avant).
reset role;
update public.visits set status = 'vitals'
 where public_code = split_part(current_setting('test.rang'), ',', 1);
set local role anon;
do $$
declare
  v_c text[] := string_to_array(current_setting('test.rang'), ',');
begin
  if (public.get_ticket_public(v_c[2]) ->> 'ahead')::int <> 2
     or (public.get_ticket_public(v_c[3]) ->> 'ahead')::int <> 3 then
    raise exception 'ÉCHEC : patient aux constantes oublié dans les personnes devant';
  end if;
  raise notice 'OK : un patient aux constantes reste compté devant (même ordre que l''appel)';
end $$;
reset role;
set local role authenticated;

-- Le lendemain, le jeton ne vaut plus rien.
reset role;
update public.visits set visit_date = visit_date - 1 where id = current_setting('test.v4')::uuid;
set local role anon;
do $$
declare
  v_t jsonb := public.get_ticket_public(current_setting('test.code_v4'));
begin
  if v_t <> '{"status": "expired"}'::jsonb then
    raise exception 'ÉCHEC : jeton d''un autre jour encore valable : %', v_t;
  end if;
  raise notice 'OK : jeton du QR valable le jour du passage seulement';
end $$;
reset role;
update public.visits set visit_date = visit_date + 1 where id = current_setting('test.v4')::uuid;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Ticket de consultation (poste de santé)
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid;
  v_r   jsonb;
  v_svc uuid := (select id from public.services where org_id = v_org and label = 'Consultation adulte');
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diallo', 'Mamadou', 'M', 45) returning id into v_p;
  perform set_config('test.p4', v_p::text, true);

  v_r := public.sell_consultation_ticket(v_org, v_p, v_svc, pg_temp.service('A'), 'elderly',
                                         null, 'wave', 'TX-123');
  if v_r ->> 'ticket_number' <> 'A-004' or (v_r ->> 'amount')::bigint <> 1000
     or v_r ->> 'receipt_number' not like 'R-____-000001' then
    raise exception 'ÉCHEC : vente du ticket : %', v_r;
  end if;
  if (select source from public.visits where id = (v_r ->> 'visit_id')::uuid) <> 'consultation_ticket'
     or not exists (select 1 from public.pending_receipts
                    where source_id = (v_r ->> 'visit_id')::uuid and status = 'pending'
                      and amount = 1000 and payment_method = 'wave') then
    raise exception 'ÉCHEC : arrivée ou recette en attente manquante';
  end if;
  raise notice 'OK : ticket vendu et arrivée enregistrée d''un seul geste ; recette en attente';

  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (v_org, 'Diallo', 'Aïssatou', 'F', 3) returning id into v_p;
  v_r := public.sell_consultation_ticket(v_org, v_p, v_svc, pg_temp.service('A'), 'under_five',
                                         null, null, null,
                                         (select id from public.exemption_reasons
                                           where org_id = v_org
                                             and template_code = 'moins_5_ans'));
  if (v_r ->> 'amount')::bigint <> 0 or v_r ->> 'receipt_number' is not null then
    raise exception 'ÉCHEC : gratuité : %', v_r;
  end if;
  begin
    perform public.sell_consultation_ticket(v_org, current_setting('test.p3')::uuid,
      (select id from public.services where org_id = v_org and label = 'Consultation enfant'),
      pg_temp.service('B'));
    raise exception 'ÉCHEC : ticket vendu sans tarif';
  exception when invalid_parameter_value then
    null;
  end;
  begin
    perform public.sell_consultation_ticket(v_org, current_setting('test.p3')::uuid, v_svc,
                                            pg_temp.service('B'), 'normal', null, 'cheque');
    raise exception 'ÉCHEC : mode de paiement inconnu accepté';
  exception when invalid_parameter_value then
    null;
  end;
  if exists (select 1 from public.visits where patient_id = current_setting('test.p3')::uuid
             and queue_service_id = pg_temp.service('B')) then
    raise exception 'ÉCHEC : arrivée gardée malgré une vente refusée';
  end if;
  raise notice 'OK : gratuité motivée sans recette ; tarif manquant et paiement inconnu refusés';
end $$;

select pg_temp.en_tant_que('09');
do $$
begin
  if not exists (select 1 from public.consultation_tickets) or exists (select 1 from public.pending_receipts) then
    raise exception 'ÉCHEC : droits de l''accueil sur tickets et recettes';
  end if;
end $$;
select pg_temp.en_tant_que('10');
do $$
begin
  if (select count(*) from public.pending_receipts) <> 1 then
    raise exception 'ÉCHEC : le comptable ne voit pas la recette en attente';
  end if;
  raise notice 'OK : recettes en attente : caisse et comptabilité, pas l''accueil';
end $$;

select pg_temp.en_tant_que('0b');
do $$
declare
  v_p uuid;
begin
  insert into public.patients (org_id, last_name, first_name, sex, declared_age)
  values (current_setting('test.org_b')::uuid, 'Gueye', 'Ousmane', 'M', 50) returning id into v_p;
  perform public.sell_consultation_ticket(current_setting('test.org_b')::uuid, v_p,
    gen_random_uuid(), (select id from public.queue_services
                         where org_id = current_setting('test.org_b')::uuid and letter = 'A'));
  raise exception 'ÉCHEC : ticket de consultation vendu dans une clinique';
exception when insufficient_privilege then
  raise notice 'OK : tickets de consultation réservés aux postes de santé';
end $$;

-- -----------------------------------------------------------------------------
-- Fusion : le passage suit le dossier gardé
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0d');
do $$
begin
  perform public.merge_patients(current_setting('test.p1')::uuid,
                                current_setting('test.p4')::uuid, 'Même personne');
  if exists (select 1 from public.visits where patient_id = current_setting('test.p4')::uuid)
     or exists (select 1 from public.pending_receipts
                where patient_id = current_setting('test.p4')::uuid) then
    raise exception 'ÉCHEC : passage ou recette restés sur le doublon';
  end if;
  raise notice 'OK : fusion : passages, tickets et recettes suivent le dossier gardé';
end $$;

-- -----------------------------------------------------------------------------
-- Lecture seule
-- -----------------------------------------------------------------------------
reset role;
update public.organizations set status = 'read_only' where id = current_setting('test.org_a')::uuid;
set local role authenticated;

select pg_temp.en_tant_que('09');
do $$
begin
  if (select count(*) from public.get_queue_board(current_setting('test.org_a')::uuid)) = 0 then
    raise exception 'ÉCHEC : tableau illisible en lecture seule';
  end if;
  begin
    perform public.register_arrival(current_setting('test.org_a')::uuid,
      current_setting('test.p3')::uuid, pg_temp.service('B'));
    raise exception 'ÉCHEC : arrivée en lecture seule';
  exception when invalid_parameter_value then
    null;
  end;
  begin
    perform public.call_next(current_setting('test.org_a')::uuid, 'consultation');
    raise exception 'ÉCHEC : appel en lecture seule';
  exception when invalid_parameter_value then
    raise notice 'OK : lecture seule : tableau lisible, ni arrivée ni appel';
  end;
end $$;

reset role;

rollback;
