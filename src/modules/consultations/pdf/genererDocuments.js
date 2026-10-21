// Génération des PDF de la lettre de référence et du certificat (chargés à la demande).
import { genererPdf } from './commun.js'
import DocumentCertificat from './DocumentCertificat.jsx'
import DocumentReference from './DocumentReference.jsx'
import { stylesCertificat, stylesReference } from './stylesDocuments.js'

// d : { structure, date, dateHeure, reference (get_referral), destinationTelephone,
//       patient: { nom, age, sexe, numero }, sensible } -> Blob PDF.
export function genererReference(d) {
  return genererPdf(DocumentReference, d, stylesReference)
}

// d : { structure, date, certificat (get_certificate) } -> Blob PDF.
export function genererCertificat(d) {
  return genererPdf(DocumentCertificat, d, stylesCertificat)
}
