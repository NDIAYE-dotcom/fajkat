import { Megaphone } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import './BarreAppel.css'

const CIBLES = [
  { valeur: 'consultation', libelle: 'En consultation' },
  { valeur: 'vitals', libelle: 'Aux constantes' },
]

// Réglages de l'appelant (salle, file suivie), gardés sur cet appareil, et bouton
// « Appeler le suivant » : priorité, puis heure d'arrivée, dans la file choisie.
export default function BarreAppel({
  salles,
  services,
  salle,
  onSalle,
  file,
  onFile,
  cible,
  onCible,
  ecrire,
  horsLigne,
  appel,
  onAppeler,
}) {
  return (
    <div className="barre-appel">
      <Field label="Ma salle" aide="Annoncée à l’écran lors de vos appels.">
        <Select
          value={salle}
          onChange={(e) => onSalle(e.target.value)}
          options={[
            { valeur: '', libelle: 'Salle prévue pour le service' },
            ...salles.map((s) => ({ valeur: s.id, libelle: s.label })),
          ]}
        />
      </Field>
      <Field label="File">
        <Select
          value={file}
          onChange={(e) => onFile(e.target.value)}
          options={[
            { valeur: '', libelle: 'Toutes les files' },
            ...services.map((s) => ({ valeur: s.id, libelle: `${s.letter} · ${s.label}` })),
          ]}
        />
      </Field>
      {ecrire && (
        <>
          <Field label="Appeler">
            <Select value={cible} onChange={(e) => onCible(e.target.value)} options={CIBLES} />
          </Field>
          <Button
            className="barre-appel__bouton"
            iconeDebut={<Icone icone={Megaphone} />}
            chargement={appel}
            disabled={horsLigne}
            onClick={onAppeler}
          >
            Appeler le suivant
          </Button>
        </>
      )}
    </div>
  )
}
