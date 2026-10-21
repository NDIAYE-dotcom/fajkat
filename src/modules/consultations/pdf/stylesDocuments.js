// Styles de la lettre de référence (A4 : 595 × 842 pt) et du certificat (A5 : 420 × 595 pt).
// Noir et blanc, traits pleins ou pointillés : lisibles après photocopie.
import { StyleSheet } from '@react-pdf/renderer'

// Hauteur d'un tiers de page A4 : la lettre se plie en trois, la bande du haut reste
// visible une fois pliée.
export const TIERS_A4 = 842 / 3

function communs(encre) {
  return {
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
    gras: { fontWeight: 700 },
    texte: { fontSize: 10, lineHeight: 1.35 },
    signature: {
      marginTop: 10,
      marginLeft: 'auto',
      width: 190,
      minHeight: 54,
      padding: 6,
      borderWidth: 1,
      borderColor: encre,
      borderStyle: 'dashed',
    },
    pied: {
      position: 'absolute',
      bottom: 12,
      left: 36,
      right: 36,
      fontSize: 8,
      textAlign: 'right',
    },
  }
}

export function stylesReference(encre) {
  return StyleSheet.create({
    ...communs(encre),
    page: {
      paddingTop: 0,
      paddingBottom: 30,
      paddingHorizontal: 36,
      fontFamily: 'Atkinson',
      fontSize: 10,
      color: encre,
    },
    // Bande visible une fois la lettre pliée : exactement le premier tiers de la page.
    bande: { height: TIERS_A4, paddingTop: 28, paddingBottom: 12 },
    confidentiel: {
      fontFamily: 'Spectral',
      fontSize: 18,
      textAlign: 'center',
      padding: 10,
      borderWidth: 2,
      borderColor: encre,
      letterSpacing: 1,
    },
    adresse: { marginTop: 24, marginLeft: 'auto', width: 300, gap: 4 },
    ligneAdresse: { fontSize: 12 },
    titre: { fontFamily: 'Spectral', fontSize: 16, marginTop: 10, letterSpacing: 2 },
    urgent: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 2,
      borderColor: encre,
      fontWeight: 700,
      letterSpacing: 1,
    },
    // Pli : trait pointillé sur toute la largeur, et sa mention.
    pli: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTopWidth: 0.75,
      borderTopColor: encre,
      borderTopStyle: 'dashed',
    },
    pliMarge: {
      position: 'absolute',
      width: 22,
      borderTopWidth: 0.75,
      borderTopColor: encre,
      borderTopStyle: 'dashed',
    },
    mentionPli: { position: 'absolute', right: 4, fontSize: 7 },
    corps: { paddingTop: 12 },
    rubrique: { marginTop: 10 },
    titreRubrique: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
    // Coupon de contre-référence, à découper et à rapporter au poste.
    coupon: {
      marginTop: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: encre,
      borderTopStyle: 'dashed',
    },
    titreCoupon: { fontFamily: 'Spectral', fontSize: 13 },
    ligneCoupon: { flexDirection: 'row', gap: 16 },
    // Champ d'une ligne de deux : partage la largeur.
    champMoitie: { flexGrow: 1, flexBasis: 0 },
    champCoupon: {
      flexDirection: 'row',
      marginTop: 6,
      borderBottomWidth: 0.75,
      borderBottomColor: encre,
      borderBottomStyle: 'dotted',
      minHeight: 14,
    },
    champCouponHaut: { minHeight: 26 },
  })
}

export function stylesCertificat(encre) {
  return StyleSheet.create({
    ...communs(encre),
    page: {
      paddingTop: 26,
      paddingBottom: 30,
      paddingHorizontal: 30,
      fontFamily: 'Atkinson',
      fontSize: 10,
      color: encre,
    },
    titre: {
      fontFamily: 'Spectral',
      fontSize: 15,
      marginTop: 16,
      textAlign: 'center',
      letterSpacing: 1,
    },
    numero: { fontSize: 10, textAlign: 'center', marginTop: 4 },
    chiffres: { fontFamily: 'Plex' },
    corps: { marginTop: 16, gap: 8 },
    paragraphe: { fontSize: 11, lineHeight: 1.45 },
    pied: {
      position: 'absolute',
      bottom: 12,
      left: 30,
      right: 30,
      fontSize: 8,
      textAlign: 'right',
    },
  })
}
