import { ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { useVisible } from '../../../../../hooks/useVisible.js'
import { mouvementReduit } from '../../../../../lib/mouvement.js'
import TamponFrappe from '../TamponFrappe/TamponFrappe.jsx'
import './CarteOffre.css'

// Carte de choix d'une offre (maquette docs/references/maquette-choix.png).
// Choix marketing : aucun prix sur l'écran d'accueil, il est présenté sur la page de l'offre.
// La carte entière est le bouton ; l'aperçu animé se met en pause hors de l'écran.
// etat : 'repos' | 'frappe' (cette carte vient d'être tamponnée) | 'estompe' (l'autre l'a été).
export default function CarteOffre({
  offre,
  apercu: Apercu,
  image,
  imageMobile,
  rang,
  rappel,
  etat = 'repos',
  onChoisir,
}) {
  const ref = useRef(null)
  const visible = useVisible(ref)
  const libelle = [
    `Découvrir toutes les fonctionnalités de l’offre ${offre.nom}`,
    rappel && 'dernière offre consultée',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      ref={ref}
      type="button"
      className={`carte-offre carte-offre--${offre.type} carte-offre--${etat}`}
      style={{ '--rang': rang }}
      data-visible={visible || undefined}
      aria-label={libelle}
      aria-disabled={etat !== 'repos' || undefined}
      onClick={() => etat === 'repos' && onChoisir(offre.type)}
    >
      {/* Fond dégradé et illustration, découpés aux coins de la carte */}
      <span className="carte-offre__feuille">
        <span className="carte-offre__cercle">
          {/* Téléphone : image dédiée, même point de bascule que le CSS (40rem). */}
          <picture>
            <source media="(max-width: 40rem)" srcSet={imageMobile} width="480" height="320" />
            <img
              className="carte-offre__image"
              src={image}
              alt=""
              width="720"
              height="480"
              decoding="async"
            />
          </picture>
        </span>
      </span>

      <span className="carte-offre__tete">
        <span className="carte-offre__surtitre">
          <span className="carte-offre__reperage">{offre.choix.reperage}</span>
          {rappel && <span className="carte-offre__rappel">Déjà consultée</span>}
        </span>
        <span className="carte-offre__nom">{offre.nom}</span>
      </span>

      <span className="carte-offre__apercu">
        <Apercu actif={visible && etat !== 'estompe'} statique={mouvementReduit()} />
      </span>

      <span className="carte-offre__bouton" aria-hidden="true">
        Découvrir toutes les fonctionnalités
        <ArrowRight size={22} />
      </span>

      {etat === 'frappe' && (
        <TamponFrappe className="carte-offre__tampon">{offre.nom}</TamponFrappe>
      )}
    </button>
  )
}
