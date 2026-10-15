-- =============================================================================
-- Tests — étape 12, partie C (Tickets de consultation, motifs de gratuité)
-- -----------------------------------------------------------------------------
-- Vérifie : motifs de gratuité pré-remplis pour un poste, aucun pour une clinique ;
-- liste modifiable par owner et admin seulement (ajout, retrait sans suppression) ;
-- vente payante (espèces, Wave) avec reçu, gratuite avec un motif actif de la liste ;
-- motif retiré, d'une autre structure ou en texte libre refusé ; libellé du motif
-- recopié au jour de la vente ; tickets du jour et bilan (payants, montant, modes de
-- paiement ; gratuits comptés à part, par motif) ; droits de lecture ; clinique exclue.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape12c.sql
-- ou en collant ce fichier dans le SQL Editor du tableau de bord.
--
-- Chaque vérification affiche « OK : … ». Au premier échec, une erreur
-- « ÉCHEC : … » interrompt le script.
-- Prérequis : migrations des étapes 3 à 12 appliquées (dont etape12c_gratuites et
-- etape12c_valeur_gratuites).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Préparation : A owner du poste, B owner d'une clinique ; chez A : D admin,
-- C infirmier, 06 caissier, 07 pharmacien, 09 accueil, 10 comptable.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a12c-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e12c-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0c', '0d', '06', '07', '09', '10']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a12c-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique de B', 'clinique', 'SN', 'Dakar')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a12c-00000000000a", "role": "authenticated"}', true);
select set_config('test.org_a',
  public.create_organization('Poste de santé de A', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org_a')::uuid, ('00000000-0000-4000-a12c-0000000000' || c)::uuid,
       r, true
  from (values ('0d', 'admin'), ('0c', 'infirmier'), ('06', 'caissier'),
               ('07', 'pharmacien'), ('09', 'accueil'), ('10', 'comptable')) v(c, r);

insert into public.services (org_id, label, category, price)
values (current_setting('test.org_a')::uuid, 'Consultation adulte', 'consultation', 1000),
       (current_setting('test.org_a')::uuid, 'Consultation enfant', 'consultation', 500);

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a12c-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.en_tant_que(text) to authenticated;

create function pg_temp.motif(p_code text) returns uuid language sql as $$
  select id from public.exemption_reasons
   where org_id = current_setting('test.org_a')::uuid and template_code = p_code;
$$;
create function pg_temp.prestation(p_libelle text) returns uuid language sql as $$
  select id from public.services
   where org_id = current_setting('test.org_a')::uuid and label = p_libelle;
$$;
create function pg_temp.file_a() returns uuid language sql as $$
  select id from public.queue_services
   where org_id = current_setting('test.org_a')::uuid and letter = 'A';
$$;
grant execute on function pg_temp.motif(text), pg_temp.prestation(text), pg_temp.file_a()
  to authenticated;

-- Patients de A.
insert into public.patients (org_id, last_name, first_name, sex, declared_age)
select current_setting('test.org_a')::uuid, 'Diallo', 'Patient ' || i, 'F', 20 + i
  from generate_series(1, 6) i;

do $$
begin
  if (select count(*) from public.exemption_reasons
      where org_id = current_setting('test.org_a')::uuid) <> 5
     or exists (select 1 from public.exemption_reasons
                where org_id = current_setting('test.org_b')::uuid) then
    raise exception 'ÉCHEC : motifs de gratuité mal pré-remplis';
  end if;
  if to_regprocedure('public.sell_consultation_ticket(uuid, uuid, uuid, uuid, text, text, text, text, text)')
     is not null then
    raise exception 'ÉCHEC : ancienne vente à motif libre encore présente';
  end if;
  raise notice 'OK : motifs de gratuité pré-remplis pour le poste, aucun pour la clinique';
end $$;

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Liste des motifs : owner et admin
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
begin
  begin
    insert into public.exemption_reasons (org_id, label)
    values (current_setting('test.org_a')::uuid, 'Ami du caissier');
    raise exception 'ÉCHEC : le caissier ajoute un motif';
  exception when insufficient_privilege then
    null;
  end;
  update public.exemption_reasons set is_active = false
   where org_id = current_setting('test.org_a')::uuid;
  if found then
    raise exception 'ÉCHEC : le caissier modifie la liste';
  end if;
  if (select count(*) from public.exemption_reasons) <> 5 then
    raise exception 'ÉCHEC : le caissier ne lit pas la liste';
  end if;
  raise notice 'OK : le caissier lit la liste sans la modifier';
end $$;

select pg_temp.en_tant_que('07');
do $$
begin
  if exists (select 1 from public.exemption_reasons) then
    raise exception 'ÉCHEC : le pharmacien lit les motifs';
  end if;
end $$;

select pg_temp.en_tant_que('0d');
do $$
begin
  insert into public.exemption_reasons (org_id, label, sort_order)
  values (current_setting('test.org_a')::uuid, 'Agent de santé', 60);
  update public.exemption_reasons set is_active = false where id = pg_temp.motif('mutuelle');
  begin
    delete from public.exemption_reasons where id = pg_temp.motif('mutuelle');
    raise exception 'ÉCHEC : motif supprimé physiquement';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK : l''admin ajoute et retire des motifs, sans suppression';
end $$;

-- -----------------------------------------------------------------------------
-- Ventes
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('06');
do $$
declare
  v_org uuid := current_setting('test.org_a')::uuid;
  v_p   uuid[] := array(select id from public.patients where org_id = v_org order by first_name);
  v_r   jsonb;
begin
  v_r := public.sell_consultation_ticket(v_org, v_p[1], pg_temp.prestation('Consultation adulte'),
                                         pg_temp.file_a(), 'normal', null, 'cash');
  if (v_r ->> 'amount')::bigint <> 1000 or v_r ->> 'receipt_number' is null
     or v_r ->> 'service_label' <> 'Consultation adulte' then
    raise exception 'ÉCHEC : vente payante : %', v_r;
  end if;
  v_r := public.sell_consultation_ticket(v_org, v_p[2], pg_temp.prestation('Consultation adulte'),
                                         pg_temp.file_a(), 'normal', null, 'wave', 'WV-42');
  if v_r ->> 'payment_reference' <> 'WV-42' then
    raise exception 'ÉCHEC : référence Wave';
  end if;
  raise notice 'OK : tickets payants (espèces, Wave) avec reçu';

  v_r := public.sell_consultation_ticket(v_org, v_p[3], pg_temp.prestation('Consultation enfant'),
                                         pg_temp.file_a(), 'under_five', null, null, null,
                                         pg_temp.motif('moins_5_ans'));
  if (v_r ->> 'amount')::bigint <> 0 or v_r ->> 'receipt_number' is not null
     or v_r ->> 'exemption_reason' <> 'Enfant de moins de 5 ans'
     or (select unit_price from public.consultation_tickets
          where id = (v_r ->> 'consultation_ticket_id')::uuid) <> 500 then
    raise exception 'ÉCHEC : ticket gratuit (encaissé 0, valeur = tarif du jour) : %', v_r;
  end if;
  perform public.sell_consultation_ticket(v_org, v_p[4], pg_temp.prestation('Consultation adulte'),
                                          pg_temp.file_a(), 'normal', null, null, null,
                                          pg_temp.motif('csu'));
  perform public.sell_consultation_ticket(v_org, v_p[5], pg_temp.prestation('Consultation adulte'),
    pg_temp.file_a(), 'normal', null, null, null,
    (select id from public.exemption_reasons where org_id = v_org and label = 'Agent de santé'));
  raise notice 'OK : tickets gratuits à 0 FCFA, sans reçu, avec un motif de la liste';

  begin
    perform public.sell_consultation_ticket(v_org, v_p[6], pg_temp.prestation('Consultation adulte'),
                                            pg_temp.file_a(), 'normal', null, null, null,
                                            pg_temp.motif('mutuelle'));
    raise exception 'ÉCHEC : motif retiré accepté';
  exception when invalid_parameter_value then
    null;
  end;
  begin
    perform public.sell_consultation_ticket(v_org, v_p[6], pg_temp.prestation('Consultation adulte'),
                                            pg_temp.file_a(), 'normal', null, null, null,
                                            gen_random_uuid());
    raise exception 'ÉCHEC : motif inconnu accepté';
  exception when invalid_parameter_value then
    null;
  end;
  begin
    perform public.sell_consultation_ticket(v_org, v_p[6], pg_temp.prestation('Consultation adulte'),
                                            pg_temp.file_a(), 'normal', null, null);
    raise exception 'ÉCHEC : ticket payant sans mode de paiement';
  exception when invalid_parameter_value then
    null;
  end;
  if exists (select 1 from public.visits where patient_id = v_p[6]) then
    raise exception 'ÉCHEC : arrivée gardée malgré une vente refusée';
  end if;
  raise notice 'OK : motif retiré ou inconnu refusé, mode de paiement exigé, rien d''enregistré';
end $$;

-- Motif renommé après la vente : le ticket garde le libellé du jour.
select pg_temp.en_tant_que('0d');
update public.exemption_reasons set label = 'Couverture maladie universelle'
 where id = pg_temp.motif('csu');

-- -----------------------------------------------------------------------------
-- Tickets du jour et bilan
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');  -- accueil
do $$
declare
  v_b jsonb;
begin
  if (select count(*) from public.list_consultation_tickets(current_setting('test.org_a')::uuid)) <> 5
     or not exists (select 1 from public.list_consultation_tickets(current_setting('test.org_a')::uuid)
                    where exemption_reason = 'CSU' and amount = 0 and receipt_number is null)
     or not exists (select 1 from public.list_consultation_tickets(current_setting('test.org_a')::uuid)
                    where payment_method = 'wave' and receipt_number like 'R-____-0000__') then
    raise exception 'ÉCHEC : tickets du jour';
  end if;
  raise notice 'OK : tickets du jour lisibles par l''accueil (libellé du motif du jour de la vente)';

  v_b := public.consultation_tickets_summary(current_setting('test.org_a')::uuid);
  if (v_b ->> 'paid_count')::int <> 2 or (v_b ->> 'paid_amount')::bigint <> 2000
     or (v_b ->> 'free_count')::int <> 3 or (v_b ->> 'free_value')::bigint <> 2500
     or jsonb_array_length(v_b -> 'free_by_reason') <> 3
     or not (v_b -> 'free_by_reason') @> '[{"label": "CSU", "count": 1, "value": 1000},
       {"label": "Enfant de moins de 5 ans", "count": 1, "value": 500}]'
     or not (v_b -> 'by_method') @> '[{"method": "cash", "count": 1, "amount": 1000},
                                      {"method": "wave", "count": 1, "amount": 1000}]' then
    raise exception 'ÉCHEC : bilan : %', v_b;
  end if;
  if not exists (select 1 from public.list_consultation_tickets(current_setting('test.org_a')::uuid)
                 where amount = 0 and unit_price = 1000 and exemption_reason = 'CSU') then
    raise exception 'ÉCHEC : valeur du ticket gratuit absente de la liste';
  end if;
  raise notice 'OK : bilan : payants et montant par mode ; gratuits à part, par motif, avec leur valeur';
end $$;

select pg_temp.en_tant_que('10');  -- comptable
do $$
begin
  if (public.consultation_tickets_summary(current_setting('test.org_a')::uuid) ->> 'free_count')::int <> 3 then
    raise exception 'ÉCHEC : le comptable ne lit pas le bilan';
  end if;
  raise notice 'OK : le comptable lit le bilan';
end $$;

select pg_temp.en_tant_que('07');  -- pharmacien
do $$
begin
  perform public.consultation_tickets_summary(current_setting('test.org_a')::uuid);
  raise exception 'ÉCHEC : le pharmacien lit le bilan des tickets';
exception when insufficient_privilege then
  raise notice 'OK : bilan fermé au pharmacien';
end $$;

-- -----------------------------------------------------------------------------
-- Clinique : pas de tickets de consultation
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0b');
do $$
begin
  perform public.list_consultation_tickets(current_setting('test.org_b')::uuid);
  raise exception 'ÉCHEC : tickets de consultation dans une clinique';
exception when insufficient_privilege then
  raise notice 'OK : tickets de consultation réservés aux postes de santé';
end $$;

reset role;

rollback;
