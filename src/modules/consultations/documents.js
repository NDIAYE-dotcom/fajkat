import dayjs from 'dayjs'
import { formatDate, formatHeure, getFuseauHoraire } from '../../lib/format.js'
import { resumeMesure } from '../accueil/constantes.js'
import { libelleAge, libelleNaissance, nomComplet } from '../patients/utils.js'
import { ligneVide, phraseDuree, resumePosologie } from './ordonnance.js'
import { resumeExamen } from './utils.js'

// Documents de la consultation (partie E), sans affichage : lettre de référence,
// certificat, prochain rendez-vous sur l'ordonnance.

export const LIMITES_REFERENCE = { motif: 1000, resume: 4000, traitements: 2000 }
export const LIMITES_CONTRE = {
  structure: 120,
  diagnostic: 500,
  traitement: 1500,
  conduite: 1500,
  suivi: 400,
}
export const CERTIFICAT_MAX = 4000
// Marque d'un passage à compléter dans un modèle (« la pratique de : …… »).
export const A_COMPLETER = '……'

// --- Contenu de la consultation ----------------------------------------------------------

// Contenu commun au brouillon (saisie en cours) et à la consultation validée.
//   brouillon : contenu de la saisie (useSauvegardeConsultation), ou null si validée ;
//   examens : types d'examens rapides (libellé et résultat d'un examen du brouillon).
export function contenuConsultation(consultation, brouillon, examens = []) {
  const c = brouillon ?? consultation
  const tests = brouillon
    ? brouillon.tests.map((t) => {
        const type = examens.find((e) => e.id === t.rapid_test_type_id)
        if (!type) return null
        const nombre = Number(String(t.value ?? '').replace(',', '.'))
        return {
          label: type.label,
          result_kind: type.result_kind,
          unit: type.unit,
          result: t.result,
          value_number: type.result_kind === 'number' && t.value !== '' ? nombre : null,
          value_text: type.result_kind === 'text' ? t.value : null,
        }
      })
    : consultation.tests
  const ordonnances = brouillon ? [brouillon.prescription] : (consultation.prescriptions ?? [])
  return {
    reason: c.reason ?? '',
    history: c.history ?? '',
    examination: c.examination ?? '',
    plan: c.plan ?? '',
    diagnoses: c.diagnoses ?? [],
    tests: (tests ?? []).filter(Boolean),
    vitals: consultation.vitals ?? [],
    medicaments: ordonnances.flatMap((o) => o?.items ?? []).filter((l) => !ligneVide(l)),
  }
}

// Résumé clinique pré-rempli de la lettre de référence, modifiable avant l'émission.
export function resumeReference(contenu) {
  const blocs = []
  if (contenu.reason.trim()) blocs.push(`Motif de consultation : ${contenu.reason.trim()}`)
  if (contenu.history.trim()) blocs.push(`Histoire de la maladie : ${contenu.history.trim()}`)
  if (contenu.vitals.length) {
    blocs.push(
      `Constantes : ${contenu.vitals.map((m) => `${formatHeure(m.measured_at)} ${resumeMesure(m)}`).join(' ; ')}`,
    )
  }
  if (contenu.examination.trim()) blocs.push(`Examen clinique : ${contenu.examination.trim()}`)
  const tests = contenu.tests
    .map((t) => {
      const r = resumeExamen(t)
      return r ? `${t.label} : ${r}` : null
    })
    .filter(Boolean)
  if (tests.length) blocs.push(`Examens rapides : ${tests.join(' ; ')}`)
  if (contenu.diagnoses.length) {
    const liste = contenu.diagnoses
      .map(
        (d) =>
          `${d.code ? `${d.code} ` : ''}${d.label}${d.rank === 'primary' ? ' (principal)' : ''}`,
      )
      .join(' ; ')
    blocs.push(`Diagnostic : ${liste}`)
  }
  if (contenu.plan.trim()) blocs.push(`Conduite tenue : ${contenu.plan.trim()}`)
  return blocs.join('\n\n')
}

// Traitements reçus : une ligne par médicament de l'ordonnance.
// « Paracétamol 500 mg — 1 – 1 – 1 – 0, pendant 3 jours »
export function traitementsRecus(medicaments) {
  return medicaments
    .map((l) => {
      const nom = `${l.product_name}${l.dosage ? ` ${l.dosage}` : ''}`
      const details = [resumePosologie(l), phraseDuree(l).replace(/\.$/, '').toLowerCase()]
        .filter(Boolean)
        .join(', ')
      return details ? `${nom} — ${details}` : nom
    })
    .join('\n')
}

// --- Certificat --------------------------------------------------------------------------

export const VARIABLES_CERTIFICAT = [
  { cle: 'patient', libelle: 'nom du patient' },
  { cle: 'naissance', libelle: '« née le 12/03/1994 » ou « né vers 1996 »' },
  { cle: 'age', libelle: 'âge' },
  { cle: 'structure', libelle: 'nom de la structure' },
  { cle: 'praticien', libelle: 'votre nom' },
  { cle: 'date', libelle: 'date du jour' },
  { cle: 'jours', libelle: 'nombre de jours de repos' },
  { cle: 'debut', libelle: 'premier jour du repos' },
  { cle: 'fin', libelle: 'dernier jour du repos' },
]

// Dernier jour du repos (AAAA-MM-JJ) : début + jours - 1, comme la base.
export function finRepos(debut, jours) {
  if (!debut || !jours) return null
  return dayjs(debut)
    .add(jours - 1, 'day')
    .format('YYYY-MM-DD')
}

// Valeurs des variables. Aucune variable de diagnostic n'existe : la base refuse un modèle
// qui en contiendrait, et rien du contenu médical n'est passé ici.
export function variablesCertificat({ patient, structure, praticien, jours, debut }) {
  const dateIso = (iso) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '')
  return {
    patient: patient ? nomComplet(patient) : '',
    naissance: patient ? libelleNaissance(patient) : '',
    date_naissance: patient?.birth_date ? formatDate(patient.birth_date) : '',
    age: patient ? libelleAge(patient) : '',
    structure: structure ?? '',
    praticien: praticien ?? '',
    date: dayjs().tz(getFuseauHoraire()).format('DD/MM/YYYY'),
    jours: jours ? String(jours) : '',
    debut: dateIso(debut),
    fin: dateIso(finRepos(debut, jours)),
  }
}

// Modèle complété : une variable sans valeur (date de naissance inconnue…) devient « …… »,
// à compléter avant l'émission ; une variable inconnue reste telle quelle (signalée).
export function remplirModele(corps, variables) {
  return corps.replace(/\{([^{}]*)\}/g, (tout, cle) => {
    if (!(cle in variables)) return tout
    return variables[cle] || A_COMPLETER
  })
}

// Erreur sous le texte du certificat, ou null.
export function erreurTexteCertificat(texte) {
  const t = texte.trim()
  if (t.length < 10) return 'Écrivez le texte du certificat.'
  if (t.length > CERTIFICAT_MAX) return `${CERTIFICAT_MAX} caractères au plus.`
  if (t.includes(A_COMPLETER) || t.includes('......')) {
    return 'Remplacez les « …… » par le texte voulu avant d’émettre le certificat.'
  }
  const inconnue = t.match(/\{[^{}]*\}/)
  if (inconnue) return `Remplacez ${inconnue[0]} par le texte voulu.`
  return null
}

// --- Prochain rendez-vous ----------------------------------------------------------------

// « mardi 27/10/2026 à 10:00 ».
export function libelleProchainRdv(debut) {
  const d = dayjs(debut).tz(getFuseauHoraire())
  return `${d.format('dddd')} ${d.format('DD/MM/YYYY')} à ${d.format('HH:mm')}`
}

// Rendez-vous imprimé sur l'ordonnance : le premier encore prévu, à venir. Ni type, ni
// praticien.
export function prochainRdvImprimable(suivis, maintenant = new Date()) {
  const prochain = (suivis ?? [])
    .filter((s) => ['scheduled', 'confirmed'].includes(s.status))
    .filter((s) => new Date(s.starts_at) > maintenant)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]
  return prochain ? `Prochain rendez-vous : ${libelleProchainRdv(prochain.starts_at)}` : null
}

// --- Références --------------------------------------------------------------------------

export const TYPES_ETABLISSEMENT = [
  { valeur: 'centre_sante', libelle: 'Centre de santé' },
  { valeur: 'hopital', libelle: 'Hôpital' },
  { valeur: 'clinique', libelle: 'Clinique' },
  { valeur: 'autre', libelle: 'Autre' },
]

// « En retard · 18 jours », « 3 jours ».
export function attenteReference(r) {
  const jours = `${r.days_waiting} jour${r.days_waiting > 1 ? 's' : ''}`
  return r.days_waiting <= 0 ? 'Aujourd’hui' : jours
}
