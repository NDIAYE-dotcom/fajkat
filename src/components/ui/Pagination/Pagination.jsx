import { ChevronLeft, ChevronRight } from 'lucide-react'
import Icone from '../Icone/Icone.jsx'
import './Pagination.css'

// Pages affichées : la première, la dernière, et deux voisines de la page courante.
// « … » remplace les trous : [1, '…', 4, 5, 6, '…', 12].
function pagesVisibles(page, total) {
  const pages = new Set([1, total, page - 1, page, page + 1])
  const triees = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  return triees.flatMap((p, i) => (i > 0 && p - triees[i - 1] > 1 ? ['…', p] : [p]))
}

// Pagination de liste. total + parPage : affiche « 41–60 sur 134 ».
// Sur téléphone, les numéros laissent la place à « Page 3 sur 12 ».
export default function Pagination({
  page,
  totalPages,
  onChange,
  total,
  parPage,
  libelle = 'Pagination',
  className = '',
}) {
  if (totalPages <= 1 && !total) return null
  const debut = (page - 1) * parPage + 1
  const fin = Math.min(page * parPage, total)

  return (
    <nav className={`pagination ${className}`.trim()} aria-label={libelle}>
      {total > 0 && parPage > 0 && (
        <p className="pagination__resume">
          {debut}–{fin} sur {total}
        </p>
      )}

      <div className="pagination__commandes">
        <button
          type="button"
          className="pagination__bouton pagination__bouton--fleche"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <Icone icone={ChevronLeft} />
          Précédent
        </button>

        <ol className="pagination__pages">
          {pagesVisibles(page, totalPages).map((p, i) =>
            p === '…' ? (
              <li key={`trou-${i}`} className="pagination__trou" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  className="pagination__bouton pagination__numero"
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => onChange(p)}
                >
                  <span className="sr-only">Page </span>
                  {p}
                </button>
              </li>
            ),
          )}
        </ol>

        <p className="pagination__position">
          Page {page} sur {totalPages}
        </p>

        <button
          type="button"
          className="pagination__bouton pagination__bouton--fleche"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Suivant
          <Icone icone={ChevronRight} />
        </button>
      </div>
    </nav>
  )
}
