import { useEffect } from 'react'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatDate } from '../../../../lib/format.js'
import { useCertificat } from '../../hooks/useDocuments.js'
import { useEnTeteStructure } from '../../hooks/useOrdonnance.js'
import ModaleImpressionPdf from '../ModaleImpressionPdf/ModaleImpressionPdf.jsx'

// Impression (ou réimpression) d'un certificat émis, A5. Monté seulement à l'ouverture.
// onLu(certificat) : certificat lu (numéro, titre), pour la liste des documents.
export default function ImpressionCertificat({ certificatId, onFermer, onLu }) {
  const { structure } = useOrganization()
  const enTete = useEnTeteStructure(structure.id)
  const certificat = useCertificat(certificatId)
  const c = certificat.data
  const pret = Boolean(enTete.data && c)

  useEffect(() => {
    if (c) onLu?.({ id: c.id, title: c.title, number: c.number, issued_at: c.issued_at })
    // Une fois, à la lecture du certificat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c])

  async function preparer() {
    const { genererCertificat } = await import('../../pdf/genererDocuments.js')
    return genererCertificat({
      structure: enTete.data,
      date: formatDate(c.issued_at),
      certificat: c,
    })
  }

  return (
    <ModaleImpressionPdf
      ouvert
      onFermer={onFermer}
      titre="Imprimer le certificat"
      description={
        c
          ? `${c.title} n° ${c.number}. Format A5. Le texte imprimé est celui que vous avez émis.`
          : 'Format A5.'
      }
      nomFichier={`certificat-${c?.number ?? ''}.pdf`}
      libelleAttente="Préparation du certificat…"
      pret={pret}
      preparer={preparer}
      cle={certificatId}
      erreurChargement={enTete.error || certificat.error}
      onReessayer={() => {
        enTete.refetch()
        certificat.refetch()
      }}
    />
  )
}
