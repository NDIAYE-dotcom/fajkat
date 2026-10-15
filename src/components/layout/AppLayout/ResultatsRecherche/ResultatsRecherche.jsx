import { ArrowRight, UserPlus } from 'lucide-react'
import LignePatient from '../../../../modules/patients/components/LignePatient/LignePatient.jsx'
import { LONGUEUR_MIN_RECHERCHE } from '../../../../modules/patients/hooks/useRecherchePatients.js'
import Icone from '../../../ui/Icone/Icone.jsx'
import './ResultatsRecherche.css'

function etat({ recherche, assez, requete }) {
  if (!assez) return `Tapez au moins ${LONGUEUR_MIN_RECHERCHE} lettres ou chiffres.`
  if (recherche.erreur) return recherche.erreur.message
  if (recherche.chargement) return 'Recherche en cours…'
  if (recherche.total === 0) return `Aucun patient pour « ${requete} ».`
  return `${recherche.total} patient${recherche.total > 1 ? 's' : ''} trouvé${recherche.total > 1 ? 's' : ''}`
}

// Liste déroulante de la recherche de l'en-tête (role="listbox"). Le focus reste dans
// le champ : les options se choisissent aux flèches + Entrée, ou au doigt.
export default function ResultatsRecherche({
  id,
  visible,
  options,
  actif,
  idOption,
  recherche,
  assez,
  requete,
  onChoisir,
  onSurvol,
}) {
  const message = etat({ recherche, assez, requete })

  return (
    <div className="resultats-recherche" hidden={!visible}>
      <p className="resultats-recherche__etat" role="status">
        {visible ? message : ''}
      </p>
      <ul
        id={id}
        role="listbox"
        aria-label="Patients trouvés"
        className="resultats-recherche__liste"
      >
        {options.map((option, i) => {
          const classes = [
            'resultats-recherche__option',
            option.type !== 'patient' && 'resultats-recherche__option--action',
            i === actif && 'resultats-recherche__option--active',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li
              key={option.type === 'patient' ? option.patient.id : option.type}
              id={idOption(i)}
              role="option"
              aria-selected={i === actif}
              className={classes}
              // mousedown : le champ garde le focus, la liste ne se ferme pas avant le clic.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onSurvol(i)}
              onClick={() => onChoisir(option)}
            >
              {option.type === 'patient' && <LignePatient patient={option.patient} />}
              {option.type === 'tous' && (
                <>
                  <span>
                    Voir tous les résultats
                    {recherche.total > options.length ? ` (${recherche.total})` : ''}
                  </span>
                  <Icone icone={ArrowRight} />
                </>
              )}
              {option.type === 'nouveau' && (
                <>
                  <Icone icone={UserPlus} />
                  <span>Nouveau patient</span>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
