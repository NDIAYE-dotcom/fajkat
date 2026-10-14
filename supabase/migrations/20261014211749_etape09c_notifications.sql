-- =============================================================================
-- Étape 9c — Notifications
-- -----------------------------------------------------------------------------
-- 1. notifications        : une ligne par destinataire. Lue par lui seul ; seule la
--                           colonne read_at se modifie (marquée lue, jamais « non lue »).
-- 2. notify / notify_roles : fonctions serveur réutilisables par tous les modules
--                           (stock, vaccins, labo…), appelées depuis des triggers ou des
--                           RPC, JAMAIS depuis le front (aucun droit EXECUTE).
-- 3. mark_notifications_read : « Tout marquer comme lu » (ou une liste d'identifiants).
-- 4. Premiers déclencheurs : demande de congé (owner et admin), décision (la personne
--                           concernée), invitation acceptée (la personne qui a invité).
--                           Une demande traitée marque ses notifications comme lues.
-- 5. Publication supabase_realtime : la cloche se met à jour sans recharger la page.
--
-- Confidentialité : une notification ne contient JAMAIS de donnée médicale. Pour un
-- congé : nom, dates et nombre de gardes en conflit, jamais le type ni le motif.
-- =============================================================================


-- =============================================================================
-- 1. Table notifications
-- =============================================================================

create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id),
  recipient_user_id  uuid not null references auth.users (id) on delete cascade,
  -- Code libre, par module : 'leave_requested', 'stock_low', 'vaccine_due'…
  type               text not null check (type ~ '^[a-z][a-z0-9_.]{2,63}$'),
  severity           text not null default 'info'
                       check (severity in ('info', 'attention', 'urgent')),
  title              text not null check (char_length(btrim(title)) between 2 and 160),
  body               text check (char_length(body) <= 500),
  -- Adresse interne de l'application uniquement (jamais un lien externe).
  link               text check (link ~ '^/app(/|\?|$)' and char_length(link) <= 300),
  -- Objet concerné (demande de congé, lot de stock…) : permet de marquer comme lues
  -- les notifications d'un objet traité.
  entity_id          uuid,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at         timestamptz
);

create index notifications_recipient_idx
  on public.notifications (recipient_user_id, org_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_user_id, org_id) where read_at is null;
create index notifications_entity_idx
  on public.notifications (entity_id) where entity_id is not null;

comment on table public.notifications is
  'Notifications par destinataire. Écrites par notify() uniquement ; seul read_at change.';

create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- Une notification lue le reste, à l'heure du serveur ; rien d'autre ne change.
create function public.notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.read_at is distinct from old.read_at then
    new.read_at := coalesce(old.read_at, now());
  end if;
  if (to_jsonb(new) - 'read_at' - 'updated_at' - 'deleted_at')
     <> (to_jsonb(old) - 'read_at' - 'updated_at' - 'deleted_at') then
    raise exception 'Une notification ne se modifie pas.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_guard
  before update on public.notifications
  for each row execute function public.notifications_guard();


-- =============================================================================
-- 2. notify / notify_roles
-- =============================================================================

-- Crée une notification. Rien n'est créé si le destinataire n'est pas un membre actif
-- de la structure. Renvoie l'id créé, ou null.
create function public.notify(
  p_org_id     uuid,
  p_recipient  uuid,
  p_type       text,
  p_severity   text,
  p_title      text,
  p_body       text default null,
  p_link       text default null,
  p_entity_id  uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_recipient is null or not exists (
    select 1 from public.memberships m
     where m.org_id = p_org_id and m.user_id = p_recipient
       and m.is_active and m.deleted_at is null)
  then
    return null;
  end if;

  insert into public.notifications (org_id, recipient_user_id, type, severity, title, body,
                                    link, entity_id)
  values (p_org_id, p_recipient, p_type, coalesce(p_severity, 'info'), btrim(p_title),
          nullif(btrim(coalesce(p_body, '')), ''), p_link, p_entity_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Notifie tous les membres actifs ayant l'un des rôles, sauf p_exclude (l'auteur de
-- l'action). Renvoie le nombre de notifications créées.
create function public.notify_roles(
  p_org_id     uuid,
  p_roles      text[],
  p_type       text,
  p_severity   text,
  p_title      text,
  p_body       text default null,
  p_link       text default null,
  p_entity_id  uuid default null,
  p_exclude    uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n    integer := 0;
begin
  for v_user in
    select m.user_id from public.memberships m
     where m.org_id = p_org_id and m.role = any (p_roles)
       and m.is_active and m.deleted_at is null
       and m.user_id is distinct from p_exclude
  loop
    if public.notify(p_org_id, v_user, p_type, p_severity, p_title, p_body, p_link,
                     p_entity_id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Marque comme lues les notifications d'un objet traité, pour tous les destinataires.
create function public.notifications_mark_entity_read(p_entity_id uuid, p_type text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where entity_id = p_entity_id and type = p_type and read_at is null;
$$;

-- Période courte pour les messages : « le 19/10 », « du 19 au 21/10 », « du 30/10 au 02/11 ».
create function public.notification_period(p_from date, p_to date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then 'le ' || to_char(p_from, 'DD/MM')
    when date_trunc('month', p_from) = date_trunc('month', p_to)
      then 'du ' || to_char(p_from, 'DD') || ' au ' || to_char(p_to, 'DD/MM')
    else 'du ' || to_char(p_from, 'DD/MM') || ' au ' || to_char(p_to, 'DD/MM')
  end;
$$;


-- =============================================================================
-- 3. Lecture
-- =============================================================================

-- p_ids null : toutes les notifications non lues de l'utilisateur dans la structure.
-- Exécutée avec les droits de l'utilisateur : la RLS limite aux siennes.
create function public.mark_notifications_read(p_org_id uuid, p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.notifications
     set read_at = now()
   where org_id = p_org_id
     and recipient_user_id = auth.uid()
     and read_at is null
     and deleted_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- =============================================================================
-- 4. Déclencheurs
-- =============================================================================

-- Nouvelle demande de congé : owner et admin actifs (sauf l'auteur). 'urgent' si une
-- garde est prévue pendant l'absence. Jamais le type de congé ni le motif.
create function public.leave_requests_notify_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_nom     text;
  v_gardes  integer;
  v_texte   text;
begin
  select m.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Un membre de l''équipe')
    into v_user, v_nom
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
   where m.id = new.membership_id;

  select count(*) into v_gardes
    from public.shift_assignments a
   where a.membership_id = new.membership_id
     and a.deleted_at is null
     and a.shift_date between new.start_date and new.end_date;

  v_texte := case
    when auth.uid() is null or auth.uid() = v_user then v_nom || ' a demandé une absence '
    else 'Absence demandée pour ' || v_nom || ' '
  end || public.notification_period(new.start_date, new.end_date)
    || case
         when v_gardes = 0 then ''
         when v_gardes = 1 then ' — 1 garde en conflit'
         else ' — ' || v_gardes || ' gardes en conflit'
       end;

  perform public.notify_roles(
    new.org_id, array['owner', 'admin'], 'leave_requested',
    case when v_gardes > 0 then 'urgent' else 'attention' end,
    'Demande d''absence à traiter', v_texte,
    '/app/personnel?onglet=conges&demande=' || new.id, new.id, auth.uid());
  return null;
end;
$$;

create trigger leave_requests_notify_insert
  after insert on public.leave_requests
  for each row execute function public.leave_requests_notify_insert();

-- Demande traitée (validée, refusée ou annulée) : ses notifications « à traiter » sont
-- marquées comme lues chez tous les responsables. Décision : la personne est prévenue.
create function public.leave_requests_notify_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = old.status then
    return null;
  end if;

  if new.status in ('approved', 'rejected', 'cancelled') then
    perform public.notifications_mark_entity_read(new.id, 'leave_requested');
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    select m.user_id into v_user from public.memberships m where m.id = new.membership_id;
    if v_user is distinct from auth.uid() then
      perform public.notify(
        new.org_id, v_user, 'leave_decided', 'info',
        case when new.status = 'approved' then 'Absence validée' else 'Absence refusée' end,
        'Votre absence ' || public.notification_period(new.start_date, new.end_date)
          || case when new.status = 'approved' then ' a été validée.' else ' a été refusée.' end,
        '/app/mon-espace?onglet=conges&demande=' || new.id, new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger leave_requests_notify_update
  after update of status on public.leave_requests
  for each row execute function public.leave_requests_notify_update();

-- Invitation acceptée : la personne qui a invité.
create function public.invitations_notify_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return null;
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), new.full_name) into v_nom
    from public.profiles p where p.id = new.accepted_by;

  perform public.notify(
    new.org_id, new.created_by, 'invitation_accepted', 'info',
    'Invitation acceptée',
    coalesce(v_nom, new.full_name) || ' a rejoint l''équipe.',
    '/app/personnel?onglet=membres', new.id);
  return null;
end;
$$;

create trigger invitations_notify_accepted
  after update of status on public.invitations
  for each row execute function public.invitations_notify_accepted();


-- =============================================================================
-- 5. Droits d'accès et Row Level Security
-- =============================================================================

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke execute on function
  public.notifications_guard(),
  public.notify(uuid, uuid, text, text, text, text, text, uuid),
  public.notify_roles(uuid, text[], text, text, text, text, text, uuid, uuid),
  public.notifications_mark_entity_read(uuid, text),
  public.notification_period(date, date),
  public.mark_notifications_read(uuid, uuid[]),
  public.leave_requests_notify_insert(),
  public.leave_requests_notify_update(),
  public.invitations_notify_accepted()
from public, anon, authenticated;

grant execute on function public.mark_notifications_read(uuid, uuid[]) to authenticated;

alter table public.notifications enable row level security;

-- Chacun ne lit que les siennes, dans une structure dont il est membre actif.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid() and deleted_at is null and public.is_member(org_id));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = auth.uid() and deleted_at is null and public.is_member(org_id))
  with check (recipient_user_id = auth.uid() and public.is_member(org_id));


-- =============================================================================
-- 6. Temps réel
-- -----------------------------------------------------------------------------
-- Realtime applique la RLS ci-dessus : chacun ne reçoit que ses notifications.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
