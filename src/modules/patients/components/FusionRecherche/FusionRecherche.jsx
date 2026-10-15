import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import { chercherDoublons, cles } from '../../api.js'
import { requeteSuffisante, useRecherchePatients } from '../../hooks/useRecherchePatients.js'
import { RAISONS_DOUBLON } from '../../utils.js'
import LignePatient from '../LignePatient/LignePatient.jsx'
import './FusionRecherche.css'

// Étape 1 de la fusion : l'autre dossier, cherché par nom, téléphone ou numéro. Avant toute
// frappe, les dossiers proches (mêmes règles que l'alerte de doublon) sont proposés.
export default function FusionRecherche({ patient, onChoisir }) {
  const [valeur, setValeur] = useState('')
  const assez = requeteSuffisante(valeur)
  const recherche = useRecherchePatients(patient.org_id, valeur, { parPage: 8, vide: 'rien' })
  const criteres = {
    nom: patient.last_name,
    prenom: patient.first_name,
    telephone: patient.phone,
    mere: patient.mother_first_name,
    anneeNaissance: patient.birth_year,
  }
  const proches = useQuery({
    queryKey: cles.doublons(patient.org_id, criteres),
    queryFn: () => chercherDoublons(patient.org_id, criteres),
    enabled: !assez,
  })

  const lignes = (assez ? recherche.lignes : (proches.data ?? [])).filter(
    (p) => p.id !== patient.id,
  )
  const erreur = assez ? recherche.erreur : proches.error
  let etat = null
  if (assez && !recherche.chargement && !recherche.enCours && lignes.length === 0) {
    etat = `Aucun autre dossier pour « ${valeur.trim()} ».`
  } else if (!assez && proches.isSuccess && lignes.length === 0) {
    etat =
      'Aucun dossier proche n’a été trouvé. Cherchez l’autre dossier par nom, téléphone ou numéro.'
  }

  return (
    <div className="fusion-recherche">
      <SearchBar
        valeur={valeur}
        onChange={setValeur}
        chargement={assez && recherche.enCours}
        libelle="Chercher l’autre dossier"
        placeholder="Nom, téléphone, n° de dossier…"
      />
      {!assez && lignes.length > 0 && (
        <p className="fusion-recherche__titre">Dossiers proches de celui-ci</p>
      )}
      {erreur && <Message ton="erreur">{erreur.message}</Message>}
      {etat && (
        <p className="fusion-recherche__etat" role="status">
          {etat}
        </p>
      )}
      <ul className="fusion-recherche__liste">
        {lignes.map((p) => (
          <li key={p.id} className="fusion-recherche__ligne">
            <div className="fusion-recherche__patient">
              <LignePatient patient={p} />
              {p.reason && (
                <span className="fusion-recherche__raison">{RAISONS_DOUBLON[p.reason]}</span>
              )}
            </div>
            <Button
              variante="secondaire"
              iconeFin={<Icone icone={ArrowRight} />}
              onClick={() => onChoisir(p.id)}
            >
              Comparer
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
