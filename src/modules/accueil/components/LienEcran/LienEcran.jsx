import { Copy, ExternalLink, Send } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { copierTexte, lienWhatsApp } from '../../../personnel/utils.js'
import './LienEcran.css'

// Lien d'un écran tout juste créé : affiché une seule fois (seul son empreinte est gardée
// en base). À ouvrir dans le navigateur de la télévision.
export default function LienEcran({ lien, libelle }) {
  const [copie, setCopie] = useState(null)

  return (
    <Message ton="succes" titre={`Lien de « ${libelle} »`}>
      <p>
        Ouvrez ce lien dans le navigateur de la télévision. Il ne sera plus affiché : envoyez-le
        vous sur WhatsApp ou copiez-le maintenant.
      </p>
      <p className="lien-ecran__lien">{lien}</p>
      <div className="lien-ecran__boutons">
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={Copy} />}
          onClick={async () => setCopie(await copierTexte(lien))}
        >
          {copie ? 'Lien copié' : 'Copier le lien'}
        </Button>
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={Send} />}
          onClick={() =>
            window.open(
              lienWhatsApp(null, `Écran d’appel « ${libelle} » : ${lien}`),
              '_blank',
              'noopener',
            )
          }
        >
          Envoyer sur WhatsApp
        </Button>
        <Button
          variante="discret"
          iconeDebut={<Icone icone={ExternalLink} />}
          onClick={() => window.open(lien, '_blank', 'noopener')}
        >
          Ouvrir sur cet appareil
        </Button>
      </div>
      {copie === false && (
        <p role="alert">La copie a échoué : sélectionnez le lien et copiez-le à la main.</p>
      )}
    </Message>
  )
}
