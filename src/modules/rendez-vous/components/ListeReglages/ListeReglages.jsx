import Button from '../../../../components/ui/Button/Button.jsx'
import './ListeReglages.css'

// Boutons habituels d'une ligne : « Modifier » et « Retirer » / « Remettre » (jamais de
// suppression). occupe : clé de l'action en cours dans la liste (une seule à la fois).
export function BoutonsReglage({ id, actif, occupe, enLigne, onModifier, onBasculer }) {
  const cle = `actif-${id}`
  return (
    <>
      <Button variante="discret" disabled={!enLigne || occupe !== null} onClick={onModifier}>
        Modifier
      </Button>
      <Button
        variante="discret"
        chargement={occupe === cle}
        disabled={!enLigne || (occupe !== null && occupe !== cle)}
        onClick={() => onBasculer(cle)}
      >
        {actif ? 'Retirer' : 'Remettre'}
      </Button>
    </>
  )
}

// Liste de réglages façon registre : un filet par ligne, texte à gauche, boutons à droite.
// Une ligne en cours de modification affiche son formulaire à la place (enfants).
export default function ListeReglages({ titre, children }) {
  return (
    <section className="liste-reglages" aria-label={titre}>
      {titre && <h3 className="liste-reglages__titre">{titre}</h3>}
      <ul className="liste-reglages__liste">{children}</ul>
    </section>
  )
}

export function LigneReglage({ retire = false, texte, detail, boutons, children }) {
  return (
    <li className={`liste-reglages__ligne${retire ? ' liste-reglages__ligne--retire' : ''}`}>
      {children ?? (
        <>
          <span className="liste-reglages__texte">
            <span className="liste-reglages__principal">{texte}</span>
            {detail && <span className="liste-reglages__detail">{detail}</span>}
          </span>
          {boutons && <span className="liste-reglages__boutons">{boutons}</span>}
        </>
      )}
    </li>
  )
}
