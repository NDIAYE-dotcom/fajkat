// Informations sur l'éditeur du site, reprises par le pied de page et les pages légales.
// null = information encore inconnue, affichée « [à compléter] ».
export const EDITEUR = {
  raisonSociale: 'Global Service',
  adresse: 'Dakar',
  ninea: '008446769',
  directeurPublication: null,
}

export const A_COMPLETER = '[à compléter]'

export function ouACompleter(valeur) {
  return valeur ?? A_COMPLETER
}
