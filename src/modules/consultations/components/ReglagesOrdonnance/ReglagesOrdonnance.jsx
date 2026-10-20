import { useState } from 'react'
import EtapeCadre from '../../../admin/components/EtapeCadre/EtapeCadre.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { libellesPrises, LIBELLES_PRISES, PRISES } from '../../ordonnance.js'
import PictogrammePrise from '../PictogrammePrise/PictogrammePrise.jsx'
import './ReglagesOrdonnance.css'

// Paramètres → Ordonnance (owner et admin) : mots imprimés sous les pictogrammes quand
// « Libellés en wolof » est coché. Une case vidée reprend le mot proposé par défaut.
//   enregistrer(patch) : fusionne patch dans organizations.settings.
export default function ReglagesOrdonnance({ structure, enregistrer, suivant }) {
  const [mots, setMots] = useState(() => libellesPrises('wo', structure.settings))
  const [erreurs, setErreurs] = useState({})
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  async function envoyer() {
    const trouvees = {}
    for (const { cle } of PRISES) {
      if (mots[cle].trim().length > 20) trouvees[cle] = '20 caractères au plus.'
    }
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return
    setEnvoi(true)
    setErreur(null)
    try {
      const wo = Object.fromEntries(
        PRISES.map(({ cle }) => [cle, mots[cle].trim() || LIBELLES_PRISES.wo[cle]]),
      )
      await enregistrer({ prescription_labels: { wo } })
      await suivant()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <EtapeCadre
      edition
      titre="Ordonnance"
      pourquoi="À l’impression, la case « Libellés en wolof » remplace Matin, Midi, Soir et Nuit par ces mots, sous chaque pictogramme."
      erreur={erreur}
      envoi={envoi}
      onEnvoyer={envoyer}
    >
      <div className="reglages-ordonnance">
        {PRISES.map(({ cle }) => (
          <Field
            key={cle}
            label={
              <span className="reglages-ordonnance__prise">
                <PictogrammePrise prise={cle} />
                {`${LIBELLES_PRISES.fr[cle]} en wolof`}
              </span>
            }
            erreur={erreurs[cle]}
          >
            <Input
              value={mots[cle]}
              maxLength={20}
              placeholder={LIBELLES_PRISES.wo[cle]}
              onChange={(e) => setMots((m) => ({ ...m, [cle]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
    </EtapeCadre>
  )
}
