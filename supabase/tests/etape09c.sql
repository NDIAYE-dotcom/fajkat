-- =============================================================================
-- Tests — étape 9c (Notifications)
-- -----------------------------------------------------------------------------
-- Vérifie : demande de congé notifiée à l'owner et aux admins actifs (pas à l'auteur),
-- 'attention' sans conflit, 'urgent' avec une garde en conflit ; jamais le type ni le
-- motif ; décision notifiée à la personne concernée ; demande traitée marquée lue chez
-- tous les responsables ; invitation acceptée notifiée à la personne qui a invité ;
-- chacun ne lit que les siennes et ne change que read_at (jamais « non lue ») ;
-- notify() fermée au front ; « Tout marquer comme lu » ; anonymes refusés.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape09c.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3, 6, 7, 9, 9b et 9c appliquées.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation
--   A : owner du poste ; D : admin chez A ; C : infirmier chez A (Fatou Samb) ;
--   B : owner d'une clinique ; E : compte existant, invité chez A.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a9c0-00000000000a', 'authenticated', 'authenticated',
   'e9c-a@fajkat.invalid', '{"full_name": "Aminata Test A"}', now(), now()),
  ('00000000-0000-4000-a9c0-00000000000b', 'authenticated', 'authenticated',
   'e9c-b@fajkat.invalid', '{"full_name": "Bineta Test B"}', now(), now()),
  ('00000000-0000-4000-a9c0-00000000000c', 'authenticated', 'authenticated',
   'e9c-c@fajkat.invalid', '{"full_name": "Fatou Samb"}', now(), now()),
  ('00000000-0000-4000-a9c0-00000000000d', 'authenticated', 'authenticated',
   'e9c-d@fajkat.invalid', '{"full_name": "Daouda Test D"}', now(), now()),
  ('00000000-0000-4000-a9c0-00000000000e', 'authenticated', 'authenticated',
   'e9c-e@fajkat.invalid', '{"full_name": "Moussa Diallo"}', now(), now());

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values
  (current_setting('test.org_a')::uuid, '00000000-0000-4000-a9c0-00000000000d', 'admin', true),
  (current_setting('test.org_a')::uuid, '00000000-0000-4000-a9c0-00000000000c', 'infirmier', true);

select set_config('test.m_c', (select id::text from public.memberships
  where user_id = '00000000-0000-4000-a9c0-00000000000c'), true);

-- Garde de C le 20/10 : la deuxième demande sera en conflit.
insert into public.shift_assignments (org_id, shift_type_id, membership_id, shift_date)
select current_setting('test.org_a')::uuid, t.id, current_setting('test.m_c')::uuid,
       date '2026-10-20'
  from public.shift_types t
 where t.org_id = current_setting('test.org_a')::uuid and t.label = 'Garde';

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Le front ne crée jamais de notification.
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    perform public.notify(current_setting('test.org_a')::uuid,
      '00000000-0000-4000-a9c0-00000000000a', 'test_type', 'info', 'Intrus');
    raise exception 'ÉCHEC : notify() appelable depuis le front';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.notifications (org_id, recipient_user_id, type, title)
    values (current_setting('test.org_a')::uuid, '00000000-0000-4000-a9c0-00000000000a',
            'test_type', 'Intrus');
    raise exception 'ÉCHEC : notification insérée en direct';
  exception when insufficient_privilege then
    raise notice 'OK : ni notify() ni insertion directe depuis le front';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- Demandes de congé
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000c", "role": "authenticated"}', true);

do $$
declare
  v_id uuid;
begin
  -- Sans conflit, type « formation » avec motif.
  insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date,
                                     reason)
  values (current_setting('test.org_a')::uuid, current_setting('test.m_c')::uuid,
          'formation', '2026-10-05', '2026-10-06', 'Atelier PEV à Ziguinchor')
  returning id into v_id;
  perform set_config('test.leave_1', v_id::text, true);

  -- Avec conflit, congé maladie.
  insert into public.leave_requests (org_id, membership_id, leave_type, start_date, end_date)
  values (current_setting('test.org_a')::uuid, current_setting('test.m_c')::uuid,
          'maladie', '2026-10-19', '2026-10-21')
  returning id into v_id;
  perform set_config('test.leave_2', v_id::text, true);

  if exists (select 1 from public.notifications) then
    raise exception 'ÉCHEC : l''auteur de la demande reçoit une notification';
  end if;
  raise notice 'OK : l''auteur de la demande n''est pas notifié';
end $$;

reset role;
do $$
declare
  v_l2 uuid := current_setting('test.leave_2')::uuid;
begin
  if (select count(*) from public.notifications where type = 'leave_requested') <> 4
     or (select count(distinct recipient_user_id) from public.notifications) <> 2
     or exists (select 1 from public.notifications
                where recipient_user_id not in ('00000000-0000-4000-a9c0-00000000000a',
                                                '00000000-0000-4000-a9c0-00000000000d')) then
    raise exception 'ÉCHEC : la demande n''est pas notifiée à l''owner et à l''admin seuls';
  end if;
  raise notice 'OK : demande notifiée à l''owner et à l''admin actifs';

  if exists (select 1 from public.notifications
             where entity_id = current_setting('test.leave_1')::uuid
               and severity <> 'attention')
     or exists (select 1 from public.notifications
                where entity_id = v_l2 and severity <> 'urgent') then
    raise exception 'ÉCHEC : gravité incorrecte';
  end if;
  raise notice 'OK : « attention » sans conflit, « urgent » avec une garde en conflit';

  if (select body from public.notifications where entity_id = v_l2 limit 1)
     <> 'Fatou Samb a demandé une absence du 19 au 21/10 — 1 garde en conflit'
     or (select link from public.notifications where entity_id = v_l2 limit 1)
     <> '/app/personnel?onglet=conges&demande=' || v_l2 then
    raise exception 'ÉCHEC : texte ou lien de la notification incorrect : %',
      (select body from public.notifications where entity_id = v_l2 limit 1);
  end if;
  if exists (select 1 from public.notifications
             where title || ' ' || coalesce(body, '') ~* 'maladie|formation|atelier|pev') then
    raise exception 'ÉCHEC : type ou motif du congé dans une notification';
  end if;
  raise notice 'OK : nom, dates et conflits seulement, jamais le type ni le motif';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Lecture : chacun les siennes, seulement read_at.
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000a", "role": "authenticated"}', true);

do $$
declare
  v_id uuid;
  v_lu timestamptz;
begin
  if (select count(*) from public.notifications) <> 2
     or exists (select 1 from public.notifications
                where recipient_user_id <> auth.uid()) then
    raise exception 'ÉCHEC : l''owner lit des notifications qui ne sont pas les siennes';
  end if;
  raise notice 'OK : chacun ne lit que ses notifications';

  select id into v_id from public.notifications
   where entity_id = current_setting('test.leave_1')::uuid;
  update public.notifications set read_at = '2020-01-01' where id = v_id;
  select read_at into v_lu from public.notifications where id = v_id;
  if v_lu <> now() then
    raise exception 'ÉCHEC : read_at non fixé à l''heure du serveur';
  end if;
  update public.notifications set read_at = null where id = v_id;
  if (select read_at from public.notifications where id = v_id) is null then
    raise exception 'ÉCHEC : notification remise en « non lue »';
  end if;
  raise notice 'OK : marquée lue à l''heure du serveur, jamais remise en non lue';

  begin
    update public.notifications set title = 'Modifié' where id = v_id;
    raise exception 'ÉCHEC : titre d''une notification modifié';
  exception when insufficient_privilege then
    raise notice 'OK : seule la colonne read_at se modifie';
  end;
end $$;

-- L'infirmier ne marque pas lues les notifications des autres.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000c", "role": "authenticated"}', true);
do $$
declare
  v_n integer;
begin
  update public.notifications set read_at = now();
  get diagnostics v_n = row_count;
  if v_n <> 0
     or public.mark_notifications_read(current_setting('test.org_a')::uuid) <> 0 then
    raise exception 'ÉCHEC : un membre a marqué lues les notifications d''un autre';
  end if;
  raise notice 'OK : un membre ne touche pas aux notifications des autres';
end $$;

-- -----------------------------------------------------------------------------
-- Décision : la personne est prévenue ; la demande est marquée lue partout.
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000d", "role": "authenticated"}', true);
do $$
begin
  perform public.decide_leave(current_setting('test.leave_2')::uuid, true, 'Bon rétablissement');
end $$;

reset role;
do $$
declare
  v_l2 uuid := current_setting('test.leave_2')::uuid;
begin
  if exists (select 1 from public.notifications
             where entity_id = v_l2 and type = 'leave_requested' and read_at is null) then
    raise exception 'ÉCHEC : la demande traitée reste non lue chez un responsable';
  end if;
  raise notice 'OK : demande validée marquée lue chez l''owner et l''admin';

  if (select count(*) from public.notifications
      where type = 'leave_decided' and entity_id = v_l2 and severity = 'info'
        and recipient_user_id = '00000000-0000-4000-a9c0-00000000000c'
        and title = 'Absence validée'
        and body = 'Votre absence du 19 au 21/10 a été validée.'
        and link = '/app/mon-espace?onglet=conges&demande=' || v_l2) <> 1
     or exists (select 1 from public.notifications
                where type = 'leave_decided' and body ~* 'rétablissement') then
    raise exception 'ÉCHEC : décision non notifiée à la personne concernée';
  end if;
  raise notice 'OK : décision notifiée à la personne (« info »), sans la réponse';
end $$;
set local role authenticated;

-- Annulation par la personne : la demande en attente est marquée lue partout.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  perform public.cancel_leave(current_setting('test.leave_1')::uuid);
end $$;

reset role;
do $$
begin
  if exists (select 1 from public.notifications
             where type = 'leave_requested' and read_at is null) then
    raise exception 'ÉCHEC : demande annulée restée non lue';
  end if;
  if exists (select 1 from public.notifications
             where entity_id = current_setting('test.leave_1')::uuid
               and type = 'leave_decided') then
    raise exception 'ÉCHEC : une annulation est notifiée comme une décision';
  end if;
  raise notice 'OK : demande annulée marquée lue chez les responsables';
end $$;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- Invitation acceptée : la personne qui a invité.
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000d", "role": "authenticated"}', true);
do $$
declare
  v_inv record;
begin
  select * into v_inv from public.create_invitation(
    current_setting('test.org_a')::uuid, 'accueil', 'Moussa Diallo', '+221771112244', null,
    'whatsapp');
  perform set_config('test.token_e', v_inv.token, true);
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000e", "role": "authenticated"}', true);
do $$
begin
  perform public.accept_invitation(current_setting('test.token_e'));
end $$;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000d", "role": "authenticated"}', true);
do $$
begin
  if (select count(*) from public.notifications
      where type = 'invitation_accepted' and severity = 'info'
        and body = 'Moussa Diallo a rejoint l''équipe.') <> 1 then
    raise exception 'ÉCHEC : invitation acceptée non notifiée à la personne qui a invité';
  end if;
  raise notice 'OK : invitation acceptée notifiée à la personne qui a invité';

  if public.mark_notifications_read(current_setting('test.org_a')::uuid) <> 1 then
    raise exception 'ÉCHEC : « Tout marquer comme lu » n''a pas compté la non lue';
  end if;
  if exists (select 1 from public.notifications where read_at is null) then
    raise exception 'ÉCHEC : « Tout marquer comme lu » incomplet';
  end if;
  raise notice 'OK : « Tout marquer comme lu »';
end $$;

-- -----------------------------------------------------------------------------
-- Autre structure, membre désactivé, anonymes.
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.notifications) then
    raise exception 'ÉCHEC : B lit les notifications de A';
  end if;
  raise notice 'OK : B ne lit pas les notifications de A';
end $$;

reset role;
update public.memberships set is_active = false
 where user_id = '00000000-0000-4000-a9c0-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a9c0-00000000000c", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.notifications) then
    raise exception 'ÉCHEC : un membre désactivé lit encore ses notifications';
  end if;
  raise notice 'OK : un membre désactivé ne lit plus les notifications de la structure';
end $$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.notifications;
  raise exception 'ÉCHEC : notifications lisibles sans connexion';
exception when insufficient_privilege then
  raise notice 'OK : notifications fermées aux anonymes';
end $$;

reset role;

rollback;
