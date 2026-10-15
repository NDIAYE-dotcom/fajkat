-- =============================================================================
-- Tests — étape 11d (Import d'une liste de patients)
-- -----------------------------------------------------------------------------
-- Vérifie : import, doublons et journal réservés à owner et admin ; journal tenu par le
-- serveur (auteur, fichier, importées, refusées, ignorées), jamais écrit directement ;
-- date estimée et consentement WhatsApp enregistrés (jamais « accepte » par défaut, rien
-- sans téléphone) ; une ligne en erreur n'arrête pas les autres ; ancien n° de dossier
-- cherchable ; doublons d'un lot (même ancien numéro et nom proche) ; journal d'un autre
-- utilisateur ou d'une autre structure refusé.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11d.sql
-- Prérequis : migrations des étapes 3 à 11d appliquées.
-- =============================================================================

begin;

-- A owner du poste, D admin, R accueil ; B owner d'une autre structure.
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a11d-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11d-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '0b', '0d', '09']) c;

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a11d-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.en_tant_que('0b');
select set_config('test.org_b',
  public.create_organization('Poste de B', 'poste_sante', 'SN', 'Ziguinchor')::text, true);
select pg_temp.en_tant_que('0a');
select set_config('test.org',
  public.create_organization('Poste de santé 11d', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a11d-0000000000' || c)::uuid,
       r, true
  from (values ('0d', 'admin'), ('09', 'accueil')) v(c, r);

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  begin
    perform public.start_patient_import(v_org, 'registre.xlsx', 1);
    raise exception 'ÉCHEC : l''accueil ouvre un import';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.find_import_duplicates(v_org, '[]'::jsonb);
    raise exception 'ÉCHEC : l''accueil cherche les doublons d''un import';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.import_patients(v_org, '[]'::jsonb);
    raise exception 'ÉCHEC : l''accueil importe';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : import, doublons et journal réservés à owner et admin';
end $$;

-- -----------------------------------------------------------------------------
-- Import par l'owner
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0a');
do $$
declare
  v_org    uuid := current_setting('test.org')::uuid;
  v_date   date := ((now() at time zone 'Africa/Dakar')::date - interval '8 months')::date;
  v_import uuid;
  v_r      record;
  v_ok     integer := 0;
  v_err    text[] := '{}';
  v_j      public.patient_imports;
begin
  v_import := public.start_patient_import(v_org, 'registre-2025.xlsx', 6, 1, 1);
  perform set_config('test.import', v_import::text, true);

  for v_r in select * from public.import_patients(v_org, jsonb_build_array(
      jsonb_build_object('line', 2, 'legacy_file_number', '1247', 'last_name', 'Diallo',
        'first_name', 'Awa', 'sex', 'F', 'birth_date', '12/03/1994',
        'phone', '+221771234567', 'phone_owner', 'patient', 'whatsapp_consent', true),
      jsonb_build_object('line', 3, 'last_name', 'Ba', 'first_name', 'Moussa', 'sex', 'M',
        'birth_date', v_date::text, 'birth_date_estimated', true),
      jsonb_build_object('line', 4, 'last_name', 'Fall', 'first_name', 'Modou', 'sex', 'M',
        'declared_age', 40, 'phone', '+221771234568', 'whatsapp_consent', null),
      jsonb_build_object('line', 5, 'last_name', 'Sow', 'first_name', 'Ali', 'sex', 'M',
        'declared_age', 30, 'whatsapp_consent', true),
      jsonb_build_object('line', 6, 'last_name', 'Ndiaye', 'first_name', 'Fatou', 'sex', 'X',
        'declared_age', 20)), v_import)
  loop
    if v_r.error is null then v_ok := v_ok + 1; else v_err := v_err || (v_r.line || ' ' || v_r.error); end if;
  end loop;
  if v_ok <> 4 or cardinality(v_err) <> 1 or v_err[1] <> '6 Sexe à indiquer : F ou M.' then
    raise exception 'ÉCHEC : rapport d''import inattendu : % / %', v_ok, v_err;
  end if;
  raise notice 'OK : une ligne en erreur n''arrête pas les autres';

  if not exists (select 1 from public.patients
                  where last_name = 'Ba' and org_id = v_org and birth_date = v_date
                    and birth_date_estimated and import_id = v_import) then
    raise exception 'ÉCHEC : date estimée ou import d''origine non enregistrés';
  end if;
  raise notice 'OK : date estimée et import d''origine enregistrés';

  if (select whatsapp_consent from public.patients where last_name = 'Diallo' and org_id = v_org)
       is distinct from true
     or (select whatsapp_consent from public.patients where last_name = 'Fall' and org_id = v_org)
       is not null
     or (select whatsapp_consent from public.patients where last_name = 'Sow' and org_id = v_org)
       is not null then
    raise exception 'ÉCHEC : consentement WhatsApp mal importé';
  end if;
  raise notice 'OK : consentement seulement s''il est écrit, et jamais sans téléphone';

  select * into v_j from public.patient_imports where id = v_import;
  if v_j.imported_count <> 4 or v_j.rejected_count <> 2 or v_j.skipped_count <> 1
     or v_j.total_rows <> 6 or v_j.file_name <> 'registre-2025.xlsx'
     or v_j.created_by <> '00000000-0000-4000-a11d-00000000000a'::uuid then
    raise exception 'ÉCHEC : journal de l''import inexact';
  end if;
  raise notice 'OK : journal : auteur, fichier, 4 importées, 2 refusées, 1 ignorée';

  if (select r.legacy_file_number from public.search_patients(v_org, '1247') r limit 1)
     is distinct from '1247' then
    raise exception 'ÉCHEC : ancien n° de dossier non trouvé en premier';
  end if;
  raise notice 'OK : ancien n° de dossier cherchable';
end $$;

-- Journal : jamais écrit directement.
do $$
begin
  begin
    insert into public.patient_imports (org_id, file_name, total_rows)
    values (current_setting('test.org')::uuid, 'faux.xlsx', 1);
    raise exception 'ÉCHEC : journal écrit directement';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.patient_imports set imported_count = 999
     where id = current_setting('test.import')::uuid;
    raise exception 'ÉCHEC : compteur du journal modifié directement';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : journal écrit seulement par le serveur';
end $$;

-- -----------------------------------------------------------------------------
-- Doublons d'un lot
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_r   record;
begin
  select * into v_r from public.find_import_duplicates(v_org, '[
      {"line": 2, "last_name": "Diallo", "first_name": "Awa", "legacy_file_number": " 1247 "},
      {"line": 3, "last_name": "Gueye", "first_name": "Penda", "legacy_file_number": "1247"}
    ]'::jsonb) where line = 2;
  if v_r.reason is distinct from 'meme_ancien_numero' then
    raise exception 'ÉCHEC : import relancé non reconnu (même ancien numéro) : %', v_r.reason;
  end if;
  if exists (select 1 from public.find_import_duplicates(v_org, '[
      {"line": 3, "last_name": "Gueye", "first_name": "Penda", "legacy_file_number": "1247"}
    ]'::jsonb)) then
    raise exception 'ÉCHEC : même ancien numéro, nom différent : doublon annoncé à tort';
  end if;
  select * into v_r from public.find_import_duplicates(v_org, '[
      {"line": 9, "last_name": "Fall", "first_name": "Modou", "phone": "+221771234568"}
    ]'::jsonb);
  if v_r.reason is distinct from 'meme_telephone' or v_r.line <> 9 then
    raise exception 'ÉCHEC : doublon par téléphone non repéré';
  end if;
  raise notice 'OK : doublons d''un lot (ancien numéro et nom proche, téléphone)';
end $$;

-- -----------------------------------------------------------------------------
-- Journal d'un autre utilisateur, autre structure
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0d');
do $$
begin
  perform public.import_patients(current_setting('test.org')::uuid,
    '[{"line": 2, "last_name": "Kane", "first_name": "Ami", "sex": "F", "declared_age": 25}]',
    current_setting('test.import')::uuid);
  raise exception 'ÉCHEC : l''admin poursuit l''import de l''owner';
exception when invalid_parameter_value then
  raise notice 'OK : un import se poursuit seulement par son auteur';
end $$;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.patient_imports;
  if v_n <> 1 then
    raise exception 'ÉCHEC : l''admin ne voit pas le journal des imports (%)', v_n;
  end if;
  raise notice 'OK : l''admin lit le journal des imports';
end $$;

select pg_temp.en_tant_que('0b');
do $$
begin
  if exists (select 1 from public.patient_imports) then
    raise exception 'ÉCHEC : journal visible depuis une autre structure';
  end if;
  begin
    perform public.import_patients(current_setting('test.org')::uuid, '[]'::jsonb);
    raise exception 'ÉCHEC : import dans une autre structure';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : structures isolées';
end $$;

select pg_temp.en_tant_que('09');
do $$
begin
  if exists (select 1 from public.patient_imports) then
    raise exception 'ÉCHEC : l''accueil lit le journal des imports';
  end if;
  raise notice 'OK : journal fermé à l''accueil';
end $$;

reset role;

rollback;
