// Colonnes du fichier d'import (modèle à télécharger et fichiers des structures).
// Les en-têtes sont reconnus sans accents, sans casse, sans ce qui est entre parenthèses :
// « Prénom », « PRENOM », « prénom (s) » désignent la même colonne. Les synonymes couvrent
// les intitulés fréquents des registres tenus sous Excel.

export const COLONNES = [
  {
    cle: 'ancienNumero',
    titre: 'Ancien n° de dossier',
    exemple: '1247',
    consigne: 'Numéro de l’ancien registre ou du carnet de santé. Facultatif, cherchable ensuite.',
    synonymes: [
      'ancien numero',
      'numero dossier',
      'n dossier',
      'no dossier',
      'num dossier',
      'numero registre',
      'n registre',
      'ancien numero de dossier',
      'n',
      'no',
      'numero',
    ],
    texte: true,
  },
  {
    cle: 'nom',
    titre: 'Nom',
    exemple: 'Diallo',
    requis: true,
    consigne: 'Nom de famille. Obligatoire.',
    synonymes: ['nom de famille', 'nom du patient', 'nom patient'],
  },
  {
    cle: 'prenom',
    titre: 'Prénom',
    exemple: 'Awa',
    requis: true,
    consigne: 'Obligatoire.',
    synonymes: ['prenoms', 'prenom du patient', 'prenom patient'],
  },
  {
    cle: 'sexe',
    titre: 'Sexe (F/M)',
    exemple: 'F',
    consigne: 'F ou M (Femme, Homme acceptés). Obligatoire.',
    synonymes: ['genre'],
  },
  {
    cle: 'naissance',
    titre: 'Date de naissance (JJ/MM/AAAA)',
    exemple: '12/03/1994',
    consigne: 'JJ/MM/AAAA ou AAAA-MM-JJ. Si elle est inconnue, laissez vide et remplissez l’âge.',
    synonymes: ['ne le', 'nee le', 'ne e le', 'naissance', 'ddn', 'date naissance'],
    texte: true,
  },
  {
    cle: 'age',
    titre: 'Âge déclaré',
    exemple: '',
    consigne:
      'Seulement si la date de naissance est inconnue. En ans, ou en mois avant 5 ans ' +
      '(« 8 mois ») : une date de naissance estimée est alors enregistrée.',
    synonymes: ['age', 'age declare'],
  },
  {
    cle: 'uniteAge',
    titre: 'Unité de l’âge (ans/mois)',
    exemple: '',
    consigne: 'ans ou mois. Vide : ans.',
    synonymes: ['unite', 'unite de l age', 'unite age'],
  },
  {
    cle: 'telephone',
    titre: 'Téléphone',
    exemple: '77 123 45 67',
    consigne: 'Un seul numéro. Sans indicatif, celui du pays de la structure est ajouté.',
    synonymes: ['tel', 'telephone', 'portable', 'contact', 'numero de telephone', 'numero tel'],
    texte: true,
  },
  {
    cle: 'titulaire',
    titre: 'Le téléphone appartient à',
    exemple: 'patient',
    consigne: 'patient, mère, père, conjoint ou autre. Vide : non renseigné.',
    synonymes: ['titulaire', 'titulaire du telephone', 'proprietaire du telephone'],
  },
  {
    cle: 'consentement',
    titre: 'Accord WhatsApp (oui/non)',
    exemple: '',
    consigne:
      'oui seulement si la personne a donné son accord pour les rappels. Vide : non renseigné ' +
      '(jamais « oui » par défaut).',
    synonymes: ['whatsapp', 'accord whatsapp', 'consentement', 'consentement whatsapp'],
  },
  {
    cle: 'quartier',
    titre: 'Quartier ou village',
    exemple: 'Sikilo',
    consigne: 'Facultatif.',
    synonymes: ['quartier', 'village', 'adresse', 'localite'],
  },
  { cle: 'commune', titre: 'Commune', exemple: 'Kolda', consigne: 'Facultatif.' },
  { cle: 'profession', titre: 'Profession', exemple: '', consigne: 'Facultatif.' },
  {
    cle: 'mere',
    titre: 'Prénom de la mère',
    exemple: 'Mariama',
    consigne: 'Facultatif : aide à distinguer les homonymes.',
    synonymes: ['mere', 'prenom mere', 'prenom de mere'],
  },
  {
    cle: 'nomMere',
    titre: 'Nom de la mère',
    exemple: '',
    consigne: 'Facultatif.',
    synonymes: ['nom mere', 'nom de famille de la mere'],
  },
  {
    cle: 'urgenceNom',
    titre: 'Personne à prévenir',
    exemple: '',
    consigne: 'Facultatif.',
    synonymes: ['personne a contacter', 'contact urgence'],
  },
  {
    cle: 'urgenceTel',
    titre: 'Téléphone de la personne à prévenir',
    exemple: '',
    consigne: 'Facultatif.',
    synonymes: ['telephone urgence', 'tel urgence'],
    texte: true,
  },
  {
    cle: 'urgenceLien',
    titre: 'Lien avec le patient',
    exemple: '',
    consigne: 'Mère, époux, frère… Facultatif.',
    synonymes: ['lien', 'lien de parente'],
  },
]

// « Date de naissance (JJ/MM/AAAA) » -> « date de naissance » ; « N° » -> « n ».
export function normaliserEntete(texte) {
  return String(texte ?? '')
    .replace(/\(.*?\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PAR_ENTETE = new Map()
for (const colonne of COLONNES) {
  for (const nom of [colonne.titre, ...(colonne.synonymes ?? [])]) {
    const cle = normaliserEntete(nom)
    if (!PAR_ENTETE.has(cle)) PAR_ENTETE.set(cle, colonne.cle)
  }
}

export function colonneDeLEntete(entete) {
  return PAR_ENTETE.get(normaliserEntete(entete)) ?? null
}

export const TITRE_DE = Object.fromEntries(COLONNES.map((c) => [c.cle, c.titre]))
