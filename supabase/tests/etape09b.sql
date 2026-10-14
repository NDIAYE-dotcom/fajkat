-- =============================================================================
-- Tests — étape 9b (Personnel : fiches, planning, présences, congés)
-- -----------------------------------------------------------------------------
-- Vérifie : fiche créée avec chaque membre ; owner et admin voient et modifient toutes
-- les fiches, le membre la sienne (téléphone et contact d'urgence seulement) ; pièces
-- jointes dans le bucket privé ; créneaux par défaut et planning écrit par les seuls
-- responsables ; pointage à l'heure du serveur, jamais écrit en direct ; corrections
-- avec motif, journalisées ; congés (maladie sans motif, chevauchement refusé, décision
-- réservée, calendrier sans type, conflits avec les gardes) ; structure étrangère
-- et abonnement en lecture seule.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape09b.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3, 6, 7, 9 et 9b appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation
--   A : owner du poste de santé ; B : owner d'une clinique ; C : infirmier chez A.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a9b0-00000000000a', 'authenticated', 'authenticated',
   'e9b-a@fajkat.invalid', '{"full_name": "Aminata Test A"}', now(), now()),
  ('00000000-0000-4000-a9b0-00000000000b', 'authenticated', 'authenticated',
   'e9b-b@fajkat.invalid', '{"full_name": "Bineta Test B"}', now(), now()),
  ('00000000-0000-4000-a9b0-00000000000c', 'authenticated', 'authenticated',
   'e9b-c@fajkat.invalid', '{"full_name": "Cheikh Test C"}', now(), now());

update public.profiles set phone = '+221771234567', title = 'Infirmier d''État'
 where id = '00000000-0000-4000-a9b0-00000000000c';

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org_a')::uuid, '00000000-0000-4000-a9b0-00000000000c',
        'infirmier', true);

select set_config('test.m_a', (select id::text from public.memberships
  where user_id = '00000000-0000-4000-a9b0-00000000000a'), true);
select set_config('test.m_c', (select id::text from public.memberships
  where user_id = '00000000-0000-4000-a9b0-00000000000c'), true);
select set_config('test.f_c', (select id::text from public.staff_files
  where membership_id = current_setting('test.m_c')::uuid), true);

-- -----------------------------------------------------------------------------
-- C. Fiches
-- -----------------------------------------------------------------------------
do $$
begin
  if current_setting('test.f_c', true) is null or current_setting('test.f_c') = '' then
    raise exception 'ÉCHEC : aucune fiche créée pour le nouveau membre';
  end if;
  if (select phone from public.staff_files where id = current_setting('test.f_c')::uuid)
     <> '+221771234567' then
    raise exception 'ÉCHEC : téléphone de la fiche non repris du profil';
  end if;
  if not exists (select 1 from public.staff_files
                 where membership_id = current_setting('test.m_a')::uuid) then
    raise exception 'ÉCHEC : aucune fiche pour l''owner créé par create_organization';
  end if;
  raise notice 'OK : fiche créée avec chaque membre, téléphone repris du profil';
end $$;

set local role authenticated;

-- C : voit sa fiche seulement ; modifie téléphone et contact d'urgence, rien d'autre.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_n integer;
begin
  if (select count(*) from public.staff_files) <> 1 then
    raise exception 'ÉCHEC : un infirmier voit d''autres fiches que la sienne';
  end if;
  raise notice 'OK : un membre ne voit que sa fiche';

  update public.staff_files
     set phone = '+221770000001', emergency_contact_name = 'Awa Test',
         emergency_contact_phone = '+221770000002'
   where id = current_setting('test.f_c')::uuid;
  if (select emergency_contact_name from public.staff_files
      where id = current_setting('test.f_c')::uuid) <> 'Awa Test' then
    raise exception 'ÉCHEC : le membre ne modifie pas son contact d''urgence';
  end if;
  raise notice 'OK : un membre modifie son téléphone et son contact d''urgence';

  begin
    update public.staff_files set contract_type = 'titulaire'
     where id = current_setting('test.f_c')::uuid;
    raise exception 'ÉCHEC : un membre a changé son type de contrat';
  exception when insufficient_privilege then
    raise notice 'OK : un membre ne change ni son contrat ni sa fonction';
  end;

  update public.staff_files set phone = '+221770000003'
   where membership_id = current_setting('test.m_a')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : un membre a modifié la fiche d''un collègue';
  end if;
  raise notice 'OK : un membre ne modifie pas la fiche d''un collègue';

  -- Pièces jointes : lecture de la sienne, aucun dépôt.
  begin
    insert into storage.objects (bucket_id, name)
    values ('personnel', current_setting('test.org_a') || '/' || current_setting('test.f_c')
                         || '/intrus.pdf');
    raise exception 'ÉCHEC : un membre a déposé une pièce jointe';
  exception when insufficient_privilege then
    raise notice 'OK : un membre ne dépose pas de pièce jointe';
  end;
end $$;

-- A (owner) : voit et modifie toutes les fiches, dépose une pièce jointe.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_f_c   uuid := current_setting('test.f_c')::uuid;
  v_path  text := v_org_a || '/' || v_f_c || '/contrat-1.pdf';
begin
  if (select count(*) from public.staff_files where org_id = v_org_a) <> 2 then
    raise exception 'ÉCHEC : l''owner ne voit pas toutes les fiches';
  end if;
  update public.staff_files
     set contract_type = 'contractuel', job_title = 'Infirmier', start_date = '2026-01-05'
   where id = v_f_c;
  if (select contract_type from public.staff_files where id = v_f_c) <> 'contractuel' then
    raise exception 'ÉCHEC : l''owner ne modifie pas la fiche';
  end if;
  raise notice 'OK : l''owner voit et modifie toutes les fiches';

  insert into storage.objects (bucket_id, name) values ('personnel', v_path);
  insert into public.staff_attachments (org_id, staff_file_id, label, file_name, mime_type,
                                        size_bytes, storage_path)
  values (v_org_a, v_f_c, 'Contrat', 'contrat.pdf', 'application/pdf', 1200, v_path);
  begin
    insert into public.staff_attachments (org_id, staff_file_id, label, file_name, mime_type,
                                          size_bytes, storage_path)
    values (v_org_a, v_f_c, 'Ailleurs', 'x.pdf', 'application/pdf', 10, 'autre/x.pdf');
    raise exception 'ÉCHEC : pièce jointe rangée hors du dossier de la fiche';
  exception when check_violation then
    raise notice 'OK : pièce jointe déposée, rangée sous la structure et la fiche';
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  if (select count(*) from public.staff_attachments) <> 1
     or (select count(*) from storage.objects where bucket_id = 'personnel') <> 1 then
    raise exception 'ÉCHEC : le membre ne lit pas ses pièces jointes';
  end if;
  raise notice 'OK : le membre lit ses pièces jointes (URL signée possible)';
end $$;

-- B : rien chez A.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.staff_files where org_id = current_setting('test.org_a')::uuid)
     or exists (select 1 from public.staff_attachments)
     or exists (select 1 from storage.objects where bucket_id = 'personnel') then
    raise exception 'ÉCHEC : B voit les fiches ou pièces jointes de A';
  end if;
  raise notice 'OK : B ne voit ni les fiches ni les pièces jointes de A';
end $$;

-- -----------------------------------------------------------------------------
-- D. Planning
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_garde uuid;
begin
  if (select string_agg(label || ' ' || to_char(start_time, 'HH24:MI') || '-'
                        || to_char(end_time, 'HH24:MI'), ', ' order by sort_order)
        from public.shift_types where org_id = v_org_a)
     <> 'Jour 08:00-20:00, Nuit 20:00-08:00, Garde 08:00-08:00' then
    raise exception 'ÉCHEC : créneaux par défaut incorrects';
  end if;
  raise notice 'OK : créneaux par défaut Jour, Nuit, Garde';

  update public.shift_types set start_time = '07:30' where org_id = v_org_a and label = 'Jour';
  raise notice 'OK : l''owner modifie les horaires d''un créneau';

  select id into v_garde from public.shift_types where org_id = v_org_a and label = 'Garde';
  perform set_config('test.garde', v_garde::text, true);
  insert into public.shift_assignments (org_id, shift_type_id, membership_id, shift_date)
  values (v_org_a, v_garde, current_setting('test.m_c')::uuid, date '2026-11-03');
  begin
    insert into public.shift_assignments (org_id, shift_type_id, membership_id, shift_date)
    values (v_org_a, v_garde, current_setting('test.m_c')::uuid, date '2026-11-03');
    raise exception 'ÉCHEC : affectation en double acceptée';
  exception when unique_violation then
    raise notice 'OK : affectation enregistrée, sans doublon';
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  if (select count(*) from public.shift_assignments) <> 1
     or (select count(*) from public.shift_types) <> 3 then
    raise exception 'ÉCHEC : un membre ne lit pas le planning';
  end if;
  begin
    insert into public.shift_assignments (org_id, shift_type_id, membership_id, shift_date)
    values (current_setting('test.org_a')::uuid, current_setting('test.garde')::uuid,
            current_setting('test.m_c')::uuid, date '2026-11-04');
    raise exception 'ÉCHEC : un membre s''est affecté lui-même';
  exception when insufficient_privilege then
    raise notice 'OK : un membre lit le planning sans pouvoir le modifier';
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.shift_assignments)
     or exists (select 1 from public.shift_types
                where org_id = current_setting('test.org_a')::uuid) then
    raise exception 'ÉCHEC : B voit le planning de A';
  end if;
  raise notice 'OK : B ne voit pas le planning de A';
end $$;

-- -----------------------------------------------------------------------------
-- E. Présences
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_ligne public.attendance_records;
begin
  v_ligne := public.clock_in(current_setting('test.org_a')::uuid);
  if v_ligne.check_in_at <> now() or v_ligne.membership_id <> current_setting('test.m_c')::uuid
     or v_ligne.work_date <> (now() at time zone 'Africa/Dakar')::date then
    raise exception 'ÉCHEC : arrivée non horodatée par le serveur';
  end if;
  perform set_config('test.att', v_ligne.id::text, true);
  raise notice 'OK : arrivée à l''heure du serveur, jour dans le fuseau de la structure';

  begin
    perform public.clock_in(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : deux arrivées ouvertes';
  exception when invalid_parameter_value then
    raise notice 'OK : double pointage d''arrivée refusé';
  end;

  begin
    update public.attendance_records set check_in_at = now() - interval '3 hours';
    raise exception 'ÉCHEC : pointage modifié en direct';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.attendance_records (org_id, membership_id, work_date, check_in_at)
    values (current_setting('test.org_a')::uuid, current_setting('test.m_c')::uuid,
            current_date, now() - interval '1 day');
    raise exception 'ÉCHEC : pointage inséré en direct';
  exception when insufficient_privilege then
    raise notice 'OK : aucun pointage écrit ou modifié en direct';
  end;

  begin
    perform public.correct_attendance(current_setting('test.org_a')::uuid,
      v_ligne.id, now() - interval '2 hours', null, 'Je suis arrivé plus tôt');
    raise exception 'ÉCHEC : un membre corrige son pointage';
  exception when insufficient_privilege then
    raise notice 'OK : un membre ne corrige pas son pointage';
  end;
end $$;

-- Dans une transaction, now() est figé : on recule l'arrivée pour pointer le départ.
reset role;
update public.attendance_records set check_in_at = now() - interval '8 hours'
 where id = current_setting('test.att')::uuid;
set local role authenticated;

do $$
declare
  v_ligne public.attendance_records;
begin
  v_ligne := public.clock_out(current_setting('test.org_a')::uuid);
  if v_ligne.check_out_at <> now() then
    raise exception 'ÉCHEC : départ non horodaté par le serveur';
  end if;
  begin
    perform public.clock_out(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : départ sans arrivée accepté';
  exception when invalid_parameter_value then
    raise notice 'OK : départ à l''heure du serveur, une seule fois';
  end;
end $$;

-- A : liste du jour et correction.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_att   uuid := current_setting('test.att')::uuid;
  v_ligne public.attendance_records;
begin
  if not exists (select 1 from public.attendance_records
                 where org_id = v_org_a and work_date = public.org_today(v_org_a)) then
    raise exception 'ÉCHEC : l''owner ne voit pas les présences du jour';
  end if;
  raise notice 'OK : l''owner voit les présences du jour';

  begin
    perform public.correct_attendance(v_org_a, v_att, now() - interval '9 hours', now(), '  ');
    raise exception 'ÉCHEC : correction sans motif acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : correction sans motif refusée';
  end;
  begin
    perform public.correct_attendance(v_org_a, v_att, now() - interval '9 hours',
                                      now() + interval '1 hour', 'Erreur de saisie');
    raise exception 'ÉCHEC : départ dans le futur accepté';
  exception when invalid_parameter_value then
    raise notice 'OK : présence dans le futur refusée';
  end;

  v_ligne := public.correct_attendance(v_org_a, v_att, now() - interval '9 hours', now(),
                                       'Arrivé à 7 h, téléphone sans batterie');
  if not v_ligne.is_corrected
     or not exists (select 1 from public.attendance_corrections
                    where attendance_record_id = v_att
                      and reason = 'Arrivé à 7 h, téléphone sans batterie'
                      and old_check_in_at = now() - interval '8 hours')
     or not exists (select 1 from public.audit_logs
                    where table_name = 'attendance_corrections' and org_id = v_org_a) then
    raise exception 'ÉCHEC : correction non journalisée';
  end if;
  raise notice 'OK : correction avec motif, ancienne valeur gardée, journalisée';

  -- Pointage oublié, créé par le responsable.
  v_ligne := public.correct_attendance(v_org_a, null, now() - interval '30 hours',
    now() - interval '20 hours', 'Oubli de pointage, présence confirmée',
    current_setting('test.m_c')::uuid, (now() - interval '30 hours')::date);
  if v_ligne.id is null then
    raise exception 'ÉCHEC : pointage oublié non créé';
  end if;
  raise notice 'OK : pointage oublié ajouté par l''owner';
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  if (select count(*) from public.attendance_corrections) <> 2 then
    raise exception 'ÉCHEC : le membre ne voit pas les corrections de ses présences';
  end if;
  raise notice 'OK : le membre voit les corrections de ses présences';
end $$;

reset role;
do $$
begin
  update public.attendance_corrections set reason = 'Effacé';
  raise exception 'ÉCHEC : une correction a été modifiée';
exception when insufficient_privilege then
  raise notice 'OK : corrections en ajout seul, même pour le serveur';
end $$;
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.attendance_records)
     or exists (select 1 from public.attendance_corrections) then
    raise exception 'ÉCHEC : B voit les présences de A';
  end if;
  begin
    perform public.clock_in(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : B pointe chez A';
  exception when insufficient_privilege then
    raise notice 'OK : B ne voit ni ne pointe chez A';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- F. Congés et absences
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_org_a uuid := current_setting('test.org_a')::uuid;
  v_m_c   uuid := current_setting('test.m_c')::uuid;
  v_id    uuid;
begin
  begin
    insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date,
                                       reason)
    values (v_org_a, v_m_c, 'maladie', '2026-11-02', '2026-11-04', 'Paludisme');
    raise exception 'ÉCHEC : motif enregistré pour un congé maladie';
  exception when check_violation then
    raise notice 'OK : aucun motif pour un congé maladie';
  end;

  insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date)
  values (v_org_a, v_m_c, 'maladie', '2026-11-02', '2026-11-04')
  returning id into v_id;
  perform set_config('test.leave', v_id::text, true);
  if (select status from public.leave_requests where id = v_id) <> 'pending' then
    raise exception 'ÉCHEC : demande non en attente';
  end if;
  raise notice 'OK : demande de congé maladie avec le type et les dates seulement';

  begin
    insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date)
    values (v_org_a, v_m_c, 'conge_annuel', '2026-11-04', '2026-11-10');
    raise exception 'ÉCHEC : demandes qui se chevauchent';
  exception when invalid_parameter_value then
    raise notice 'OK : chevauchement avec une demande en cours refusé';
  end;

  begin
    insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date)
    values (v_org_a, current_setting('test.m_a')::uuid, 'formation', '2026-12-01', '2026-12-02');
    raise exception 'ÉCHEC : demande pour un collègue';
  exception when insufficient_privilege then
    raise notice 'OK : un membre ne demande que pour lui-même';
  end;

  begin
    perform public.decide_leave(v_id, true);
    raise exception 'ÉCHEC : un membre valide sa propre demande';
  exception when insufficient_privilege then
    raise notice 'OK : un membre ne valide pas sa demande';
  end;

  if (select count(*) from public.leave_conflicts(v_org_a, v_m_c, '2026-11-02', '2026-11-04'))
     <> 1 then
    raise exception 'ÉCHEC : conflit avec la garde du 03/11 non signalé';
  end if;
  raise notice 'OK : conflit avec une garde signalé';
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000a", "role": "authenticated"}', true);
do $$
declare
  v_id uuid := current_setting('test.leave')::uuid;
  v_ligne public.leave_requests;
begin
  v_ligne := public.decide_leave(v_id, true, 'Bon rétablissement');
  if v_ligne.status <> 'approved' or v_ligne.decided_by <> auth.uid() then
    raise exception 'ÉCHEC : validation non enregistrée';
  end if;
  begin
    perform public.decide_leave(v_id, false);
    raise exception 'ÉCHEC : deuxième décision acceptée';
  exception when invalid_parameter_value then
    raise notice 'OK : l''owner valide, une seule décision';
  end;
end $$;

-- L'équipe voit l'absence, sans type ni motif.
reset role;
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-a9b0-00000000000e', 'authenticated', 'authenticated',
        'e9b-e@fajkat.invalid', '{"full_name": "Fatou Test E"}', now(), now());
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org_a')::uuid, '00000000-0000-4000-a9b0-00000000000e',
        'sage_femme', true);
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000e", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.leave_requests) then
    raise exception 'ÉCHEC : une collègue lit le type du congé';
  end if;
  if (select count(*) from public.org_leave_calendar(current_setting('test.org_a')::uuid,
                                                     '2026-11-01', '2026-11-30')) <> 1 then
    raise exception 'ÉCHEC : l''absence n''apparaît pas dans le planning de l''équipe';
  end if;
  if (select count(*) from public.leave_conflicts(current_setting('test.org_a')::uuid,
        current_setting('test.m_c')::uuid, '2026-11-01', '2026-11-30')) <> 0 then
    raise exception 'ÉCHEC : une collègue lit les conflits d''un autre membre';
  end if;
  raise notice 'OK : l''équipe voit l''absence, sans type ni motif';
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  begin
    perform public.cancel_leave(current_setting('test.leave')::uuid);
    raise exception 'ÉCHEC : un membre annule un congé validé';
  exception when invalid_parameter_value then
    raise notice 'OK : un congé validé ne s''annule que par un responsable';
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.org_leave_calendar(current_setting('test.org_a')::uuid,
                                                     '2026-11-01', '2026-11-30')) then
    raise exception 'ÉCHEC : B voit les absences de A';
  end if;
  raise notice 'OK : B ne voit pas les absences de A';
end $$;

-- -----------------------------------------------------------------------------
-- Abonnement en lecture seule : plus de pointage ni de modification.
-- -----------------------------------------------------------------------------
reset role;
update public.organizations set status = 'read_only' where id = current_setting('test.org_a')::uuid;
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9b0-00000000000c", "role": "authenticated"}', true);
do $$
declare
  v_n integer;
begin
  begin
    perform public.clock_in(current_setting('test.org_a')::uuid);
    raise exception 'ÉCHEC : pointage accepté en lecture seule';
  exception when invalid_parameter_value then
    null;
  end;
  update public.staff_files set phone = '+221770000009'
   where id = current_setting('test.f_c')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ÉCHEC : fiche modifiée en lecture seule';
  end if;
  raise notice 'OK : lecture seule, ni pointage ni modification';
end $$;

-- Anonymes : rien.
reset role;
set local role anon;
do $$
begin
  perform 1 from public.staff_files;
  raise exception 'ÉCHEC : fiches lisibles sans connexion';
exception when insufficient_privilege then
  raise notice 'OK : module Personnel fermé aux anonymes';
end $$;

reset role;

-- Rien n'est conservé : comptes, structures et journal de test disparaissent.
rollback;
