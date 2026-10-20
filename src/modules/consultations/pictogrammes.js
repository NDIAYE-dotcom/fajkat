// Pictogrammes des prises, dessinés au trait (grille 24 × 24, trait 1,75, bouts ronds),
// partagés par l'écran (PictogrammePrise) et l'ordonnance imprimée (pdf/). Lisibles en
// noir et blanc et après photocopie : aucun aplat, aucune nuance.
//   matin : soleil levant (flèche vers le haut sous l'horizon) ;
//   midi : soleil entier ; soir : soleil couchant (flèche vers le bas) ; nuit : lune.

const RAYONS_LEVANT = 'M12 7.5V5 M6.3 11.3 4.6 9.6 M17.7 11.3l1.7-1.7'
const DEMI_SOLEIL = 'M7 16a5 5 0 0 1 10 0'
const HORIZON = 'M2.5 16h19'

export const PICTOGRAMMES = {
  matin: [
    { d: HORIZON },
    { d: DEMI_SOLEIL },
    { d: RAYONS_LEVANT },
    { d: 'M12 22.5V18.5 M10 20.5l2-2 2 2' },
  ],
  midi: [
    { cercle: { cx: 12, cy: 12, r: 4 } },
    {
      d: 'M12 2.5v2.5 M12 19v2.5 M2.5 12H5 M19 12h2.5 M5.3 5.3l1.8 1.8 M16.9 16.9l1.8 1.8 M5.3 18.7l1.8-1.8 M16.9 7.1l1.8-1.8',
    },
  ],
  soir: [
    { d: HORIZON },
    { d: DEMI_SOLEIL },
    { d: RAYONS_LEVANT },
    { d: 'M12 18.5v4 M10 20.5l2 2 2-2' },
  ],
  nuit: [{ d: 'M19.5 14.5A8 8 0 1 1 9.5 4.5a6.25 6.25 0 0 0 10 10z' }],
}
