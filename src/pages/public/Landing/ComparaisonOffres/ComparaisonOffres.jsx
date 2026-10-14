import { Check, Minus, Scale, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { FAMILLES, MODULES } from '../../../../lib/modules.js'
import { OFFRES, TYPES_OFFRE, prixOffreParMois } from '../../../../lib/offres.js'
import './ComparaisonOffres.css'

// Lien « Comparer les deux offres » et sa modale : tableau généré depuis modules.js et offres.js.
// <dialog> ouvert avec showModal() : le reste de la page devient inactif (le focus reste
// dans la modale) et Échap la ferme ; le focus revient ensuite sur le lien.
export default function ComparaisonOffres() {
  const modale = useRef(null)
  const declencheur = useRef(null)

  useEffect(() => {
    const dialogue = modale.current
    const surFermeture = () => declencheur.current?.focus()
    dialogue?.addEventListener('close', surFermeture)
    return () => dialogue?.removeEventListener('close', surFermeture)
  }, [])

  // Clic sur le voile, hors du contenu : la modale se ferme.
  function surClic(evenement) {
    if (evenement.target === modale.current) modale.current.close()
  }

  return (
    <>
      <button
        ref={declencheur}
        type="button"
        className="comparaison-offres__lien"
        aria-haspopup="dialog"
        onClick={() => modale.current?.showModal()}
      >
        <Scale size={18} aria-hidden="true" />
        Comparer les deux offres
      </button>

      <dialog
        ref={modale}
        className="comparaison-offres"
        aria-labelledby="comparaison-titre"
        onClick={surClic}
      >
        <div className="comparaison-offres__boite">
          <div className="comparaison-offres__tete">
            <h2 id="comparaison-titre" className="comparaison-offres__titre">
              Comparer les deux offres
            </h2>
            {/* Premier élément focalisé à l'ouverture */}
            <button
              type="button"
              className="comparaison-offres__fermer"
              autoFocus
              onClick={() => modale.current?.close()}
            >
              <X size={20} aria-hidden="true" />
              Fermer
            </button>
          </div>

          <div className="comparaison-offres__defilement">
            <table className="comparaison-offres__tableau">
              <caption className="sr-only">
                Modules inclus dans les offres Poste de santé et Clinique
              </caption>
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  {TYPES_OFFRE.map((type) => (
                    <th key={type} scope="col" className="comparaison-offres__offre">
                      {OFFRES[type].nom}
                      <span className="comparaison-offres__prix">
                        {prixOffreParMois(OFFRES[type])}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {FAMILLES.map((famille) => (
                <tbody key={famille.id}>
                  <tr className="comparaison-offres__famille">
                    <th scope="colgroup" colSpan={TYPES_OFFRE.length + 1}>
                      {famille.titre}
                    </th>
                  </tr>
                  {MODULES.filter((m) => m.famille === famille.id).map((module) => (
                    <tr key={module.code}>
                      <th scope="row" className="comparaison-offres__module">
                        {module.titre}
                      </th>
                      {TYPES_OFFRE.map((type) => (
                        <td key={type} className="comparaison-offres__case">
                          {module.offres.includes(type) ? (
                            <>
                              <Check
                                className="comparaison-offres__oui"
                                size={18}
                                aria-hidden="true"
                              />
                              <span className="sr-only">Inclus</span>
                            </>
                          ) : (
                            <>
                              <Minus
                                className="comparaison-offres__non"
                                size={18}
                                aria-hidden="true"
                              />
                              <span className="sr-only">Non inclus</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="comparaison-offres__note">
            Tous les modules sont en cours de développement (statut « Prévu »).
          </p>
        </div>
      </dialog>
    </>
  )
}
