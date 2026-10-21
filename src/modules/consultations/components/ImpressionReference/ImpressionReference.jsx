import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatDate, formatDateHeure, formatTelephone } from '../../../../lib/format.js'
import { useReference } from '../../hooks/useDocuments.js'
import { useEnTeteStructure } from '../../hooks/useOrdonnance.js'
import { usePatientImprime } from '../../hooks/usePatientImprime.js'
import ModaleImpressionPdf from '../ModaleImpressionPdf/ModaleImpressionPdf.jsx'

// Impression (ou réimpression) d'une lettre de référence, A4 pliée en trois, avec le coupon
// de contre-référence. Monté seulement à l'ouverture : la référence est lue à ce moment.
export default function ImpressionReference({ referenceId, patient, onFermer }) {
  const { structure } = useOrganization()
  const enTete = useEnTeteStructure(structure.id)
  const reference = useReference(referenceId)
  const r = reference.data
  const identite = usePatientImprime(r?.patient_id, patient)
  const pret = Boolean(enTete.data && r && identite.identite)

  async function preparer() {
    const { genererReference } = await import('../../pdf/genererDocuments.js')
    return genererReference({
      structure: enTete.data,
      date: formatDate(r.referred_at),
      dateHeure: formatDateHeure(r.referred_at),
      reference: r,
      destinationTelephone: formatTelephone(r.destination_phone),
      patient: identite.identite,
      sensible: r.is_sensitive,
    })
  }

  return (
    <ModaleImpressionPdf
      ouvert
      onFermer={onFermer}
      titre="Imprimer la lettre de référence"
      description={
        r?.is_sensitive
          ? 'Pli confidentiel. Pliez la lettre en trois, en accordéon : seuls la destination et le nom du patient restent visibles.'
          : 'Format A4, pliée en trois. Le coupon du bas est à remplir par la structure d’accueil.'
      }
      nomFichier={`reference-${(r?.referred_at ?? '').slice(0, 10)}.pdf`}
      libelleAttente="Préparation de la lettre…"
      pret={pret}
      preparer={preparer}
      cle={referenceId}
      erreurChargement={enTete.error || reference.error || identite.erreur}
      onReessayer={() => {
        enTete.refetch()
        reference.refetch()
        identite.recharger()
      }}
    />
  )
}
