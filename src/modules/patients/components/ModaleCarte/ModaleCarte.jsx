import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { imprimer } from '../../../../lib/impression.js'
import { chargerStructureCarte, cles } from '../../api.js'
import { adresseDossier } from '../../fiche.js'
import CartePatient from '../CartePatient/CartePatient.jsx'
import './ModaleCarte.css'

// Encre et fond d'impression (tokens) : un QR noir sur blanc se lit partout.
function couleursQr() {
  const style = getComputedStyle(document.documentElement)
  return {
    dark: style.getPropertyValue('--impression-encre').trim() || undefined,
    light: style.getPropertyValue('--impression-fond').trim() || undefined,
  }
}

// Aperçu de la carte et impression sur une feuille A4. La copie imprimée est rendue hors
// de la fenêtre (portail) : un <dialog> ne s'imprime pas proprement.
export default function ModaleCarte({ patient, onFermer }) {
  const { structure: active } = useOrganization()
  const aImprimer = useRef(null)
  const structure = useQuery({
    queryKey: cles.structureCarte(patient.org_id),
    queryFn: () => chargerStructureCarte(patient.org_id),
  })
  const adresse = adresseDossier(patient.id)
  const qr = useQuery({
    queryKey: ['patients', 'qr', adresse],
    // Bibliothèque chargée à l'ouverture de la carte seulement : la fiche reste légère.
    queryFn: async () => {
      const { default: QRCode } = await import('qrcode')
      return QRCode.toString(adresse, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
        color: couleursQr(),
      })
    },
    staleTime: Infinity,
  })

  const pret = structure.data && qr.data
  const erreur = structure.error ?? qr.error
  const infos = structure.data ?? { name: active.name }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      titre="Carte patient"
      description="Imprimée sur une feuille A4, en noir et blanc. Le QR code ouvre ce dossier, après connexion, pour les membres de la structure."
      actions={
        <Button
          iconeDebut={<Icone icone={Printer} />}
          disabled={!pret}
          onClick={() => imprimer(aImprimer.current)}
        >
          Imprimer la carte
        </Button>
      }
    >
      <div className="modale-carte">
        {erreur && (
          <Message
            ton="erreur"
            action={
              <Button
                onClick={() => {
                  structure.refetch()
                  qr.refetch()
                }}
              >
                Réessayer
              </Button>
            }
          >
            <p>La carte n’a pas pu être préparée. {erreur.message}</p>
          </Message>
        )}
        {structure.data && !structure.data.phone && (
          <Message ton="info" titre="Téléphone de la structure manquant">
            <p>
              Il est imprimé au verso, pour rapporter une carte perdue. Ajoutez-le dans Paramètres,
              rubrique Identité.
            </p>
          </Message>
        )}
        {pret ? (
          <CartePatient patient={patient} structure={infos} qrSvg={qr.data} />
        ) : (
          !erreur && <Skeleton forme="bloc" largeur="min(85.6mm, 100%)" hauteur="54mm" />
        )}
      </div>
      {pret &&
        createPortal(
          <div ref={aImprimer} className="impression-seule modale-carte__impression">
            <CartePatient patient={patient} structure={infos} qrSvg={qr.data} />
          </div>,
          document.body,
        )}
    </Modal>
  )
}
