import { Download, ExternalLink, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import './ModaleImpressionPdf.css'

// Fenêtre d'impression d'un document PDF (ordonnance, lettre de référence, certificat).
// Le PDF est préparé dès que les données sont prêtes, puis à chaque changement de « cle »
// (langue des libellés…) : les boutons agissent aussitôt (un onglet ouvert après une
// attente serait bloqué par le navigateur).
//   pret : données chargées ; preparer() -> Promise<Blob> ;
//   erreurChargement : erreur des données (avec onReessayer) ; children : options au-dessus.
export default function ModaleImpressionPdf({
  ouvert,
  onFermer,
  titre,
  description,
  nomFichier,
  libelleAttente = 'Préparation du document…',
  pret,
  preparer,
  cle = '',
  erreurChargement,
  onReessayer,
  children,
}) {
  const [essai, setEssai] = useState(0)
  // PDF préparé pour une demande : { demande, fichier, erreur } ; un résultat d'une autre
  // demande est ignoré.
  const [resultat, setResultat] = useState({})
  const cadre = useRef(null)
  const demande = `${cle}-${essai}`
  const fichier = resultat.demande === demande ? resultat.fichier : null
  const erreur = resultat.demande === demande ? resultat.erreur : null
  // Dernière fonction de préparation, lue par l'effet suivant (déclaré après : il la voit).
  const preparerCourant = useRef(preparer)
  useEffect(() => {
    preparerCourant.current = preparer
  })

  useEffect(() => {
    if (!ouvert || !pret) return undefined
    let annule = false
    let adresse = null
    preparerCourant
      .current()
      .then((blob) => {
        if (annule) return
        adresse = URL.createObjectURL(blob)
        setResultat({ demande, fichier: adresse })
      })
      .catch(() => {
        if (!annule) {
          setResultat({
            demande,
            erreur:
              'Le document n’a pas pu être préparé. Vérifiez la connexion (la première impression télécharge les polices), puis réessayez.',
          })
        }
      })
    return () => {
      annule = true
      if (adresse) URL.revokeObjectURL(adresse)
    }
  }, [ouvert, pret, demande])

  // Le PDF est chargé dans un cadre sans taille, créé le temps de l'impression ; sans
  // lecteur PDF dans le navigateur (certains téléphones), il s'ouvre dans un onglet.
  function imprimer() {
    if (!fichier) return
    cadre.current?.remove()
    const iframe = document.createElement('iframe')
    iframe.title = `${titre} : document à imprimer`
    iframe.className = 'modale-impression-pdf__cadre'
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch {
        window.open(fichier, '_blank', 'noopener')
      }
    }
    iframe.src = fichier
    document.body.append(iframe)
    cadre.current = iframe
  }

  // Cadre retiré à la fermeture de la fenêtre.
  useEffect(() => {
    if (ouvert) return undefined
    cadre.current?.remove()
    cadre.current = null
    return undefined
  }, [ouvert])

  const inactif = fichier ? '' : 'modale-impression-pdf__inactif'
  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre={titre} description={description}>
      <div className="modale-impression-pdf">
        {children}
        {(erreur || erreurChargement) && (
          <Message
            ton="erreur"
            action={
              <Button
                variante="secondaire"
                onClick={() => {
                  onReessayer?.()
                  setEssai((n) => n + 1)
                }}
              >
                Réessayer
              </Button>
            }
          >
            <p>{erreur ?? erreurChargement.message}</p>
          </Message>
        )}
        {!fichier && !erreur && !erreurChargement && (
          <p className="modale-impression-pdf__attente">
            <Spinner taille={16} /> {libelleAttente}
          </p>
        )}
        <div className="modale-impression-pdf__actions">
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Download} />}
            href={fichier ?? undefined}
            download={nomFichier}
            aria-disabled={!fichier}
            className={inactif}
          >
            Télécharger
          </Button>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={ExternalLink} />}
            href={fichier ?? undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={!fichier}
            className={inactif}
          >
            Ouvrir le PDF
          </Button>
          <Button iconeDebut={<Icone icone={Printer} />} disabled={!fichier} onClick={imprimer}>
            Imprimer
          </Button>
        </div>
      </div>
    </Modal>
  )
}
