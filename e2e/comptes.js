// Comptes de test locaux (base e2e uniquement, jamais fajkat-dev ni la production).
// Le mot de passe n'est pas vérifié : la connexion est simulée par e2e/serveur-local.js.
export const MOT_DE_PASSE = 'test-local'

export const COMPTES = {
  ownerPoste: {
    id: '00000000-0000-4000-e2e0-000000000001',
    email: 'owner.poste@fajkat.test',
    nom: 'Mariama Diallo',
  },
  infirmier: {
    id: '00000000-0000-4000-e2e0-000000000002',
    email: 'infirmier.poste@fajkat.test',
    nom: 'Awa Faye',
    role: 'infirmier',
  },
  accueil: {
    id: '00000000-0000-4000-e2e0-000000000003',
    email: 'accueil.poste@fajkat.test',
    nom: 'Fatou Samb',
    role: 'accueil',
  },
  caissier: {
    id: '00000000-0000-4000-e2e0-000000000004',
    email: 'caissier.poste@fajkat.test',
    nom: 'Moussa Ba',
    role: 'caissier',
  },
  comptable: {
    id: '00000000-0000-4000-e2e0-000000000005',
    email: 'comptable.poste@fajkat.test',
    nom: 'Ibrahima Sy',
    role: 'comptable',
  },
  ownerClinique: {
    id: '00000000-0000-4000-e2e0-000000000006',
    email: 'owner.clinique@fajkat.test',
    nom: 'Ousmane Ndiaye',
  },
  medecin: {
    id: '00000000-0000-4000-e2e0-000000000007',
    email: 'medecin.clinique@fajkat.test',
    nom: 'Dr Aminata Sarr',
    role: 'medecin',
  },
  sageFemme: {
    id: '00000000-0000-4000-e2e0-000000000008',
    email: 'sage-femme.poste@fajkat.test',
    nom: 'Khady Ndiaye',
    role: 'sage_femme',
  },
  aideSoignant: {
    id: '00000000-0000-4000-e2e0-000000000009',
    email: 'aide-soignant.poste@fajkat.test',
    nom: 'Pape Gueye',
    role: 'aide_soignant',
  },
  pharmacien: {
    id: '00000000-0000-4000-e2e0-00000000000a',
    email: 'pharmacien.poste@fajkat.test',
    nom: 'Cheikh Mbaye',
    role: 'pharmacien',
  },
}

// Clé de signature des jetons de test : locale, sans valeur ailleurs.
export const SECRET_JWT = 'fajkat-e2e-cle-locale-sans-valeur-0123456789'

export const PORTS = { api: 54321, postgrest: 54330, app: 5179 }

// Workers en parallèle (E2E_WORKERS, 4 par défaut ; 1 pour déboguer un seul fichier).
// Le worker n a sa base fajkat_e2e_n (clone de fajkat_e2e_modele), son PostgREST sur le
// port 54330 + n, et ouvre l'application à http://wn.localhost:5179 : le serveur local
// reconnaît le worker à l'origine des requêtes (Chrome envoie *.localhost vers la machine).
export const WORKERS = Number(process.env.E2E_WORKERS ?? 4)
if (!Number.isInteger(WORKERS) || WORKERS < 1 || WORKERS > 8) {
  throw new Error('E2E_WORKERS : un nombre entier de 1 à 8.')
}
export const BASE_MODELE = 'fajkat_e2e_modele'
export const baseWorker = (n) => `fajkat_e2e_${n}`
export const origineWorker = (n) => `http://w${n}.localhost:${PORTS.app}`
