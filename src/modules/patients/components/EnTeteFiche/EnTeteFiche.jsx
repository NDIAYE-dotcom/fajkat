import { IdCard, Merge } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { formatTelephone } from '../../../../lib/format.js'
import { libelleAge, libelleNaissance, libelleTitulaire, nomComplet } from '../../utils.js'
import ModaleCarte from '../ModaleCarte/ModaleCarte.jsx'
import ModaleFusion from '../ModaleFusion/ModaleFusion.jsx'
import PhotoPatient from '../PhotoPatient/PhotoPatient.jsx'
import './EnTeteFiche.css'

// En-tête de la fiche : photo, nom, numéro, âge, téléphone ; carte patient à imprimer ;
// fusion avec un autre dossier (owner et admin : fusionner).
export default function EnTeteFiche({ patient, cle, ecrire, fusionner }) {
  const [carte, setCarte] = useState(false)
  const [fusion, setFusion] = useState(false)
  const age = [
    patient.sex === 'F' ? 'Féminin' : 'Masculin',
    libelleAge(patient),
    libelleNaissance(patient),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="en-tete-fiche">
      <PhotoPatient patient={patient} cle={cle} ecrire={ecrire} />
      <div className="en-tete-fiche__identite">
        <p className="en-tete-fiche__numero">{patient.file_number}</p>
        <h1 className="en-tete-fiche__nom">{nomComplet(patient)}</h1>
        <p className="en-tete-fiche__details">{age}</p>
        {patient.phone && (
          <p className="en-tete-fiche__details">
            <span className="en-tete-fiche__chiffres">{formatTelephone(patient.phone)}</span>
            {patient.phone_owner && ` (${libelleTitulaire(patient.phone_owner)})`}
          </p>
        )}
      </div>
      <div className="en-tete-fiche__actions">
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={IdCard} />}
          onClick={() => setCarte(true)}
        >
          Carte patient
        </Button>
        {fusionner && (
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Merge} />}
            onClick={() => setFusion(true)}
          >
            Fusionner avec un autre dossier
          </Button>
        )}
      </div>
      {carte && <ModaleCarte patient={patient} onFermer={() => setCarte(false)} />}
      {fusion && <ModaleFusion patient={patient} onFermer={() => setFusion(false)} />}
    </header>
  )
}
