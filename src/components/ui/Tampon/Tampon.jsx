import './Tampon.css'

// Statuts courants : libellé et ton par défaut. Le texte reste toujours écrit :
// la couleur ne porte jamais seule l'information (impression noir et blanc, daltonisme).
const STATUTS = {
  paye: { libelle: 'Payé', ton: 'primaire' },
  urgent: { libelle: 'Urgent', ton: 'alerte' },
  vaccine: { libelle: 'Vacciné', ton: 'primaire' },
  refere: { libelle: 'Référé', ton: 'encre' },
  annule: { libelle: 'Annulé', ton: 'neutre' },
}

// Badge façon tampon encreur : PAYÉ, URGENT, VACCINÉ, RÉFÉRÉ, ANNULÉ, EN DÉVELOPPEMENT…
// statut : une des clés ci-dessus (libellé fourni) ; sinon ton + children.
// Tons : alerte (rouge tampon), primaire (sarcelle), encre (texte), neutre (encre douce).
export default function Tampon({ statut, ton, className = '', children }) {
  const preset = STATUTS[statut]
  const tonFinal = ton ?? preset?.ton ?? 'alerte'
  const classes = ['tampon', `tampon--${tonFinal}`, statut && `tampon--${statut}`, className]
    .filter(Boolean)
    .join(' ')
  return <span className={classes}>{children ?? preset?.libelle}</span>
}
