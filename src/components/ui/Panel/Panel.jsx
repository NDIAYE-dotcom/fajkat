import { useId } from 'react'
import './Panel.css'

// Panneau de contenu (fiche patient, résumé de caisse…).
// marque : marge colorée à gauche, réservée aux panneaux importants (signature « registre »).
// ton « surface » : fond menthe pour détacher un panneau secondaire.
export default function Panel({
  titre,
  sousTitre,
  actions,
  pied,
  niveau = 2,
  marque = false,
  ton = 'fond',
  className = '',
  children,
  ...props
}) {
  const idTitre = useId()
  const Titre = `h${niveau}`
  const classes = ['panel', `panel--${ton}`, marque && 'panel--marque', className]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes} aria-labelledby={titre ? idTitre : undefined} {...props}>
      {(titre || actions) && (
        <header className="panel__entete">
          <div className="panel__titres">
            {titre && (
              <Titre id={idTitre} className="panel__titre">
                {titre}
              </Titre>
            )}
            {sousTitre && <p className="panel__sous-titre">{sousTitre}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__corps">{children}</div>
      {pied && <footer className="panel__pied">{pied}</footer>}
    </section>
  )
}
