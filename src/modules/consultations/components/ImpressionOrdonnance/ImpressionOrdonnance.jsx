import { useState } from 'react'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatDate } from '../../../../lib/format.js'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { prochainRdvImprimable } from '../../documents.js'
import { useSuivis } from '../../hooks/useDocuments.js'
import { useEnTeteStructure, useQualites, useVoies } from '../../hooks/useOrdonnance.js'
import { libellesPrises, LIBELLES_PRISES } from '../../ordonnance.js'
import ModaleImpressionPdf from '../ModaleImpressionPdf/ModaleImpressionPdf.jsx'

// Impression d'une ordonnance validée (soignants qui rédigent), A5. Le prochain rendez-vous
// pris depuis la consultation y figure, avec la date et l'heure seulement.
export default function ImpressionOrdonnance({
  ouvert,
  onFermer,
  consultationId,
  ordonnance,
  patient,
}) {
  const { structure } = useOrganization()
  const enTete = useEnTeteStructure(structure.id, ouvert)
  const voies = useVoies()
  const qualites = useQualites(consultationId, ouvert)
  const suivis = useSuivis(consultationId, ouvert)
  const [wolof, setWolof] = useState(false)
  const pret = Boolean(enTete.data && voies.data && qualites.data && suivis.data && patient)
  const wo = libellesPrises('wo', structure.settings)

  async function preparer() {
    const { genererOrdonnance } = await import('../../pdf/genererOrdonnance.js')
    return genererOrdonnance({
      structure: enTete.data,
      patient: { nom: nomComplet(patient), age: libelleAge(patient) },
      date: formatDate(ordonnance.prescribed_at),
      // Qualité imprimée sous le nom (fonction de la fiche du personnel, sinon titre du profil).
      ordonnance: { ...ordonnance, prescriber_title: qualites.data[ordonnance.id] ?? null },
      prochainRdv: prochainRdvImprimable(suivis.data),
      voies: voies.data,
      libelles: libellesPrises(wolof ? 'wo' : 'fr', structure.settings),
    })
  }

  return (
    <ModaleImpressionPdf
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Imprimer l’ordonnance"
      description="Format A5, lisible en noir et blanc. Ni diagnostic ni type de consultation."
      nomFichier={`ordonnance-${(ordonnance?.prescribed_at ?? '').slice(0, 10)}.pdf`}
      libelleAttente="Préparation de l’ordonnance…"
      pret={pret}
      preparer={preparer}
      cle={`${wolof ? 'wo' : 'fr'}-${ordonnance?.id}-${suivis.dataUpdatedAt}`}
      erreurChargement={enTete.error || voies.error || qualites.error || suivis.error}
      onReessayer={() => {
        enTete.refetch()
        voies.refetch()
        qualites.refetch()
        suivis.refetch()
      }}
    >
      <Checkbox
        label="Libellés en wolof"
        description={`${Object.values(LIBELLES_PRISES.fr).join(', ')} deviennent ${Object.values(wo).join(', ')}.`}
        checked={wolof}
        onChange={(e) => setWolof(e.target.checked)}
      />
    </ModaleImpressionPdf>
  )
}
