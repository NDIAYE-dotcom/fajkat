-- =============================================================================
-- Étape 9b — Module Personnel : fiches, planning des gardes, présences, congés
-- -----------------------------------------------------------------------------
-- 1. Aides                : memberships(id, org_id) unique (clés étrangères composées :
--                           une ligne ne peut viser qu'un membre de SA structure),
--                           is_own_membership, personnel_can_write.
-- 2. staff_files          : une fiche par appartenance, créée automatiquement (trigger
--                           sur memberships). Owner et admin modifient tout ; le membre
--                           ne modifie que son téléphone et son contact d'urgence.
-- 3. staff_attachments    : pièces jointes dans le bucket privé « personnel »
--                           ({org_id}/{staff_file_id}/{fichier}), lues par URL signée.
-- 4. shift_types          : créneaux paramétrables par structure (Jour, Nuit, Garde par
--                           défaut) ; shift_assignments : affectation d'un membre à un
--                           créneau, un jour donné.
-- 5. attendance_records   : pointage à l'heure du SERVEUR (clock_in / clock_out) ;
--                           attendance_corrections : corrections par owner ou admin,
--                           motif obligatoire, en ajout seul.
-- 6. leave_requests       : congés et absences ; décision par owner ou admin ;
--                           calendrier des congés validés sans type ni motif pour l'équipe ;
--                           conflits avec les gardes.
--
-- Les refus métier lèvent le code 22023 avec un message en français, affiché tel quel.
-- Aucune suppression physique : deleted_at partout, aucune policy DELETE.
-- =============================================================================


-- =============================================================================
-- 1. Aides
-- =============================================================================

-- Cible des clés étrangères composées (membership_id, org_id).
create unique index memberships_id_org_unique on public.memberships (id, org_id);

-- L'appartenance p_membership_id est-elle celle de l'utilisateur connecté ?
create function public.is_own_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
     where m.id = p_membership_id
       and m.user_id = auth.uid()
       and m.deleted_at is null
  );
$$;

-- Appartenance active de l'utilisateur connecté dans la structure (null sinon).
create function public.current_membership_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.memberships m
   where m.org_id = p_org_id
     and m.user_id = auth.uid()
     and m.is_active
     and m.deleted_at is null;
$$;

-- Écriture permise dans le module : fonctionnalité incluse et abonnement actif.
create function public.personnel_can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'personnel')
     and coalesce(public.current_org_status(p_org_id), 'suspended')
         not in ('read_only', 'suspended');
$$;

-- Même règle, avec un message clair pour les RPC.
create function public.personnel_assert_can_write(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté.' using errcode = '28000';
  end if;
  if not public.is_member(p_org_id) then
    raise exception 'Vous n''êtes pas membre de cette structure.' using errcode = '42501';
  end if;
  if not public.personnel_can_write(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;
end;
$$;


-- =============================================================================
-- 2. Fiches du personnel
-- =============================================================================

create table public.staff_files (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id),
  membership_id           uuid not null,
  job_title               text check (char_length(job_title) <= 120),   -- fonction
  professional_number     text check (char_length(professional_number) <= 60),
  -- Téléphone propre à la structure (pré-rempli depuis profiles.phone) : un responsable
  -- ne modifie jamais le profil global d'un compte présent dans d'autres structures.
  phone                   text check (phone ~ '^\+[0-9]{8,15}$'),
  emergency_contact_name  text check (char_length(emergency_contact_name) <= 160),
  emergency_contact_phone text check (emergency_contact_phone ~ '^\+[0-9]{8,15}$'),
  start_date              date,
  contract_type           text check (contract_type in (
                            'titulaire', 'contractuel', 'benevole', 'vacataire')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at              timestamptz,
  foreign key (membership_id, org_id) references public.memberships (id, org_id)
);

create unique index staff_files_membership_unique
  on public.staff_files (membership_id) where deleted_at is null;
create unique index staff_files_id_org_unique on public.staff_files (id, org_id);
create index staff_files_org_id_idx on public.staff_files (org_id);

comment on table public.staff_files is
  'Fiche d''un membre dans une structure : fonction, n° d''ordre, contrat, contact d''urgence.';

create trigger staff_files_set_updated_at before update on public.staff_files
  for each row execute function public.set_updated_at();
create trigger staff_files_audit
  after insert or update or delete on public.staff_files
  for each row execute function public.audit_trigger();

-- Depuis l'application, un membre qui n'est ni owner ni admin ne modifie que son
-- téléphone et son contact d'urgence (la policy limite déjà la ligne à la sienne).
create function public.staff_files_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and not public.has_role(old.org_id, array['owner', 'admin'])
     and (new.job_title is distinct from old.job_title
          or new.professional_number is distinct from old.professional_number
          or new.start_date is distinct from old.start_date
          or new.contract_type is distinct from old.contract_type
          or new.deleted_at is distinct from old.deleted_at)
  then
    raise exception 'Vous pouvez modifier seulement votre téléphone et votre contact d''urgence.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger staff_files_guard
  before update on public.staff_files
  for each row execute function public.staff_files_guard();

-- Fiche créée avec l'appartenance : téléphone, fonction et n° d'ordre repris du profil.
create function public.memberships_create_staff_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_files (org_id, membership_id, phone, job_title, professional_number,
                                  created_by)
  select new.org_id, new.id, p.phone, p.title, p.professional_number, new.created_by
    from public.profiles p
   where p.id = new.user_id
  on conflict do nothing;
  return null;
end;
$$;

create trigger memberships_create_staff_file
  after insert on public.memberships
  for each row execute function public.memberships_create_staff_file();

-- Fiches des membres déjà présents.
insert into public.staff_files (org_id, membership_id, phone, job_title, professional_number,
                                created_by)
select m.org_id, m.id, p.phone, p.title, p.professional_number, m.created_by
  from public.memberships m
  join public.profiles p on p.id = m.user_id
 where m.deleted_at is null;


-- =============================================================================
-- 3. Pièces jointes (bucket privé « personnel »)
-- =============================================================================

create table public.staff_attachments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id),
  staff_file_id uuid not null,
  label         text not null check (char_length(btrim(label)) between 1 and 120),
  file_name     text not null check (char_length(file_name) between 1 and 200),
  mime_type     text not null check (mime_type in (
                  'application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer not null check (size_bytes between 1 and 10485760),
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at    timestamptz,
  foreign key (staff_file_id, org_id) references public.staff_files (id, org_id),
  -- Le chemin est rangé sous la structure et la fiche : les policies du Storage s'y fient.
  check (storage_path like org_id::text || '/' || staff_file_id::text || '/%')
);

create index staff_attachments_staff_file_idx on public.staff_attachments (staff_file_id);
create index staff_attachments_org_id_idx on public.staff_attachments (org_id);

comment on table public.staff_attachments is
  'Pièces jointes d''une fiche du personnel (diplôme, contrat…). Fichier dans le bucket privé personnel.';

create trigger staff_attachments_set_updated_at before update on public.staff_attachments
  for each row execute function public.set_updated_at();
create trigger staff_attachments_audit
  after insert or update or delete on public.staff_attachments
  for each row execute function public.audit_trigger();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personnel', 'personnel', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Deuxième dossier du chemin, s'il est un uuid (la fiche) ; sinon null.
create function public.storage_second_uuid(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 2)
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

-- La fiche p_staff_file_id (de la structure p_org_id) est-elle celle de l'utilisateur ?
create function public.is_own_staff_file(p_org_id uuid, p_staff_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.staff_files f
      join public.memberships m on m.id = f.membership_id
     where f.id = p_staff_file_id
       and f.org_id = p_org_id
       and m.user_id = auth.uid()
       and m.deleted_at is null
  );
$$;

-- Lecture (URL signée) : owner et admin, ou le membre pour sa propre fiche.
create policy personnel_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'personnel'
    and (
      public.has_role(public.storage_org_id(name), array['owner', 'admin'])
      or (public.is_member(public.storage_org_id(name))
          and public.is_own_staff_file(public.storage_org_id(name),
                                       public.storage_second_uuid(name)))
    )
  );

-- Dépôt : owner et admin seulement. Ni remplacement ni suppression : un nouveau fichier
-- a toujours un nouveau nom, et le retrait se fait sur la ligne (deleted_at).
create policy personnel_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'personnel'
    and public.has_role(public.storage_org_id(name), array['owner', 'admin'])
    and public.personnel_can_write(public.storage_org_id(name))
  );


-- =============================================================================
-- 4. Planning des gardes
-- =============================================================================

create table public.shift_types (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  label       text not null check (char_length(btrim(label)) between 1 and 40),
  -- Fin avant ou égale au début : le créneau finit le lendemain (Garde 08:00 → 08:00 = 24 h).
  start_time  time not null,
  end_time    time not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at  timestamptz
);

create unique index shift_types_org_label_unique
  on public.shift_types (org_id, lower(label)) where deleted_at is null;
create unique index shift_types_id_org_unique on public.shift_types (id, org_id);

comment on table public.shift_types is
  'Créneaux du planning, paramétrables par structure (Jour, Nuit, Garde par défaut).';

create trigger shift_types_set_updated_at before update on public.shift_types
  for each row execute function public.set_updated_at();
create trigger shift_types_audit
  after insert or update or delete on public.shift_types
  for each row execute function public.audit_trigger();

-- Créneaux par défaut, modifiables ensuite par la structure.
create function public.seed_shift_types(p_org_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.shift_types (org_id, label, start_time, end_time, sort_order, created_by)
  select p_org_id, d.label, d.start_time, d.end_time, d.sort_order, null
    from (values
      ('Jour',  time '08:00', time '20:00', 10),
      ('Nuit',  time '20:00', time '08:00', 20),
      ('Garde', time '08:00', time '08:00', 30)
    ) as d (label, start_time, end_time, sort_order)
   where not exists (
     select 1 from public.shift_types s where s.org_id = p_org_id and s.deleted_at is null);
$$;

create function public.organizations_seed_shift_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_shift_types(new.id);
  return null;
end;
$$;

create trigger organizations_seed_shift_types
  after insert on public.organizations
  for each row execute function public.organizations_seed_shift_types();

select public.seed_shift_types(o.id) from public.organizations o;

create table public.shift_assignments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  shift_type_id  uuid not null,
  membership_id  uuid not null,
  shift_date     date not null,
  note           text check (char_length(note) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  foreign key (shift_type_id, org_id) references public.shift_types (id, org_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id)
);

create unique index shift_assignments_unique
  on public.shift_assignments (shift_type_id, shift_date, membership_id)
  where deleted_at is null;
create index shift_assignments_org_date_idx on public.shift_assignments (org_id, shift_date);
create index shift_assignments_membership_idx
  on public.shift_assignments (membership_id, shift_date);

comment on table public.shift_assignments is
  'Affectation d''un membre à un créneau du planning, un jour donné.';

create trigger shift_assignments_set_updated_at before update on public.shift_assignments
  for each row execute function public.set_updated_at();
create trigger shift_assignments_audit
  after insert or update or delete on public.shift_assignments
  for each row execute function public.audit_trigger();

-- On n'affecte qu'un membre actif.
create function public.shift_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null and not exists (
    select 1 from public.memberships m
     where m.id = new.membership_id and m.is_active and m.deleted_at is null)
  then
    raise exception 'Ce membre n''a plus accès à la structure : il ne peut pas être affecté.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger shift_assignments_guard
  before insert or update on public.shift_assignments
  for each row execute function public.shift_assignments_guard();


-- =============================================================================
-- 5. Présences
-- =============================================================================

create table public.attendance_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  membership_id  uuid not null,
  -- Jour de travail dans le fuseau de la structure (jour de l'arrivée).
  work_date      date not null,
  check_in_at    timestamptz not null,
  check_out_at   timestamptz,
  is_corrected   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  foreign key (membership_id, org_id) references public.memberships (id, org_id),
  check (check_out_at is null or check_out_at > check_in_at)
);

create unique index attendance_records_id_org_unique on public.attendance_records (id, org_id);
create index attendance_records_org_date_idx on public.attendance_records (org_id, work_date);
create index attendance_records_membership_idx
  on public.attendance_records (membership_id, check_in_at desc);

comment on table public.attendance_records is
  'Pointage d''arrivée et de départ, à l''heure du serveur. Écrit seulement par les RPC.';

create trigger attendance_records_set_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();
create trigger attendance_records_audit
  after insert or update or delete on public.attendance_records
  for each row execute function public.audit_trigger();

-- Corrections : ancienne et nouvelle valeur, motif. En ajout seul.
create table public.attendance_corrections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id),
  attendance_record_id  uuid not null,
  old_check_in_at       timestamptz,
  old_check_out_at      timestamptz,
  new_check_in_at       timestamptz not null,
  new_check_out_at      timestamptz,
  reason                text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at            timestamptz,
  foreign key (attendance_record_id, org_id) references public.attendance_records (id, org_id)
);

create index attendance_corrections_record_idx
  on public.attendance_corrections (attendance_record_id);

comment on table public.attendance_corrections is
  'Corrections de pointage par owner ou admin, motif obligatoire. Jamais modifiées.';

create function public.attendance_corrections_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Une correction de présence ne peut être ni modifiée ni supprimée.'
    using errcode = '42501';
end;
$$;

create trigger attendance_corrections_no_update_delete
  before update or delete on public.attendance_corrections
  for each row execute function public.attendance_corrections_immutable();
create trigger attendance_corrections_audit
  after insert on public.attendance_corrections
  for each row execute function public.audit_trigger();

-- Date du jour dans le fuseau de la structure, selon l'horloge du serveur.
create function public.org_today(p_org_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.timezone)::date
    from public.organizations o
   where o.id = p_org_id and public.is_member(p_org_id);
$$;

-- Au-delà de ce délai, une arrivée sans départ est considérée comme oubliée : elle ne
-- bloque plus un nouveau pointage et reste à corriger par un responsable.
-- (Délai technique, pas une règle métier.)
create function public.attendance_open_record(p_membership_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
    from public.attendance_records a
   where a.membership_id = p_membership_id
     and a.check_out_at is null
     and a.deleted_at is null
     and a.check_in_at > now() - interval '24 hours'
   order by a.check_in_at desc
   limit 1;
$$;

-- Arrivée : l'heure vient du serveur (now()), jamais du téléphone.
create function public.clock_in(p_org_id uuid)
returns public.attendance_records
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_ligne      public.attendance_records;
begin
  perform public.personnel_assert_can_write(p_org_id);
  v_membership := public.current_membership_id(p_org_id);
  -- Un double appui (réseau lent) ne crée pas deux arrivées.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || v_membership::text, 0));

  if public.attendance_open_record(v_membership) is not null then
    raise exception 'Votre arrivée est déjà enregistrée. Pointez votre départ en fin de service.'
      using errcode = '22023';
  end if;

  insert into public.attendance_records (org_id, membership_id, work_date, check_in_at)
  select p_org_id, v_membership, (now() at time zone o.timezone)::date, now()
    from public.organizations o
   where o.id = p_org_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- Départ : ferme la dernière arrivée ouverte (même si elle date de la veille : garde de nuit).
create function public.clock_out(p_org_id uuid)
returns public.attendance_records
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_id         uuid;
  v_ligne      public.attendance_records;
begin
  perform public.personnel_assert_can_write(p_org_id);
  v_membership := public.current_membership_id(p_org_id);
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || v_membership::text, 0));

  v_id := public.attendance_open_record(v_membership);
  if v_id is null then
    raise exception 'Aucune arrivée en cours. Pointez d''abord votre arrivée.'
      using errcode = '22023';
  end if;

  update public.attendance_records
     set check_out_at = now()
   where id = v_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- Correction par owner ou admin, motif obligatoire.
--   p_record_id renseigné : corrige ce pointage.
--   p_record_id null      : crée un pointage oublié pour p_membership_id, le p_work_date.
create function public.correct_attendance(
  p_org_id        uuid,
  p_record_id     uuid,
  p_check_in_at   timestamptz,
  p_check_out_at  timestamptz,
  p_reason        text,
  p_membership_id uuid default null,
  p_work_date     date default null
)
returns public.attendance_records
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.attendance_records;
  v_ligne public.attendance_records;
begin
  perform public.personnel_assert_can_write(p_org_id);
  if not public.has_role(p_org_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs corrigent les présences.'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indiquez le motif de la correction (5 caractères au moins).'
      using errcode = '22023';
  end if;
  if p_check_in_at is null then
    raise exception 'L''heure d''arrivée est obligatoire.' using errcode = '22023';
  end if;
  if p_check_in_at > now() or p_check_out_at > now() then
    raise exception 'Une présence ne peut pas être enregistrée dans le futur.'
      using errcode = '22023';
  end if;
  if p_check_out_at is not null and p_check_out_at <= p_check_in_at then
    raise exception 'Le départ doit être après l''arrivée.' using errcode = '22023';
  end if;

  if p_record_id is null then
    if p_membership_id is null or p_work_date is null then
      raise exception 'Choisissez le membre et le jour.' using errcode = '22023';
    end if;
    insert into public.attendance_records (
      org_id, membership_id, work_date, check_in_at, check_out_at, is_corrected)
    values (p_org_id, p_membership_id, p_work_date, p_check_in_at, p_check_out_at, true)
    returning * into v_ligne;
  else
    select * into v_avant
      from public.attendance_records
     where id = p_record_id and org_id = p_org_id and deleted_at is null
       for update;
    if not found then
      raise exception 'Ce pointage est introuvable.' using errcode = '22023';
    end if;
    update public.attendance_records
       set check_in_at = p_check_in_at, check_out_at = p_check_out_at, is_corrected = true
     where id = p_record_id
    returning * into v_ligne;
  end if;

  insert into public.attendance_corrections (
    org_id, attendance_record_id, old_check_in_at, old_check_out_at,
    new_check_in_at, new_check_out_at, reason)
  values (p_org_id, v_ligne.id, v_avant.check_in_at, v_avant.check_out_at,
          p_check_in_at, p_check_out_at, btrim(p_reason));

  return v_ligne;
end;
$$;


-- =============================================================================
-- 6. Congés et absences
-- =============================================================================

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  membership_id  uuid not null,
  leave_type     text not null check (leave_type in (
                   'conge_annuel', 'maladie', 'maternite', 'paternite', 'formation',
                   'evenement_familial', 'autre')),
  start_date     date not null,
  end_date       date not null,
  -- Facultatif, et jamais pour un congé maladie : aucun diagnostic n'est conservé ici.
  reason         text check (char_length(reason) <= 500),
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by     uuid references public.profiles (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  foreign key (membership_id, org_id) references public.memberships (id, org_id),
  check (end_date >= start_date),
  check (leave_type <> 'maladie' or reason is null),
  check (status not in ('approved', 'rejected') or decided_at is not null),
  check (status <> 'pending' or decided_at is null)
);

create index leave_requests_org_dates_idx on public.leave_requests (org_id, start_date, end_date);
create index leave_requests_membership_idx on public.leave_requests (membership_id);

comment on table public.leave_requests is
  'Demandes de congé et d''absence. Décision par owner ou admin (decide_leave).';

create trigger leave_requests_set_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();
create trigger leave_requests_audit
  after insert or update or delete on public.leave_requests
  for each row execute function public.audit_trigger();

-- Une nouvelle demande ne chevauche pas une demande du même membre en attente ou validée.
create function public.leave_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('leave:' || new.membership_id::text, 0));
  if exists (
    select 1 from public.leave_requests l
     where l.membership_id = new.membership_id
       and l.id <> new.id
       and l.deleted_at is null
       and l.status in ('pending', 'approved')
       and l.start_date <= new.end_date
       and l.end_date >= new.start_date)
  then
    raise exception 'Une demande en attente ou validée couvre déjà une partie de ces dates.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger leave_requests_guard
  before insert on public.leave_requests
  for each row execute function public.leave_requests_guard();

-- Validation ou refus.
create function public.decide_leave(p_leave_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne public.leave_requests;
begin
  select * into v_ligne from public.leave_requests
   where id = p_leave_id and deleted_at is null
     for update;
  if not found then
    raise exception 'Cette demande est introuvable.' using errcode = '22023';
  end if;
  perform public.personnel_assert_can_write(v_ligne.org_id);
  if not public.has_role(v_ligne.org_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs valident les congés.'
      using errcode = '42501';
  end if;
  if v_ligne.status <> 'pending' then
    raise exception 'Cette demande a déjà reçu une réponse.' using errcode = '22023';
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_leave_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- Annulation : le membre pour sa demande en attente ; owner et admin pour une demande
-- en attente ou validée (retour anticipé, erreur de saisie).
create function public.cancel_leave(p_leave_id uuid)
returns public.leave_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligne    public.leave_requests;
  v_resp     boolean;
begin
  select * into v_ligne from public.leave_requests
   where id = p_leave_id and deleted_at is null
     for update;
  if not found then
    raise exception 'Cette demande est introuvable.' using errcode = '22023';
  end if;
  perform public.personnel_assert_can_write(v_ligne.org_id);
  v_resp := public.has_role(v_ligne.org_id, array['owner', 'admin']);

  if not v_resp and not public.is_own_membership(v_ligne.membership_id) then
    raise exception 'Vous ne pouvez annuler que vos propres demandes.' using errcode = '42501';
  end if;
  if v_ligne.status not in ('pending', 'approved')
     or (v_ligne.status = 'approved' and not v_resp) then
    raise exception 'Cette demande ne peut plus être annulée. Adressez-vous à un responsable.'
      using errcode = '22023';
  end if;

  update public.leave_requests set status = 'cancelled' where id = p_leave_id
  returning * into v_ligne;
  return v_ligne;
end;
$$;

-- Congés validés sur une période, pour le planning de toute l'équipe : ni type ni motif
-- (un congé maladie n'a pas à être connu des collègues).
create function public.org_leave_calendar(p_org_id uuid, p_from date, p_to date)
returns table (leave_id uuid, membership_id uuid, start_date date, end_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.membership_id, l.start_date, l.end_date
    from public.leave_requests l
   where l.org_id = p_org_id
     and public.is_member(p_org_id)
     and l.status = 'approved'
     and l.deleted_at is null
     and l.start_date <= p_to
     and l.end_date >= p_from;
$$;

-- Gardes du membre pendant la période d'un congé : conflit à signaler.
create function public.leave_conflicts(
  p_org_id uuid, p_membership_id uuid, p_from date, p_to date)
returns table (assignment_id uuid, shift_date date, shift_label text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.shift_date, t.label
    from public.shift_assignments a
    join public.shift_types t on t.id = a.shift_type_id
   where a.org_id = p_org_id
     and a.membership_id = p_membership_id
     and a.deleted_at is null
     and a.shift_date between p_from and p_to
     and (public.has_role(p_org_id, array['owner', 'admin'])
          or (public.is_member(p_org_id) and public.is_own_membership(p_membership_id)))
   order by a.shift_date, t.sort_order;
$$;


-- =============================================================================
-- 7. Droits d'accès
-- =============================================================================

revoke all on
  public.staff_files, public.staff_attachments, public.shift_types,
  public.shift_assignments, public.attendance_records, public.attendance_corrections,
  public.leave_requests
from anon, authenticated;

-- Fiches : créées par le trigger ; modification colonne par colonne (staff_files_guard
-- limite le membre à son téléphone et à son contact d'urgence).
grant select on public.staff_files to authenticated;
grant update (
  job_title, professional_number, phone, emergency_contact_name, emergency_contact_phone,
  start_date, contract_type
) on public.staff_files to authenticated;

grant select on public.staff_attachments to authenticated;
grant insert (id, org_id, staff_file_id, label, file_name, mime_type, size_bytes, storage_path)
  on public.staff_attachments to authenticated;
grant update (label, deleted_at) on public.staff_attachments to authenticated;

grant select on public.shift_types to authenticated;
grant insert (id, org_id, label, start_time, end_time, sort_order, is_active)
  on public.shift_types to authenticated;
grant update (label, start_time, end_time, sort_order, is_active, deleted_at)
  on public.shift_types to authenticated;

grant select on public.shift_assignments to authenticated;
grant insert (id, org_id, shift_type_id, membership_id, shift_date, note)
  on public.shift_assignments to authenticated;
grant update (note, deleted_at) on public.shift_assignments to authenticated;

-- Présences et corrections : lecture seule ; écriture par les RPC uniquement.
grant select on public.attendance_records to authenticated;
grant select on public.attendance_corrections to authenticated;

-- Congés : demande directe ; décision et annulation par les RPC.
grant select on public.leave_requests to authenticated;
grant insert (id, org_id, membership_id, leave_type, start_date, end_date, reason)
  on public.leave_requests to authenticated;

revoke execute on function
  public.is_own_membership(uuid),
  public.current_membership_id(uuid),
  public.personnel_can_write(uuid),
  public.personnel_assert_can_write(uuid),
  public.staff_files_guard(),
  public.memberships_create_staff_file(),
  public.storage_second_uuid(text),
  public.is_own_staff_file(uuid, uuid),
  public.seed_shift_types(uuid),
  public.organizations_seed_shift_types(),
  public.shift_assignments_guard(),
  public.org_today(uuid),
  public.attendance_corrections_immutable(),
  public.attendance_open_record(uuid),
  public.clock_in(uuid),
  public.clock_out(uuid),
  public.correct_attendance(uuid, uuid, timestamptz, timestamptz, text, uuid, date),
  public.decide_leave(uuid, boolean, text),
  public.cancel_leave(uuid),
  public.leave_requests_guard(),
  public.org_leave_calendar(uuid, date, date),
  public.leave_conflicts(uuid, uuid, date, date)
from public, anon, authenticated;

-- Aides appelées par les policies et triggers (exécutés avec les droits de l'utilisateur),
-- et RPC du module.
grant execute on function
  public.is_own_membership(uuid),
  public.current_membership_id(uuid),
  public.personnel_can_write(uuid),
  public.storage_second_uuid(text),
  public.is_own_staff_file(uuid, uuid),
  public.org_today(uuid),
  public.clock_in(uuid),
  public.clock_out(uuid),
  public.correct_attendance(uuid, uuid, timestamptz, timestamptz, text, uuid, date),
  public.decide_leave(uuid, boolean, text),
  public.cancel_leave(uuid),
  public.org_leave_calendar(uuid, date, date),
  public.leave_conflicts(uuid, uuid, date, date)
to authenticated;


-- =============================================================================
-- 8. Row Level Security
-- =============================================================================

alter table public.staff_files            enable row level security;
alter table public.staff_attachments      enable row level security;
alter table public.shift_types            enable row level security;
alter table public.shift_assignments      enable row level security;
alter table public.attendance_records     enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.leave_requests         enable row level security;

-- Fiches : owner et admin voient tout ; chacun voit la sienne.
create policy staff_files_select on public.staff_files
  for select to authenticated
  using (
    public.has_role(org_id, array['owner', 'admin'])
    or (public.is_member(org_id) and public.is_own_membership(membership_id))
  );
create policy staff_files_update on public.staff_files
  for update to authenticated
  using (
    public.personnel_can_write(org_id)
    and (public.has_role(org_id, array['owner', 'admin'])
         or (public.is_member(org_id) and public.is_own_membership(membership_id)))
  )
  with check (
    public.personnel_can_write(org_id)
    and (public.has_role(org_id, array['owner', 'admin'])
         or (public.is_member(org_id) and public.is_own_membership(membership_id)))
  );

create policy staff_attachments_select on public.staff_attachments
  for select to authenticated
  using (
    public.has_role(org_id, array['owner', 'admin'])
    or (public.is_member(org_id) and public.is_own_staff_file(org_id, staff_file_id))
  );
create policy staff_attachments_insert_admin on public.staff_attachments
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));
create policy staff_attachments_update_admin on public.staff_attachments
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));

-- Planning : lu par toute l'équipe, écrit par owner et admin.
create policy shift_types_select_member on public.shift_types
  for select to authenticated
  using (public.is_member(org_id));
create policy shift_types_insert_admin on public.shift_types
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));
create policy shift_types_update_admin on public.shift_types
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));

create policy shift_assignments_select_member on public.shift_assignments
  for select to authenticated
  using (public.is_member(org_id));
create policy shift_assignments_insert_admin on public.shift_assignments
  for insert to authenticated
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));
create policy shift_assignments_update_admin on public.shift_assignments
  for update to authenticated
  using (public.has_role(org_id, array['owner', 'admin']))
  with check (public.has_role(org_id, array['owner', 'admin'])
              and public.personnel_can_write(org_id));

-- Présences : owner et admin voient tout ; chacun voit les siennes.
create policy attendance_records_select on public.attendance_records
  for select to authenticated
  using (
    public.has_role(org_id, array['owner', 'admin'])
    or (public.is_member(org_id) and public.is_own_membership(membership_id))
  );
create policy attendance_corrections_select on public.attendance_corrections
  for select to authenticated
  using (
    public.has_role(org_id, array['owner', 'admin'])
    or (public.is_member(org_id) and exists (
      select 1 from public.attendance_records a
       where a.id = attendance_record_id and public.is_own_membership(a.membership_id)))
  );

-- Congés : owner et admin voient tout ; chacun voit les siens (l'équipe passe par
-- org_leave_calendar). Demande : pour soi, ou par un responsable pour un membre.
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (
    public.has_role(org_id, array['owner', 'admin'])
    or (public.is_member(org_id) and public.is_own_membership(membership_id))
  );
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated
  with check (
    public.personnel_can_write(org_id)
    and (public.has_role(org_id, array['owner', 'admin'])
         or (public.is_member(org_id) and public.is_own_membership(membership_id)))
  );
