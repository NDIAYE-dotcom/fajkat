-- =============================================================================
-- Tests — étape 11e (Recopier une page de registre papier)
-- -----------------------------------------------------------------------------
-- Vérifie : une page de registre est ouverte aux rôles qui créent un patient (accueil,
-- caissier), pas au pharmacien ; un fichier reste réservé à owner et admin ; repère
-- « année, page » gardé dans le journal ; 60 lignes au plus ; accord WhatsApp jamais
-- recopié ; chacun lit ses propres pages, owner et admin lisent tout ; une page se
-- poursuit seulement par son auteur ; doublons d'une page ; patients audités.
--
-- Lancement (aucune trace : tout est annulé par le ROLLBACK final) :
--   psql "<chaîne de connexion fajkat-dev>" -v ON_ERROR_STOP=1 -f supabase/tests/etape11e.sql
-- Prérequis : migrations des étapes 3 à 11e appliquées.
-- =============================================================================

begin;

-- A owner du poste, R et S accueil, C caissier, P pharmacien.
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-a11e-0000000000' || c)::uuid, 'authenticated', 'authenticated',
       'e11e-' || c || '@fajkat.invalid', jsonb_build_object('full_name', 'Test ' || c), now(), now()
  from unnest(array['0a', '09', '08', '0c', '0f']) c;

create function pg_temp.en_tant_que(p_code text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a11e-0000000000' || p_code,
                      'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.en_tant_que('0a');
select set_config('test.org',
  public.create_organization('Poste de santé 11e', 'poste_sante', 'SN', 'Kolda')::text, true);

reset role;
insert into public.memberships (org_id, user_id, role, is_active)
select current_setting('test.org')::uuid, ('00000000-0000-4000-a11e-0000000000' || c)::uuid,
       r, true
  from (values ('09', 'accueil'), ('08', 'accueil'), ('0c', 'caissier'),
               ('0f', 'pharmacien')) v(c, r);

set local role authenticated;

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('0f');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  begin
    perform public.start_patient_import(v_org, null, 1, 0, 0, 'registre', 2019, 34);
    raise exception 'ÉCHEC : le pharmacien recopie une page de registre';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.find_import_duplicates(v_org, '[]'::jsonb, 'registre');
    raise exception 'ÉCHEC : le pharmacien cherche les doublons d''une page';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK : page de registre fermée au pharmacien';
end $$;

select pg_temp.en_tant_que('09');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
begin
  begin
    perform public.start_patient_import(v_org, 'liste.xlsx', 1);
    raise exception 'ÉCHEC : l''accueil importe un fichier';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.find_import_duplicates(v_org, '[]'::jsonb);
    raise exception 'ÉCHEC : l''accueil cherche les doublons d''un fichier';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_patient_import(v_org, null, 1, 0, 0, 'carnet');
    raise exception 'ÉCHEC : source inconnue acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.start_patient_import(v_org, null, 61, 0, 0, 'registre');
    raise exception 'ÉCHEC : page de plus de 60 lignes ouverte';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.start_patient_import(v_org, null, 1, 0, 0, 'registre', 2019, 0);
    raise exception 'ÉCHEC : page 0 acceptée';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK : fichier réservé à owner et admin, source et repère contrôlés';
end $$;

select pg_temp.en_tant_que('0a');
do $$
begin
  perform public.start_patient_import(current_setting('test.org')::uuid, 'liste.xlsx', 1,
                                      0, 0, 'fichier', 2019, 34);
  raise exception 'ÉCHEC : repère de registre sur un fichier';
exception when invalid_parameter_value then
  raise notice 'OK : repère de registre refusé pour un fichier';
end $$;

-- -----------------------------------------------------------------------------
-- Page recopiée par l'accueil
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('09');
do $$
declare
  v_org    uuid := current_setting('test.org')::uuid;
  v_import uuid;
  v_r      record;
  v_ok     integer := 0;
  v_err    integer := 0;
  v_j      public.patient_imports;
  v_lignes jsonb := '[]'::jsonb;
begin
  -- Doublons d'une page : ouverts à l'accueil.
  perform public.find_import_duplicates(v_org, '[{"line": 1, "last_name": "Diallo",
    "first_name": "Awa"}]'::jsonb, 'registre');

  v_import := public.start_patient_import(v_org, null, 3, 0, 0, 'registre', 2019, 34);
  perform set_config('test.page', v_import::text, true);

  for v_r in select * from public.import_patients(v_org, jsonb_build_array(
      jsonb_build_object('line', 1, 'legacy_file_number', '0412', 'last_name', 'Diallo',
        'first_name', 'Awa', 'sex', 'F', 'declared_age', 34, 'phone', '+221771234567',
        'neighborhood', 'Sikilo', 'mother_first_name', 'Penda',
        'whatsapp_consent', true, 'phone_owner', 'patient'),
      jsonb_build_object('line', 2, 'last_name', 'Ba', 'first_name', 'Moussa', 'sex', 'M',
        'birth_date', '2024-02-10', 'birth_date_estimated', true),
      jsonb_build_object('line', 3, 'last_name', 'Sow', 'first_name', '', 'sex', 'M',
        'declared_age', 30)), v_import)
  loop
    if v_r.error is null then v_ok := v_ok + 1; else v_err := v_err + 1; end if;
  end loop;
  if v_ok <> 2 or v_err <> 1 then
    raise exception 'ÉCHEC : rapport de la page inattendu : % / %', v_ok, v_err;
  end if;
  raise notice 'OK : l''accueil recopie une page, une ligne en erreur n''arrête pas les autres';

  if (select whatsapp_consent from public.patients where last_name = 'Diallo' and org_id = v_org)
       is not null then
    raise exception 'ÉCHEC : accord WhatsApp recopié d''un registre';
  end if;
  raise notice 'OK : accord WhatsApp jamais recopié d''un registre';

  select * into v_j from public.patient_imports where id = v_import;
  if v_j.source <> 'registre' or v_j.register_year <> 2019 or v_j.register_page <> 34
     or v_j.file_name is not null or v_j.imported_count <> 2 or v_j.rejected_count <> 1
     or v_j.created_by <> '00000000-0000-4000-a11e-000000000009'::uuid then
    raise exception 'ÉCHEC : journal de la page inexact';
  end if;
  raise notice 'OK : journal : registre 2019, page 34, auteur, 2 créés, 1 refusé';

  -- 61 lignes : refusé.
  for i in 1..61 loop
    v_lignes := v_lignes || jsonb_build_object('line', i, 'last_name', 'Ndiaye',
      'first_name', 'Test', 'sex', 'F', 'declared_age', 20);
  end loop;
  begin
    perform public.import_patients(v_org, v_lignes, v_import);
    raise exception 'ÉCHEC : 61 lignes envoyées pour une page';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.find_import_duplicates(v_org, v_lignes, 'registre');
    raise exception 'ÉCHEC : doublons de 61 lignes cherchés pour une page';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK : 60 lignes au plus par page';
end $$;

-- Le caissier recopie aussi (sans repère).
select pg_temp.en_tant_que('0c');
do $$
declare
  v_org uuid := current_setting('test.org')::uuid;
  v_import uuid;
begin
  v_import := public.start_patient_import(v_org, null, 1, 0, 0, 'registre');
  if (select count(*) from public.import_patients(v_org, '[{"line": 1, "last_name": "Kane",
        "first_name": "Ami", "sex": "F", "declared_age": 25}]', v_import) r
       where r.error is null) <> 1 then
    raise exception 'ÉCHEC : le caissier ne recopie pas une page';
  end if;
  raise notice 'OK : le caissier recopie une page sans repère';
end $$;

-- -----------------------------------------------------------------------------
-- Journal : chacun ses pages, owner et admin tout
-- -----------------------------------------------------------------------------
select pg_temp.en_tant_que('08');
do $$
begin
  if exists (select 1 from public.patient_imports) then
    raise exception 'ÉCHEC : un accueil voit les pages d''un autre';
  end if;
  perform public.import_patients(current_setting('test.org')::uuid,
    '[{"line": 1, "last_name": "Kane", "first_name": "Ami", "sex": "F", "declared_age": 25}]',
    current_setting('test.page')::uuid);
  raise exception 'ÉCHEC : un accueil poursuit la page d''un autre';
exception when invalid_parameter_value then
  raise notice 'OK : une page se lit et se poursuit seulement par son auteur';
end $$;

select pg_temp.en_tant_que('09');
do $$
begin
  if (select count(*) from public.patient_imports) <> 1 then
    raise exception 'ÉCHEC : l''accueil ne voit pas sa propre page';
  end if;
  update public.patient_imports set register_page = 99
   where id = current_setting('test.page')::uuid;
  raise exception 'ÉCHEC : journal modifié directement';
exception when insufficient_privilege then
  raise notice 'OK : l''accueil lit sa page, sans pouvoir la modifier';
end $$;

select pg_temp.en_tant_que('0a');
do $$
begin
  if (select count(*) from public.patient_imports where source = 'registre') <> 2 then
    raise exception 'ÉCHEC : l''owner ne voit pas toutes les pages recopiées';
  end if;
  raise notice 'OK : l''owner lit toutes les pages recopiées';

  if (select count(*) from public.audit_logs a
        join public.patients p on p.id::text = a.record_id
       where a.table_name = 'patients' and a.action = 'INSERT'
         and p.import_id = current_setting('test.page')::uuid
         and a.user_id = '00000000-0000-4000-a11e-000000000009'::uuid) <> 2 then
    raise exception 'ÉCHEC : dossiers recopiés non audités au nom de leur auteur';
  end if;
  raise notice 'OK : chaque dossier recopié est audité au nom de l''accueil';
end $$;

reset role;

rollback;
