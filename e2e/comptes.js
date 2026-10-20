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
