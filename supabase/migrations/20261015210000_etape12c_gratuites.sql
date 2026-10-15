-- =============================================================================
-- Étape 12, partie C — Tickets de consultation : motifs de gratuité paramétrables
-- -----------------------------------------------------------------------------
-- 1. exemption_reason_templates : motifs proposés à la création d'un poste de santé.
-- 2. exemption_reasons          : motifs de la structure (liste modifiable par owner et
--                                 admin, retrait sans suppression). Aucun motif en dur.
-- 3. consultation_tickets       : motif de gratuité choisi dans la liste (exemption_reason_id),
--                                 libellé recopié au jour de la vente.
-- 4. sell_consultation_ticket   : la gratuité se choisit par son motif (id), plus en texte
--                                 libre. Ancienne signature supprimée (aucun appel existant).
-- 5. Lecture                    : list_consultation_tickets (tickets du jour, reçu compris),
--                                 consultation_tickets_summary (payants, montant, modes de
--                                 paiement ; gratuits comptés à part, par motif).
-- =============================================================================


-- =============================================================================
-- 1. Aides
-- =============================================================================

-- Lecture des tickets : vendeurs (owner, admin, accueil, caissier, infirmier) et finances.
create function public.tickets_can_read(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'tickets_consultation')
     and (public.has_role(p_org_id, array['owner', 'admin', 'accueil', 'caissier', 'infirmier'])
          or public.receipts_can_read(p_org_id));
$$;

-- Liste des motifs de gratuité : owner et admin, abonnement actif.
create function public.tickets_can_configure(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_has_feature(p_org_id, 'tickets_consultation')
     and public.has_role(p_org_id, array['owner', 'admin'])
     and public.patients_org_writable(p_org_id);
$$;


-- =============================================================================
-- 2. Motifs de gratuité
-- =============================================================================

create table public.exemption_reason_templates (
  plan_code  text not null references public.plans (code) on update cascade,
  code       text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, code)
);

comment on table public.exemption_reason_templates is
  'Motifs de gratuité proposés à la création d''une structure, par type.';

create trigger exemption_reason_templates_set_updated_at
  before update on public.exemption_reason_templates
  for each row execute function public.set_updated_at();

insert into public.exemption_reason_templates (plan_code, code, label, sort_order) values
  ('poste_sante', 'moins_5_ans', 'Enfant de moins de 5 ans', 10),
  ('poste_sante', 'plan_sesame', 'Plan Sésame',              20),
  ('poste_sante', 'indigent',    'Indigent',                 30),
  ('poste_sante', 'csu',         'CSU',                      40),
  ('poste_sante', 'mutuelle',    'Mutuelle',                 50)
on conflict (plan_code, code) do nothing;

create table public.exemption_reasons (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id),
  template_code  text,
  label          text not null check (char_length(btrim(label)) between 2 and 60),
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at     timestamptz,
  constraint exemption_reasons_id_org_unique unique (id, org_id)
);

create unique index exemption_reasons_org_label_unique
  on public.exemption_reasons (org_id, lower(btrim(label))) where deleted_at is null;

comment on table public.exemption_reasons is
  'Motifs de gratuité des tickets de consultation, propres à chaque structure.';

create trigger exemption_reasons_set_updated_at before update on public.exemption_reasons
  for each row execute function public.set_updated_at();
create trigger exemption_reasons_audit after insert or update or delete on public.exemption_reasons
  for each row execute function public.audit_trigger();

-- Pré-remplissage, rejouable : rien n'est ajouté à une structure qui a déjà sa liste.
create function public.seed_exemption_reasons(p_org_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.exemption_reasons (org_id, template_code, label, sort_order, created_by)
  select o.id, t.code, t.label, t.sort_order, null
    from public.organizations o
    join public.exemption_reason_templates t on t.plan_code = o.type and t.is_active
   where o.id = p_org_id
     and not exists (select 1 from public.exemption_reasons r where r.org_id = p_org_id);
$$;

create function public.organizations_seed_exemption_reasons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_exemption_reasons(new.id);
  return null;
end;
$$;

create trigger organizations_seed_exemption_reasons
  after insert on public.organizations
  for each row execute function public.organizations_seed_exemption_reasons();

select public.seed_exemption_reasons(o.id) from public.organizations o;


-- =============================================================================
-- 3. Motif choisi sur le ticket
-- =============================================================================

alter table public.consultation_tickets
  add column exemption_reason_id uuid,
  add constraint consultation_tickets_exemption_reason_fk
    foreign key (exemption_reason_id, org_id) references public.exemption_reasons (id, org_id);

-- Tickets vendus désormais : un ticket à 0 FCFA a toujours un motif de la liste.
-- (NOT VALID : les éventuels tickets d'essai d'avant ne sont pas revérifiés.)
alter table public.consultation_tickets
  add constraint consultation_tickets_exemption_reason_id_check
    check ((amount = 0) = (exemption_reason_id is not null)) not valid;

create index consultation_tickets_reason_idx
  on public.consultation_tickets (org_id, exemption_reason_id)
  where exemption_reason_id is not null;

comment on column public.consultation_tickets.exemption_reason is
  'Libellé du motif de gratuité au jour de la vente (la liste peut changer ensuite).';


-- =============================================================================
-- 4. Vente : la gratuité se choisit dans la liste
-- =============================================================================

drop function public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, text);

-- Vente du ticket + arrivée dans la file, en une seule action. Tarif lu dans services ;
-- gratuité : un motif actif de la liste de la structure (aucune règle de gratuité ici).
create function public.sell_consultation_ticket(
  p_org_id              uuid,
  p_patient_id          uuid,
  p_service_id          uuid,
  p_queue_service_id    uuid,
  p_priority            text default 'normal',
  p_reason              text default null,
  p_payment_method      text default 'cash',
  p_payment_reference   text default null,
  p_exemption_reason_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service  public.services;
  v_motif    public.exemption_reasons;
  v_visite   public.visits;
  v_recu     public.pending_receipts;
  v_ticket   public.consultation_tickets;
  v_gratuit  boolean := p_exemption_reason_id is not null;
begin
  if not public.has_role(p_org_id, array['owner', 'admin', 'accueil', 'caissier', 'infirmier'])
     or not public.org_has_feature(p_org_id, 'tickets_consultation')
     or not public.queue_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de vendre un ticket de consultation.'
      using errcode = '42501';
  end if;
  if not public.tickets_can_sell(p_org_id) then
    raise exception 'L''abonnement de la structure ne permet pas d''enregistrer pour le moment.'
      using errcode = '22023';
  end if;

  select * into v_service from public.services
   where id = p_service_id and org_id = p_org_id and is_active and deleted_at is null;
  if not found then
    raise exception 'Choisissez la prestation vendue.' using errcode = '22023';
  end if;
  if v_service.price is null then
    raise exception 'Le tarif de « % » n''est pas encore saisi : renseignez-le dans Paramètres, Services.',
      v_service.label using errcode = '22023';
  end if;

  if v_gratuit then
    select * into v_motif from public.exemption_reasons
     where id = p_exemption_reason_id and org_id = p_org_id
       and is_active and deleted_at is null;
    if not found then
      raise exception 'Choisissez le motif de la gratuité dans la liste.' using errcode = '22023';
    end if;
  else
    if v_service.price = 0 then
      raise exception 'Cette prestation est à 0 FCFA : choisissez le motif de la gratuité.'
        using errcode = '22023';
    end if;
    if coalesce(p_payment_method, '') not in ('cash', 'wave', 'orange_money', 'free_money') then
      raise exception 'Choisissez le mode de paiement.' using errcode = '22023';
    end if;
  end if;

  v_visite := public.visit_create(p_org_id, p_patient_id, p_queue_service_id, p_priority,
                                  p_reason, 'consultation_ticket');

  if not v_gratuit then
    insert into public.pending_receipts (org_id, receipt_number, patient_id, source_type,
                                         source_id, label, amount, payment_method,
                                         payment_reference)
    values (p_org_id, public.next_receipt_number(p_org_id), p_patient_id,
            'consultation_ticket', v_visite.id, 'Ticket de consultation : ' || v_service.label,
            v_service.price, p_payment_method,
            nullif(btrim(coalesce(p_payment_reference, '')), ''))
    returning * into v_recu;
  end if;

  insert into public.consultation_tickets (org_id, visit_id, patient_id, service_id,
                                           service_label, unit_price, amount,
                                           exemption_reason, exemption_reason_id, receipt_id)
  values (p_org_id, v_visite.id, p_patient_id, v_service.id, v_service.label,
          v_service.price, case when v_gratuit then 0 else v_service.price end,
          v_motif.label, v_motif.id, v_recu.id)
  returning * into v_ticket;

  return jsonb_build_object(
    'visit_id', v_visite.id,
    'ticket_number', v_visite.ticket_number,
    'public_code', v_visite.public_code,
    'arrived_at', v_visite.arrived_at,
    'consultation_ticket_id', v_ticket.id,
    'service_label', v_ticket.service_label,
    'amount', v_ticket.amount,
    'exemption_reason', v_ticket.exemption_reason,
    'receipt_number', v_recu.receipt_number,
    'payment_method', v_recu.payment_method,
    'payment_reference', v_recu.payment_reference,
    'received_at', v_recu.received_at);
end;
$$;


-- =============================================================================
-- 5. Lecture : tickets du jour et bilan
-- =============================================================================

-- Tickets vendus un jour donné (jour de la structure par défaut), avec leur reçu. Le motif
-- de venue n'y figure jamais.
create function public.list_consultation_tickets(p_org_id uuid, p_date date default null)
returns table (
  consultation_ticket_id uuid,
  visit_id               uuid,
  ticket_number          text,
  public_code            text,
  arrived_at             timestamptz,
  patient_id             uuid,
  file_number            text,
  last_name              text,
  first_name             text,
  service_label          text,
  amount                 bigint,
  exemption_reason       text,
  receipt_number         text,
  payment_method         text,
  payment_reference      text,
  sold_at                timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date;
begin
  if not public.tickets_can_read(p_org_id) then
    raise exception 'Votre rôle ne donne pas accès aux tickets de consultation.'
      using errcode = '42501';
  end if;
  v_jour := coalesce(p_date, public.org_local_date(p_org_id));

  return query
  select t.id, v.id, v.ticket_number, v.public_code, v.arrived_at, p.id, p.file_number,
         p.last_name, p.first_name, t.service_label, t.amount, t.exemption_reason,
         r.receipt_number, r.payment_method, r.payment_reference, t.created_at
    from public.consultation_tickets t
    join public.visits v on v.id = t.visit_id
    join public.patients p on p.id = t.patient_id
    left join public.pending_receipts r on r.id = t.receipt_id
   where t.org_id = p_org_id and t.deleted_at is null
     and v.visit_date = v_jour
   order by t.created_at desc;
end;
$$;

-- Bilan d'une période (bornes incluses, jours de la structure) : tickets payants et montant,
-- par mode de paiement ; tickets gratuits comptés à part, par motif.
create function public.consultation_tickets_summary(
  p_org_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_du date;
  v_au date;
begin
  if not public.tickets_can_read(p_org_id) then
    raise exception 'Votre rôle ne donne pas accès aux tickets de consultation.'
      using errcode = '42501';
  end if;
  v_du := coalesce(p_from, public.org_local_date(p_org_id));
  v_au := coalesce(p_to, v_du);

  return (
    with tickets as (
      select t.amount, t.exemption_reason_id, t.exemption_reason, r.payment_method
        from public.consultation_tickets t
        join public.visits v on v.id = t.visit_id
        left join public.pending_receipts r on r.id = t.receipt_id
       where t.org_id = p_org_id and t.deleted_at is null
         and v.visit_date between v_du and v_au)
    select jsonb_build_object(
      'from', v_du,
      'to', v_au,
      'paid_count', count(*) filter (where amount > 0),
      'paid_amount', coalesce(sum(amount) filter (where amount > 0), 0),
      'free_count', count(*) filter (where amount = 0),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', m.payment_method, 'count', m.n,
                                            'amount', m.total) order by m.total desc)
          from (select payment_method, count(*) as n, sum(amount) as total
                  from tickets where amount > 0 group by payment_method) m), '[]'::jsonb),
      'free_by_reason', coalesce((
        select jsonb_agg(jsonb_build_object('reason_id', f.exemption_reason_id,
                                            'label', f.libelle, 'count', f.n)
                         order by f.n desc, f.libelle)
          from (select exemption_reason_id, min(exemption_reason) as libelle, count(*) as n
                  from tickets where amount = 0
                 group by exemption_reason_id) f), '[]'::jsonb))
      from tickets);
end;
$$;


-- =============================================================================
-- 6. Droits d'accès et Row Level Security
-- =============================================================================

revoke all on public.exemption_reason_templates, public.exemption_reasons
  from anon, authenticated;

grant select on public.exemption_reason_templates to authenticated;
grant select on public.exemption_reasons to authenticated;
grant insert (id, org_id, label, is_active, sort_order) on public.exemption_reasons to authenticated;
grant update (label, is_active, sort_order, deleted_at) on public.exemption_reasons to authenticated;

revoke execute on function
  public.tickets_can_read(uuid),
  public.tickets_can_configure(uuid),
  public.seed_exemption_reasons(uuid),
  public.organizations_seed_exemption_reasons(),
  public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, uuid),
  public.list_consultation_tickets(uuid, date),
  public.consultation_tickets_summary(uuid, date, date)
from public, anon, authenticated;

grant execute on function
  public.tickets_can_read(uuid),
  public.tickets_can_configure(uuid),
  public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, uuid),
  public.list_consultation_tickets(uuid, date),
  public.consultation_tickets_summary(uuid, date, date)
to authenticated;

alter table public.exemption_reason_templates enable row level security;
alter table public.exemption_reasons          enable row level security;

create policy exemption_reason_templates_select_all on public.exemption_reason_templates
  for select to authenticated using (true);

create policy exemption_reasons_select on public.exemption_reasons
  for select to authenticated
  using (public.tickets_can_read(org_id));
create policy exemption_reasons_insert on public.exemption_reasons
  for insert to authenticated
  with check (public.tickets_can_configure(org_id));
create policy exemption_reasons_update on public.exemption_reasons
  for update to authenticated
  using (public.tickets_can_configure(org_id))
  with check (public.tickets_can_configure(org_id));
