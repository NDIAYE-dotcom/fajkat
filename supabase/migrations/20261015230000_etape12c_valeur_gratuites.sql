-- =============================================================================
-- Étape 12, partie C — Valeur des tickets gratuits
-- -----------------------------------------------------------------------------
-- Un ticket gratuit garde le tarif du jour comme valeur (consultation_tickets.unit_price,
-- déjà enregistré par sell_consultation_ticket) ; encaissé = 0 (amount).
-- 1. consultation_tickets_summary : valeur totale des gratuits, et par motif : nombre de
--    tickets et valeur totale.
-- 2. list_consultation_tickets    : renvoie aussi la valeur (unit_price).
-- =============================================================================

-- Bilan d'une période (bornes incluses, jours de la structure) : tickets payants et montant,
-- par mode de paiement ; tickets gratuits comptés à part, par motif, avec leur valeur.
create or replace function public.consultation_tickets_summary(
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
      select t.amount, t.unit_price, t.exemption_reason_id, t.exemption_reason,
             r.payment_method
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
      'free_value', coalesce(sum(unit_price) filter (where amount = 0), 0),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', m.payment_method, 'count', m.n,
                                            'amount', m.total) order by m.total desc)
          from (select payment_method, count(*) as n, sum(amount) as total
                  from tickets where amount > 0 group by payment_method) m), '[]'::jsonb),
      'free_by_reason', coalesce((
        select jsonb_agg(jsonb_build_object('reason_id', f.exemption_reason_id,
                                            'label', f.libelle, 'count', f.n,
                                            'value', f.valeur)
                         order by f.n desc, f.libelle)
          from (select exemption_reason_id, min(exemption_reason) as libelle, count(*) as n,
                       sum(unit_price) as valeur
                  from tickets where amount = 0
                 group by exemption_reason_id) f), '[]'::jsonb))
      from tickets);
end;
$$;

-- Le type de retour change : la fonction est recréée (même nom, mêmes paramètres).
drop function public.list_consultation_tickets(uuid, date);

-- Tickets vendus un jour donné (jour de la structure par défaut), avec leur reçu. Le motif
-- de venue n'y figure jamais. unit_price : tarif du jour (valeur d'un ticket gratuit).
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
  unit_price             bigint,
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
         p.last_name, p.first_name, t.service_label, t.unit_price, t.amount,
         t.exemption_reason, r.receipt_number, r.payment_method, r.payment_reference,
         t.created_at
    from public.consultation_tickets t
    join public.visits v on v.id = t.visit_id
    join public.patients p on p.id = t.patient_id
    left join public.pending_receipts r on r.id = t.receipt_id
   where t.org_id = p_org_id and t.deleted_at is null
     and v.visit_date = v_jour
   order by t.created_at desc;
end;
$$;

revoke execute on function public.list_consultation_tickets(uuid, date)
  from public, anon, authenticated;
grant execute on function public.list_consultation_tickets(uuid, date) to authenticated;
