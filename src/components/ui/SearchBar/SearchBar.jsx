import { Search, X } from 'lucide-react'
import { useId, useRef } from 'react'
import Input from '../Input/Input.jsx'
import Spinner from '../Spinner/Spinner.jsx'
import './SearchBar.css'

// Barre de recherche : libellé lu par les lecteurs d'écran, bouton d'effacement,
// indicateur pendant la recherche. Entrée lance onRechercher (utile hors ligne ou sur réseau lent).
export default function SearchBar({
  valeur = '',
  onChange,
  onRechercher,
  libelle = 'Rechercher',
  placeholder,
  chargement = false,
  disabled = false,
  className = '',
}) {
  const id = `recherche-${useId()}`
  const champ = useRef(null)

  function effacer() {
    onChange?.('')
    champ.current?.focus()
  }

  function surEnvoi(evenement) {
    evenement.preventDefault()
    onRechercher?.(valeur)
  }

  let suffixe = null
  if (chargement) suffixe = <Spinner libelle="Recherche en cours" taille={18} />
  else if (valeur && !disabled) {
    suffixe = (
      <button type="button" className="search-bar__effacer" onClick={effacer}>
        <X aria-hidden="true" />
        <span className="sr-only">Effacer la recherche</span>
      </button>
    )
  }

  return (
    <form role="search" className={`search-bar ${className}`.trim()} onSubmit={surEnvoi}>
      <label htmlFor={id} className="sr-only">
        {libelle}
      </label>
      <Input
        ref={champ}
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className="search-bar__boite"
        placeholder={placeholder}
        value={valeur}
        disabled={disabled}
        onChange={(evenement) => onChange?.(evenement.target.value)}
        prefixe={<Search className="search-bar__loupe" aria-hidden="true" />}
        suffixe={suffixe}
      />
    </form>
  )
}
