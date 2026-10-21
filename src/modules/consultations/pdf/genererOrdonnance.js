// Génération du PDF de l'ordonnance (chargé à la demande avec DocumentOrdonnance).
import { genererPdf } from './commun.js'
import DocumentOrdonnance from './DocumentOrdonnance.jsx'
import { stylesOrdonnance } from './stylesOrdonnance.js'

// d : { structure: { name, address, phone, authorization_number, logo_url },
//       patient: { nom, age }, date,
//       ordonnance: { items, note, prescriber_name, prescriber_title },
//       prochainRdv : « Prochain rendez-vous : mardi 27/10/2026 à 10:00 » ou null,
//       voies, libelles: { matin, midi, soir, nuit } } -> Blob PDF.
export function genererOrdonnance(d) {
  return genererPdf(DocumentOrdonnance, d, stylesOrdonnance)
}
