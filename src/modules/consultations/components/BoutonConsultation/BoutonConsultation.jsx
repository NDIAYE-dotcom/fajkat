import { Stethoscope } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { commencerConsultation } from '../../api.js'
import { etatRetour } from '../../utils.js'

// « Commencer la consultation » (file d'attente) ou « Nouvelle consultation » (fiche du
// patient) : la base ouvre un brouillon, ou rend celui déjà ouvert pour ce passage.
export default function BoutonConsultation({
  patientId,
  visiteId = null,
  libelle = 'Commencer la consultation',
  variante = 'primaire',
  ariaLabel,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const enLigne = useEnLigne()
  const [envoi, setEnvoi] = useState(false)

  async function commencer() {
    setEnvoi(true)
    try {
      const c = await commencerConsultation(patientId, visiteId)
      navigate(`/app/consultations/${c.id}`, { state: etatRetour(location) })
    } catch (e) {
      toast.erreur('Consultation non ouverte', { message: e.message })
      setEnvoi(false)
    }
  }

  return (
    <Button
      variante={variante}
      iconeDebut={<Icone icone={Stethoscope} />}
      chargement={envoi}
      disabled={!enLigne}
      aria-label={ariaLabel}
      onClick={commencer}
    >
      {libelle}
    </Button>
  )
}
