import { Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import { imprimer } from '../../../../lib/impression.js'
import { estClos } from '../../agenda.js'
import { dateLongue } from '../../utils.js'
import PlanningImprime from '../PlanningImprime/PlanningImprime.jsx'
import './ModalePlanning.css'

// Impression du planning d'un jour (A4). Version neutre par défaut, pour tout le monde ;
// un soignant peut choisir la version avec les types réels, marquée « Document
// confidentiel ». Annulés et reportés ne sont pas imprimés. La copie imprimée est rendue
// hors de la fenêtre (portail) : un <dialog> ne s'imprime pas proprement.
export default function ModalePlanning({
  structure,
  date,
  rdv,
  medical,
  multiPraticiens,
  onFermer,
}) {
  const aImprimer = useRef(null)
  const [versionSoignant, setVersionSoignant] = useState(false)
  const lignes = (rdv ?? []).filter((r) => r.local_date === date && !estClos(r))
  const nombre = `${lignes.length} rendez-vous`

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Imprimer le planning"
      description={`${dateLongue(date)} · ${nombre}`}
      actions={
        <Button
          iconeDebut={<Icone icone={Printer} />}
          disabled={lignes.length === 0}
          onClick={() => imprimer(aImprimer.current, 'a4')}
        >
          Imprimer
        </Button>
      }
    >
      <div className="modale-planning">
        {lignes.length === 0 && <p>Aucun rendez-vous à imprimer ce jour-là.</p>}
        {lignes.length > 0 && medical && (
          <Field label="Version" groupe>
            <div className="modale-planning__choix">
              <Radio
                name="planning-version"
                checked={!versionSoignant}
                onChange={() => setVersionSoignant(false)}
                label="Version neutre"
                description="Les soins discrets sont imprimés « Consultation ». Pour l’accueil."
              />
              <Radio
                name="planning-version"
                checked={versionSoignant}
                onChange={() => setVersionSoignant(true)}
                label="Version soignant (types réels)"
                description="Marquée « Document confidentiel » en bas de page."
              />
            </div>
          </Field>
        )}
        {lignes.length > 0 && !medical && (
          <p>Le planning est imprimé comme à l’écran, avec une case « Arrivé » à cocher.</p>
        )}
      </div>
      {lignes.length > 0 &&
        createPortal(
          <PlanningImprime
            ref={aImprimer}
            structure={structure}
            date={date}
            rdv={lignes}
            versionSoignant={medical && versionSoignant}
            multiPraticiens={multiPraticiens}
          />,
          document.body,
        )}
    </Modal>
  )
}
