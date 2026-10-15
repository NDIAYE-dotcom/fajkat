import { FolderOpen, UsersRound } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { RAISONS_DOUBLON } from '../../utils.js'
import LignePatient from '../LignePatient/LignePatient.jsx'
import './AlerteDoublons.css'

// « C'est peut-être ce patient » : dossiers proches de la saisie. Un numéro partagé par
// la famille ne suffit pas à signaler un doublon (la base exige aussi un nom proche) ;
// deux homonymes sur le même téléphone restent possibles : la personne tranche.
export default function AlerteDoublons({ candidats, confirme, onConfirmer, onOuvrir, ref }) {
  if (!candidats?.length) return null
  const un = candidats.length === 1

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="alerte-doublons"
      aria-labelledby="alerte-doublons-titre"
      aria-live="polite"
    >
      <h3 id="alerte-doublons-titre" className="alerte-doublons__titre">
        <Icone icone={UsersRound} className="alerte-doublons__icone" />
        {un ? 'C’est peut-être ce patient' : 'C’est peut-être l’un de ces patients'}
      </h3>
      <p className="alerte-doublons__texte">
        Vérifiez avec la personne (âge, quartier, prénom de la mère) avant de créer un nouveau
        dossier.
      </p>
      <ul className="alerte-doublons__liste">
        {candidats.map((c) => (
          <li key={c.id} className="alerte-doublons__candidat">
            <div className="alerte-doublons__identite">
              <LignePatient patient={c} />
              <span className="alerte-doublons__raison">{RAISONS_DOUBLON[c.reason]}</span>
            </div>
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={FolderOpen} />}
              onClick={() => onOuvrir(c.id)}
            >
              Ouvrir ce dossier
            </Button>
          </li>
        ))}
      </ul>
      <Checkbox
        label={
          un
            ? 'Ce n’est pas ce patient : c’est une autre personne'
            : 'Aucun de ces dossiers : c’est une autre personne'
        }
        description="Un homonyme, un frère ou une sœur qui partage le même téléphone…"
        checked={confirme}
        onChange={(e) => onConfirmer(e.target.checked)}
      />
    </section>
  )
}
