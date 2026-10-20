// Styles de l'ordonnance imprimée (le PDF ne lit pas les feuilles de style). A5 : 420 × 595 pt.
import { StyleSheet } from '@react-pdf/renderer'

export function stylesOrdonnance(encre) {
  return StyleSheet.create({
    page: {
      paddingTop: 26,
      paddingBottom: 30,
      paddingHorizontal: 26,
      fontFamily: 'Atkinson',
      fontSize: 10,
      color: encre,
    },
    entete: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: encre,
    },
    logo: { width: 40, height: 40, objectFit: 'contain' },
    structure: { flexGrow: 1, flexShrink: 1 },
    nomStructure: { fontFamily: 'Spectral', fontSize: 14 },
    petit: { fontSize: 9 },
    date: { fontSize: 10, textAlign: 'right' },
    titre: { fontFamily: 'Spectral', fontSize: 16, marginTop: 10, letterSpacing: 2 },
    personnes: { marginTop: 6, gap: 2 },
    gras: { fontWeight: 700 },
    // Qualité du praticien, sous son nom (aligné après « Praticien : »).
    qualite: { fontSize: 9, marginLeft: 58 },
    ligne: {
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 0.75,
      borderTopColor: encre,
      borderTopStyle: 'dashed',
    },
    nomMedicament: { fontSize: 12, fontWeight: 700 },
    prises: { flexDirection: 'row', gap: 6, marginTop: 6 },
    prise: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: encre,
      borderRadius: 4,
    },
    priseVide: { borderStyle: 'dashed' },
    libellePrise: { fontSize: 9, marginTop: 1 },
    dose: { fontFamily: 'Plex', fontSize: 20, lineHeight: 1.1 },
    unite: { fontSize: 8 },
    phrase: { marginTop: 4, fontSize: 10 },
    note: { marginTop: 12, fontSize: 10 },
    signature: {
      marginTop: 18,
      marginLeft: 'auto',
      width: 170,
      height: 64,
      padding: 6,
      borderWidth: 1,
      borderColor: encre,
      borderStyle: 'dashed',
    },
    pied: {
      position: 'absolute',
      bottom: 12,
      left: 26,
      right: 26,
      fontSize: 8,
      textAlign: 'right',
    },
  })
}
