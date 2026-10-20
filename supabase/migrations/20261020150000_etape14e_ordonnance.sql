-- =============================================================================
-- Étape 14, partie D : ordonnance
-- -----------------------------------------------------------------------------
-- Les tables de l'ordonnance (prescriptions, prescription_items), sa recopie à la
-- validation et ses verrous existent depuis la partie A. Cette migration ajoute :
-- 1. Formes des médicaments (drug_forms, référentiel commun, comme drug_routes ; gestion
--    par le super-admin à l'étape 31) : libellé,
--    unité d'une prise (« comprimé », « cuillère-mesure ») et drapeau counted. Pour une
--    forme comptée à l'unité, l'écran calcule la quantité totale (prises × jours) ; pour
--    les autres (sirop, pommade, gouttes), la quantité se saisit en conditionnements
--    (pack_unit : flacon, tube). Rien n'est codé dans l'application.
-- 2. prescription_name_suggestions : noms déjà prescrits dans la structure, avec le dosage,
--    la forme et la voie de la dernière ligne, pour la saisie rapide. Réservée aux
--    soignants qui rédigent (encounters_can_write) : l'accueil, le caissier, le comptable,
--    l'aide-soignant et l'owner qui n'exerce pas n'y ont pas accès. Le catalogue de la
--    pharmacie et le stock s'y ajouteront à l'étape 17 (product_id, quantité en stock).
-- =============================================================================


-- =============================================================================
-- 1. Formes des médicaments
-- =============================================================================

create table public.drug_forms (
  code              text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  label             text not null check (char_length(btrim(label)) between 2 and 60),
  dose_unit         text not null check (char_length(btrim(dose_unit)) between 1 and 30),
  dose_unit_plural  text not null check (char_length(btrim(dose_unit_plural)) between 1 and 30),
  counted           boolean not null default false,
  pack_unit         text check (char_length(btrim(pack_unit)) between 1 and 30),
  pack_unit_plural  text check (char_length(btrim(pack_unit_plural)) between 1 and 30),
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (counted or (pack_unit is not null and pack_unit_plural is not null))
);

comment on table public.drug_forms is
  'Formes des médicaments (référentiel commun). counted : quantité totale calculée en unités de prise.';

insert into public.drug_forms
  (code, label, dose_unit, dose_unit_plural, counted, pack_unit, pack_unit_plural, sort_order) values
  ('comprime',     'Comprimé',          'comprimé',        'comprimés',        true,  null,          null,           10),
  ('gelule',       'Gélule',            'gélule',          'gélules',          true,  null,          null,           20),
  ('sachet',       'Sachet',            'sachet',          'sachets',          true,  null,          null,           30),
  ('sirop',        'Sirop',             'cuillère-mesure', 'cuillères-mesure', false, 'flacon',      'flacons',      40),
  ('suspension',   'Suspension buvable','cuillère-mesure', 'cuillères-mesure', false, 'flacon',      'flacons',      50),
  ('gouttes',      'Gouttes',           'goutte',          'gouttes',          false, 'flacon',      'flacons',      60),
  ('pommade',      'Pommade ou crème',  'application',     'applications',     false, 'tube',        'tubes',        70),
  ('ovule',        'Ovule',             'ovule',           'ovules',           true,  null,          null,           80),
  ('suppositoire', 'Suppositoire',      'suppositoire',    'suppositoires',    true,  null,          null,           90),
  ('inhalateur',   'Inhalateur',        'bouffée',         'bouffées',         false, 'inhalateur',  'inhalateurs', 100),
  ('ampoule',      'Ampoule injectable','ampoule',         'ampoules',         true,  null,          null,          110),
  ('collyre',      'Collyre',           'goutte',          'gouttes',          false, 'flacon',      'flacons',      65),
  ('spray',        'Spray',             'pulvérisation',   'pulvérisations',   false, 'flacon',      'flacons',      75),
  ('solution_inj', 'Solution injectable','injection',      'injections',       false, 'flacon',      'flacons',     115),
  ('patch',        'Patch',             'patch',           'patchs',           true,  null,          null,          120),
  ('implant',      'Implant',           'implant',         'implants',         false, 'implant',     'implants',    130),
  -- Forme absente de la liste : aucune prescription bloquée, quantité saisie à la main.
  ('autre',        'Autre',             'unité',           'unités',           false, 'unité',       'unités',      999);

create trigger drug_forms_set_updated_at before update on public.drug_forms
  for each row execute function public.set_updated_at();

alter table public.drug_forms enable row level security;
create policy drug_forms_select on public.drug_forms
  for select to authenticated using (true);
revoke all on public.drug_forms from public, anon, authenticated;
grant select on public.drug_forms to authenticated;


-- =============================================================================
-- 2. Suggestions de noms
-- =============================================================================

create index prescription_items_org_idx on public.prescription_items (org_id, created_at desc);

-- Noms déjà prescrits dans la structure : un résultat par nom et dosage (« Paracétamol
-- 500 mg » et « Paracétamol 1 g » sont deux suggestions), avec la forme et la voie de la
-- ligne la plus récente. Recherche sans accents ni majuscules, n'importe où dans le nom ;
-- les noms qui commencent par la saisie d'abord, puis les plus prescrits. Seulement les
-- lignes des 24 derniers mois : la saisie reste rapide après des années d'ordonnances
-- (index org_id, created_at) ; le catalogue de l'étape 17 prendra le relais.
-- product_id et stock : réservés au catalogue de la pharmacie (étape 17), toujours nuls.
create function public.prescription_name_suggestions(p_org_id uuid, p_query text,
                                                     p_limit integer default 8)
returns table (product_name text, dosage text, form text, route_code text, uses bigint,
               product_id uuid, stock integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := public.patient_normalize(p_query);
  v_limite integer := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if not public.encounters_can_write(p_org_id) then
    raise exception 'L''ordonnance est réservée aux soignants.' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then
    return;
  end if;
  return query
    with lignes as (
      select i.product_name, i.dosage, i.form, i.route_code, i.created_at,
             public.patient_normalize(i.product_name) as cle,
             public.patient_normalize(coalesce(i.dosage, '')) as cle_dosage
        from public.prescription_items i
       where i.org_id = p_org_id and i.deleted_at is null
         and i.created_at >= now() - interval '24 months'
         and strpos(public.patient_normalize(i.product_name), v_q) > 0
    ),
    groupes as (
      select distinct on (l.cle, l.cle_dosage)
             l.product_name, l.dosage, l.form, l.route_code, l.cle,
             count(*) over (partition by l.cle, l.cle_dosage) as n
        from lignes l
       order by l.cle, l.cle_dosage, l.created_at desc
    )
    select g.product_name, g.dosage, g.form, g.route_code, g.n, null::uuid, null::integer
      from groupes g
     order by (left(g.cle, char_length(v_q)) = v_q) desc, g.n desc, g.cle
     limit v_limite;
end;
$$;

revoke execute on function public.prescription_name_suggestions(uuid, text, integer)
  from public, anon;
grant execute on function public.prescription_name_suggestions(uuid, text, integer)
  to authenticated;
