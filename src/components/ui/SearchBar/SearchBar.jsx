import { Search, X } from 'lucide-react'
import { useId, useRef } from 'react'
import Input from '../Input/Input.jsx'
import Spinner from '../Spinner/Spinner.jsx'
import BoutonIcone from '../BoutonIcone/BoutonIcone.jsx'
import Icone from '../Icone/Icone.jsx'
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
    suffixe = <BoutonIcone icone={X} label="Effacer la recherche" onClick={effacer} />
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
        prefixe={<Icone icone={Search} className="search-bar__loupe" />}
        suffixe={suffixe}
      />
    </form>
  )
}
