// Pays de l'espace UEMOA : indicatif, découpage du numéro national, fuseau horaire.
// Provisoire : ces données migreront dans une table paramétrable (pays configurables).

export const PAYS_UEMOA = [
  { code: 'SN', nom: 'Sénégal', indicatif: '221', groupes: [2, 3, 2, 2], fuseau: 'Africa/Dakar' },
  { code: 'ML', nom: 'Mali', indicatif: '223', groupes: [2, 2, 2, 2], fuseau: 'Africa/Bamako' },
  {
    code: 'CI',
    nom: "Côte d'Ivoire",
    indicatif: '225',
    groupes: [2, 2, 2, 2, 2],
    fuseau: 'Africa/Abidjan',
  },
  {
    code: 'BF',
    nom: 'Burkina Faso',
    indicatif: '226',
    groupes: [2, 2, 2, 2],
    fuseau: 'Africa/Ouagadougou',
  },
  { code: 'NE', nom: 'Niger', indicatif: '227', groupes: [2, 2, 2, 2], fuseau: 'Africa/Niamey' },
  { code: 'TG', nom: 'Togo', indicatif: '228', groupes: [2, 2, 2, 2], fuseau: 'Africa/Lome' },
  {
    code: 'BJ',
    nom: 'Bénin',
    indicatif: '229',
    groupes: [2, 2, 2, 2, 2],
    fuseau: 'Africa/Porto-Novo',
  },
  {
    code: 'GW',
    nom: 'Guinée-Bissau',
    indicatif: '245',
    groupes: [3, 3, 3],
    fuseau: 'Africa/Bissau',
  },
]

export const PAYS_PAR_DEFAUT = 'SN'

export function paysParCode(code) {
  return PAYS_UEMOA.find((p) => p.code === code)
}

export function paysParIndicatif(indicatif) {
  return PAYS_UEMOA.find((p) => p.indicatif === indicatif)
}

export function longueurNationale(pays) {
  return pays.groupes.reduce((a, b) => a + b, 0)
}

// Découpe des chiffres nationaux selon les groupes du pays, même incomplets :
// « 7712 » -> « 77 12 ». Les chiffres en trop restent collés au dernier bloc.
export function grouperChiffres(chiffres, groupes) {
  const blocs = []
  let position = 0
  for (const taille of groupes) {
    if (position >= chiffres.length) break
    blocs.push(chiffres.slice(position, position + taille))
    position += taille
  }
  if (position < chiffres.length) blocs[blocs.length - 1] += chiffres.slice(position)
  return blocs.join(' ')
}

// « +221771234567 » -> { pays, national: '771234567' } ; null si l'indicatif est inconnu.
export function decouperE164(e164) {
  const match = String(e164 || '').match(/^\+(\d{3})(\d*)$/)
  if (!match) return null
  const pays = paysParIndicatif(match[1])
  return pays ? { pays, national: match[2] } : null
}

export function estTelephoneValide(e164) {
  const parties = decouperE164(e164)
  return Boolean(parties) && parties.national.length === longueurNationale(parties.pays)
}
