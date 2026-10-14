import { useEffect, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { chargerImage, dessiner, exporter, geometrie, TAILLE_LOGO } from './image.js'
import './RecadrageLogo.css'

const PAS_CLAVIER = 16

function couleurFond() {
  return getComputedStyle(document.documentElement).getPropertyValue('--blanc').trim() || 'white'
}

// Recadrage carré simple : glisser l'image (doigt, souris ou flèches du clavier) et zoomer.
// onValider(blob) envoie le logo ; la fenêtre reste ouverte tant que l'envoi n'a pas réussi.
// Montée pour un seul fichier (le parent change sa « key ») : l'état repart de zéro.
export default function RecadrageLogo({ fichier, onFermer, onValider, envoi, erreurEnvoi }) {
  const refCanvas = useRef(null)
  const glisser = useRef(null)
  const [image, setImage] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [decalage, setDecalage] = useState({ x: 0, y: 0 })
  const [preparation, setPreparation] = useState(false)

  useEffect(() => {
    let url = null
    let actif = true
    chargerImage(fichier)
      .then((resultat) => {
        url = resultat.url
        if (actif) setImage(resultat.image)
      })
      .catch((e) => actif && setErreur(e.message))
    return () => {
      actif = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fichier])

  useEffect(() => {
    if (image && refCanvas.current)
      dessiner(refCanvas.current, image, zoom, decalage, couleurFond())
  }, [image, zoom, decalage])

  // Le décalage reste borné : l'image couvre toujours le carré.
  function deplacer(dx, dy) {
    setDecalage((d) => geometrie(image, zoom, { x: d.x + dx, y: d.y + dy }).decalage)
  }

  function surZoom(evenement) {
    const valeur = Number(evenement.target.value)
    setZoom(valeur)
    setDecalage((d) => geometrie(image, valeur, d).decalage)
  }

  function surPointeurBas(evenement) {
    evenement.currentTarget.setPointerCapture(evenement.pointerId)
    glisser.current = { x: evenement.clientX, y: evenement.clientY }
  }

  function surPointeurMouvement(evenement) {
    if (!glisser.current) return
    // Pixels de l'écran -> pixels du carré de sortie.
    const rapport = TAILLE_LOGO / evenement.currentTarget.clientWidth
    deplacer(
      (evenement.clientX - glisser.current.x) * rapport,
      (evenement.clientY - glisser.current.y) * rapport,
    )
    glisser.current = { x: evenement.clientX, y: evenement.clientY }
  }

  function surClavier(evenement) {
    const directions = {
      ArrowLeft: [-PAS_CLAVIER, 0],
      ArrowRight: [PAS_CLAVIER, 0],
      ArrowUp: [0, -PAS_CLAVIER],
      ArrowDown: [0, PAS_CLAVIER],
    }
    const direction = directions[evenement.key]
    if (!direction) return
    evenement.preventDefault()
    deplacer(...direction)
  }

  async function surValider() {
    setPreparation(true)
    try {
      const blob = await exporter(image, zoom, decalage, couleurFond())
      await onValider(blob)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setPreparation(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Recadrer le logo"
      description="Le logo est carré. Faites glisser l’image pour la placer, puis ajustez le zoom."
      actions={
        <>
          <Button variante="secondaire" onClick={onFermer} disabled={envoi || preparation}>
            Annuler
          </Button>
          <Button onClick={surValider} disabled={!image} chargement={envoi || preparation}>
            Utiliser ce logo
          </Button>
        </>
      }
    >
      <div className="recadrage-logo">
        <div className="recadrage-logo__cadre">
          {!image && !erreur && <Spinner libelle="Ouverture de l’image…" taille={28} />}
          <canvas
            ref={refCanvas}
            width={TAILLE_LOGO}
            height={TAILLE_LOGO}
            hidden={!image}
            className="recadrage-logo__apercu"
            tabIndex={0}
            role="img"
            aria-label="Aperçu du logo. Utilisez les flèches du clavier pour déplacer l’image."
            onPointerDown={surPointeurBas}
            onPointerMove={surPointeurMouvement}
            onPointerUp={() => (glisser.current = null)}
            onPointerCancel={() => (glisser.current = null)}
            onKeyDown={surClavier}
          />
        </div>
        {image && (
          <Field id="recadrage-zoom" label="Zoom">
            <input
              id="recadrage-zoom"
              type="range"
              min="1"
              max="4"
              step="0.05"
              value={zoom}
              onChange={surZoom}
              className="recadrage-logo__zoom"
            />
          </Field>
        )}
        {(erreur || erreurEnvoi) && <Message ton="erreur">{erreur || erreurEnvoi}</Message>}
      </div>
    </Modal>
  )
}
