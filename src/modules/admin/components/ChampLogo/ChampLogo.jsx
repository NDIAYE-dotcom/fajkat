import { ImagePlus } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { envoyerLogo } from '../../api.js'
import RecadrageImage from '../../../../components/ui/RecadrageImage/RecadrageImage.jsx'
import './ChampLogo.css'

// Au-delà, la photo est sans doute mal choisie (et lourde à ouvrir sur un petit téléphone).
const POIDS_MAX = 15 * 1024 * 1024

// Logo de la structure : choix d'une image, recadrage carré, envoi immédiat dans « logos ».
// value : adresse publique du logo (ou '') ; onChange(adresse).
export default function ChampLogo({ orgId, value, onChange }) {
  const idTitre = useId()
  const refFichier = useRef(null)
  const [fichier, setFichier] = useState(null)
  const [numero, setNumero] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  function surChoix(evenement) {
    const choisi = evenement.target.files?.[0]
    evenement.target.value = '' // le même fichier pourra être choisi à nouveau
    if (!choisi) return
    if (!choisi.type.startsWith('image/')) {
      setErreur('Choisissez une image (photo JPG ou PNG).')
      return
    }
    if (choisi.size > POIDS_MAX) {
      setErreur('Cette image est trop lourde (plus de 15 Mo). Choisissez-en une autre.')
      return
    }
    setErreur(null)
    setNumero((n) => n + 1)
    setFichier(choisi)
  }

  async function surValider(blob) {
    setEnvoi(true)
    setErreur(null)
    try {
      onChange(await envoyerLogo(orgId, blob))
      setFichier(null)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <section className="champ-logo" aria-labelledby={idTitre}>
      <h3 id={idTitre} className="champ-logo__titre">
        Logo <span className="champ-logo__facultatif">(facultatif)</span>
      </h3>
      <div className="champ-logo__ligne">
        <div className="champ-logo__vignette">
          {value ? (
            <img src={value} alt="Logo actuel de la structure" width="96" height="96" />
          ) : (
            <Icone icone={ImagePlus} taille={28} />
          )}
        </div>
        <div className="champ-logo__actions">
          <input
            ref={refFichier}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={surChoix}
          />
          <Button variante="secondaire" onClick={() => refFichier.current?.click()}>
            {value ? 'Changer de logo' : 'Choisir un logo'}
          </Button>
          {value && (
            <Button variante="discret" onClick={() => onChange('')}>
              Retirer le logo
            </Button>
          )}
        </div>
      </div>
      <p className="champ-logo__aide">
        Il apparaîtra en tête de vos ordonnances, reçus et certificats.
      </p>
      {erreur && !fichier && (
        <p className="champ-logo__erreur" role="alert">
          {erreur}
        </p>
      )}
      {fichier && (
        <RecadrageImage
          key={numero}
          fichier={fichier}
          onFermer={() => !envoi && setFichier(null)}
          onValider={surValider}
          envoi={envoi}
          erreurEnvoi={erreur}
        />
      )}
    </section>
  )
}
