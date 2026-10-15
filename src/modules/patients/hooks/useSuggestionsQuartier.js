import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useOrganization } from '../../../hooks/useOrganization.js'
import { cles, suggererQuartiers } from '../api.js'
import { useValeurDifferee } from './useRecherchePatients.js'

const DELAI_FRAPPE = 200
const HAUTEUR_LISTE = 240 // px : en dessous, la liste s'ouvre au-dessus du champ

function cle(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Suggestions de quartier pendant la frappe (motif combobox) : quartiers déjà saisis dans
// la structure, les plus fréquents d'abord. On peut toujours taper un nouveau quartier.
// Renvoie les propriétés du champ (à poser sur un Input ou un <input>) et celles de la
// liste (SuggestionsQuartier). Flèches, Entrée et Échap ne servent la liste que lorsqu'elle
// est affichée : sinon l'événement reste libre (navigation de la grille du registre).
// La liste est en position fixe : elle sort du cadre défilant de la grille ou d'une modale.
export function useSuggestionsQuartier(valeur, onChange) {
  const { structure } = useOrganization()
  const orgId = structure?.id
  const [ouverte, setOuverte] = useState(false)
  const [actifChoisi, setActif] = useState(-1)
  const [position, setPosition] = useState(null)
  const champ = useRef(null)
  const idListe = `suggestions-quartier-${useId()}`

  const saisie = (valeur ?? '').trim()
  const q = useValeurDifferee(saisie, DELAI_FRAPPE)
  const lance = ouverte && Boolean(orgId) && q.length >= 1
  const requete = useQuery({
    queryKey: cles.quartiers(orgId, cle(q)),
    queryFn: () => suggererQuartiers(orgId, q),
    enabled: lance,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
  // Le quartier déjà tapé en entier n'est pas proposé une seconde fois.
  const options = lance
    ? (requete.data ?? []).filter((o) => cle(o.neighborhood) !== cle(saisie))
    : []
  const afficher = ouverte && saisie !== '' && options.length > 0
  // La liste a pu raccourcir depuis le dernier déplacement au clavier.
  const actif = actifChoisi < options.length ? actifChoisi : -1

  // Liste placée sous le champ (au-dessus s'il n'y a pas la place), recalculée au défilement.
  useLayoutEffect(() => {
    if (!afficher) return undefined
    function placer() {
      const r = champ.current?.getBoundingClientRect()
      if (!r) return
      const dessous = window.innerHeight - r.bottom
      const auDessus = dessous < HAUTEUR_LISTE && r.top > dessous
      setPosition({
        left: r.left,
        width: Math.max(r.width, 192),
        ...(auDessus ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      })
    }
    placer()
    window.addEventListener('scroll', placer, true)
    window.addEventListener('resize', placer)
    return () => {
      window.removeEventListener('scroll', placer, true)
      window.removeEventListener('resize', placer)
    }
  }, [afficher])

  function fermer() {
    setOuverte(false)
    setActif(-1)
  }

  function choisir(option) {
    onChange(option.neighborhood)
    fermer()
  }

  function surTouche(e) {
    if (!afficher) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const pas = e.key === 'ArrowDown' ? 1 : -1
      const n = options.length
      setActif((i) => (i < 0 ? (pas > 0 ? 0 : n - 1) : (i + pas + n) % n))
    } else if (e.key === 'Enter' && options[actif]) {
      e.preventDefault()
      choisir(options[actif])
    } else if (e.key === 'Escape') {
      // Ferme la liste, pas la modale qui contient le champ.
      e.preventDefault()
      e.stopPropagation()
      fermer()
    } else if (e.key === 'Tab') {
      fermer()
    }
  }

  const idOption = (i) => `${idListe}-${i}`

  return {
    champ: {
      ref: champ,
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': afficher,
      'aria-controls': idListe,
      'aria-activedescendant': afficher && options[actif] ? idOption(actif) : undefined,
      onChange: (e) => {
        onChange(e.target.value)
        setOuverte(true)
        setActif(-1)
      },
      onKeyDown: surTouche,
      onBlur: fermer,
    },
    liste: {
      id: idListe,
      visible: afficher,
      options,
      actif,
      idOption,
      position,
      onChoisir: choisir,
      onSurvol: setActif,
    },
  }
}
