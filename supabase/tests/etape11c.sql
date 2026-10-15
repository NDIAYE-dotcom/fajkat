-- =============================================================================
-- Tests — étape 11c (Fiche patient)
-- -----------------------------------------------------------------------------
-- Aucune migration : vérifie que les règles de la partie A couvrent la fiche.
-- Vérifie : le caissier modifie l'identité ; chaque modification est journalisée
-- (auteur, date, ancienne et nouvelle valeur) ; journal lisible par owner et admin
-- seulement ; pharmacien sans modification ; couverture retirée sans suppression ;
-- dossier d'une autre structure invisible (lien ou QR scanné).
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11c.sql
-- Prérequis : migrations des étapes 3 à 11b appliquées.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a11c-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11c-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '06', '07']) c;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-00000000000b", "role": "authenticated"}', true);
select set_config('test.org_b',
  public.create_organization('Clinique 11c', 'clinique', 'SN', 'Dakar')::text, true);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-00000000000a", "role": "authenticated"}', true);
select set_config('test.org',
  public.create_organization('Poste de santé 11c', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
values (current_setting('test.org')::uuid, '00000000-0000-4000-a11c-000000000006', 'caissier', true),
       (current_setting('test.org')::uuid, '00000000-0000-4000-a11c-000000000007', 'pharmacien', true);
insert into public.patients (org_id, last_name, first_name, sex, declared_age, phone, phone_owner)
values (current_setting('test.org')::uuid, 'Sy', 'Awa', 'F', 25, '+221771234567', 'patient');
select set_config('test.p', (select id::text from public.patients
  where org_id = current_setting('test.org')::uuid), true);
insert into public.payers (org_id, kind, name, coverage_rate)
values (current_setting('test.org')::uuid, 'mutuelle', 'Mutuelle 11c', 70);

set local role authenticated;

-- Caissier : modifie l'identité, ne lit pas le journal.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-000000000006", "role": "authenticated"}', true);
do $$
declare
  v_p uuid := current_setting('test.p')::uuid;
  v_n integer;
begin
  update public.patients set phone = '+221781112233', neighborhood = 'Sikilo' where id = v_p;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'ÉCHEC : le caissier ne modifie pas l''identité';
  end if;
  if exists (select 1 from public.audit_logs) then
    raise exception 'ÉCHEC : le caissier lit le journal';
  end if;

  insert into public.patient_coverages (org_id, patient_id, scheme, payer_id)
  select current_setting('test.org')::uuid, v_p, 'mutuelle', id from public.payers
   where org_id = current_setting('test.org')::uuid;
  update public.patient_coverages set deleted_at = now() where patient_id = v_p;
  raise notice 'OK : le caissier modifie l''identité et retire une couverture, sans lire le journal';
end $$;

-- Pharmacien : lit, ne modifie rien (la RLS ne laisse passer aucune ligne).
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-000000000007", "role": "authenticated"}', true);
do $$
begin
  update public.patients set neighborhood = 'Intrus' where id = current_setting('test.p')::uuid;
  if (select neighborhood from public.patients where id = current_setting('test.p')::uuid)
     <> 'Sikilo' then
    raise exception 'ÉCHEC : le pharmacien modifie l''identité';
  end if;
  raise notice 'OK : le pharmacien lit la fiche sans la modifier';
end $$;

-- B, owner d'une autre structure : le dossier n'existe pas pour lui (lien ou QR scanné).
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-00000000000b", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.patients where id = current_setting('test.p')::uuid) then
    raise exception 'ÉCHEC : dossier visible depuis une autre structure';
  end if;
  raise notice 'OK : dossier invisible pour un compte d''une autre structure';
end $$;

-- Owner : lit le journal, avec auteur, ancienne et nouvelle valeur.
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a11c-00000000000a", "role": "authenticated"}', true);
do $$
declare
  v_l public.audit_logs;
begin
  select * into v_l from public.audit_logs
   where table_name = 'patients' and record_id = current_setting('test.p') and action = 'UPDATE'
   order by created_at desc limit 1;
  if v_l.id is null
     or v_l.user_id <> '00000000-0000-4000-a11c-000000000006'
     or v_l.old_data ->> 'phone' <> '+221771234567'
     or v_l.new_data ->> 'phone' <> '+221781112233'
     or v_l.new_data ->> 'neighborhood' <> 'Sikilo' then
    raise exception 'ÉCHEC : modification de l''identité mal journalisée';
  end if;
  if (select count(*) from public.audit_logs
      where table_name = 'patients' and record_id = current_setting('test.p')
        and action = 'UPDATE') <> 1 then
    raise exception 'ÉCHEC : la tentative du pharmacien apparaît dans le journal';
  end if;
  if not exists (select 1 from public.patient_coverages
                 where patient_id = current_setting('test.p')::uuid and deleted_at is not null) then
    raise exception 'ÉCHEC : couverture supprimée au lieu d''être retirée';
  end if;
  raise notice 'OK : journal lu par l''owner : auteur, date, ancienne et nouvelle valeur';
end $$;

reset role;

rollback;
