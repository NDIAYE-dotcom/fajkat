import { ExternalLink } from 'lucide-react'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import { formatTelephone } from '../../../../lib/format.js'
import { RAISONS_IMPORT } from '../../import/traitement.js'
import { libelleAge, libelleNaissance, nomComplet } from '../../utils.js'

// Colonnes des trois onglets de l'aperçu (lignes valides, en erreur, doublons probables).
// source : 'fichier' (import d'une liste) ou 'registre' (page recopiée).

const ORIGINE = {
  fichier: { titre: 'Dans le fichier', de: 'du fichier' },
  registre: { titre: 'Dans la page', de: 'de la page' },
}

const chiffres = (v) => <span className="import-apercu__chiffres">{v}</span>

const colonneLigne = {
  cle: 'numero',
  titre: 'Ligne',
  type: 'nombre',
  rendu: (l) => chiffres(l.numero),
}

// Patient tel qu'il sera enregistré : nom, sexe, âge ou naissance, téléphone.
function patientLu(l) {
  const p = { ...l.patient, birth_year: l.anneeNaissance }
  return (
    <span className="import-apercu__patient">
      <strong>{nomComplet(p)}</strong>
      <span className="import-apercu__doux">
        {[p.sex, libelleAge(p), libelleNaissance(p)].filter(Boolean).join(' · ')}
      </span>
      {p.phone && <span className="import-apercu__doux">{chiffres(formatTelephone(p.phone))}</span>}
    </span>
  )
}

export const COLONNES_VALIDES = [
  colonneLigne,
  { cle: 'patient', titre: 'Patient', principale: true, rendu: patientLu },
  {
    cle: 'quartier',
    titre: 'Quartier',
    rendu: (l) => l.patient.neighborhood || '—',
  },
  {
    cle: 'ancien',
    titre: 'Ancien n°',
    rendu: (l) => (l.patient.legacy_file_number ? chiffres(l.patient.legacy_file_number) : '—'),
  },
]

export const colonnesErreurs = (source) => [
  colonneLigne,
  {
    cle: 'nom',
    titre: ORIGINE[source].titre,
    principale: true,
    rendu: (l) =>
      [l.valeurs.nom, l.valeurs.prenom].filter(Boolean).join(' ') || (
        <span className="import-apercu__doux">Nom et prénom absents</span>
      ),
  },
  {
    cle: 'raison',
    titre: 'Raison',
    rendu: (l) => (
      <ul className="import-apercu__raisons">
        {l.erreurs.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    ),
  },
]

function dossiersProches(l, source) {
  if (l.ligneJumelle) {
    return (
      <span>
        Même patient que la ligne {chiffres(l.ligneJumelle)} {ORIGINE[source].de}
      </span>
    )
  }
  return (
    <ul className="import-apercu__candidats">
      {l.candidats.map((c) => (
        <li key={c.id}>
          <a
            href={`/app/patients/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="import-apercu__lien"
          >
            {chiffres(c.file_number)} {nomComplet(c)}
            <Icone icone={ExternalLink} label="s’ouvre dans un nouvel onglet" />
          </a>
          <span className="import-apercu__doux">
            {[
              RAISONS_IMPORT[c.reason],
              libelleAge(c),
              c.legacy_file_number && `ancien n° ${c.legacy_file_number}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function colonnesDoublons(onDecider, source) {
  return [
    colonneLigne,
    { cle: 'patient', titre: ORIGINE[source].titre, principale: true, rendu: patientLu },
    {
      cle: 'proches',
      titre: 'Dossier déjà au registre',
      rendu: (l) => dossiersProches(l, source),
    },
    {
      cle: 'decision',
      titre: 'Décision',
      rendu: (l) => (
        <fieldset className="import-apercu__decision">
          <legend className="sr-only">Ligne {l.numero}</legend>
          <Radio
            name={`decision-${l.numero}`}
            label="Ignorer"
            checked={!l.importer}
            onChange={() => onDecider(l.numero, false)}
          />
          <Radio
            name={`decision-${l.numero}`}
            label={source === 'registre' ? 'Enregistrer quand même' : 'Importer quand même'}
            checked={l.importer}
            onChange={() => onDecider(l.numero, true)}
          />
        </fieldset>
      ),
    },
  ]
}
