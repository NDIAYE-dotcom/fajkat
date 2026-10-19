import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import LignePatient from '../../../patients/components/LignePatient/LignePatient.jsx'
import {
  LONGUEUR_MIN_RECHERCHE,
  requeteSuffisante,
  useRecherchePatients,
} from '../../../patients/hooks/useRecherchePatients.js'
import './ChoixPatient.css'

const NB_RESULTATS = 6

// Recherche du patient qui arrive : nom et prénom dans le désordre, téléphone, quartier,
// prénom de la mère, numéro de dossier (même recherche que le registre). Chaque résultat
// montre ce qui distingue les homonymes. « Nouveau patient » si personne ne correspond.
export default function ChoixPatient({ orgId, peutCreer, erreur, onChoisir, onNouveau }) {
  const [saisie, setSaisie] = useState('')
  const recherche = useRecherchePatients(orgId, saisie, { parPage: NB_RESULTATS, vide: 'rien' })
  const assez = requeteSuffisante(saisie)

  return (
    <div className="choix-patient">
      <SearchBar
        valeur={saisie}
        onChange={setSaisie}
        libelle="Patient"
        placeholder="Nom, prénom, téléphone, quartier ou n° de dossier"
        chargement={recherche.enCours}
        dansFormulaire
      />
      {erreur && (
        <p className="choix-patient__erreur" role="alert">
          {erreur}
        </p>
      )}
      {saisie.trim() && !assez && (
        <p className="choix-patient__aide">
          Tapez au moins {LONGUEUR_MIN_RECHERCHE} lettres ou chiffres.
        </p>
      )}
      {recherche.erreur && (
        <Message
          ton="erreur"
          action={<Button onClick={() => recherche.relancer()}>Réessayer</Button>}
        >
          <p>{recherche.erreur.message}</p>
        </Message>
      )}
      {assez && !recherche.chargement && !recherche.erreur && recherche.lignes.length === 0 && (
        <p className="choix-patient__aide" role="status">
          Aucun dossier pour « {recherche.requeteLancee || saisie.trim()} ».
        </p>
      )}
      {recherche.lignes.length > 0 && (
        <ul className="choix-patient__liste" aria-label="Dossiers trouvés">
          {recherche.lignes.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="choix-patient__resultat"
                onClick={() => onChoisir(p)}
              >
                <LignePatient patient={p} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {recherche.total > NB_RESULTATS && (
        <p className="choix-patient__aide">
          Plus de {NB_RESULTATS} dossiers : précisez avec le prénom, le quartier ou le téléphone.
        </p>
      )}
      {peutCreer && (
        <Button
          variante="secondaire"
          className="choix-patient__nouveau"
          iconeDebut={<Icone icone={UserPlus} />}
          onClick={onNouveau}
        >
          Nouveau patient
        </Button>
      )}
    </div>
  )
}
