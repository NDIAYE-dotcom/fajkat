import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../../../hooks/useToast.js'
import { dialogueDuDessus } from '../../../../lib/dialoguesOuverts.js'
import BoutonIcone from '../../../ui/BoutonIcone/BoutonIcone.jsx'
import SearchBar from '../../../ui/SearchBar/SearchBar.jsx'
import './RechercheGlobale.css'

// La touche « / » ne doit pas voler la frappe d'un champ en cours de saisie.
function estChampDeSaisie(element) {
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

// Recherche globale des patients. Le champ est prêt ; il sera branché sur les dossiers
// patients à l'étape 11. Sur téléphone, une loupe ouvre le champ sous l'en-tête.
// Raccourci : « / » place le curseur dans le champ, depuis n'importe quel écran.
export default function RechercheGlobale() {
  const toast = useToast()
  const [valeur, setValeur] = useState('')
  const [ouverte, setOuverte] = useState(false)
  const zone = useRef(null)

  const champ = () => zone.current?.querySelector('input')

  useEffect(() => {
    function surTouche(evenement) {
      if (evenement.key !== '/' || evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
        return
      }
      if (estChampDeSaisie(evenement.target) || dialogueDuDessus()) return
      evenement.preventDefault()
      setOuverte(true)
      requestAnimationFrame(() => champ()?.focus())
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [])

  function ouvrir() {
    setOuverte(true)
    requestAnimationFrame(() => champ()?.focus())
  }

  function surTouchesChamp(evenement) {
    if (evenement.key === 'Escape') {
      setOuverte(false)
      champ()?.blur()
    }
  }

  function rechercher() {
    if (!valeur.trim()) return
    toast.info('La recherche des patients arrive bientôt', {
      message: 'Elle sera disponible avec l’ouverture du module Patients.',
    })
  }

  return (
    <div className={`recherche-globale${ouverte ? ' recherche-globale--ouverte' : ''}`}>
      <BoutonIcone
        icone={Search}
        label="Rechercher un patient"
        className="recherche-globale__loupe"
        aria-expanded={ouverte}
        onClick={ouverte ? () => setOuverte(false) : ouvrir}
      />
      {/* onKeyDown sur l'enveloppe : SearchBar ne transmet pas les événements du champ. */}
      <div ref={zone} className="recherche-globale__champ" onKeyDown={surTouchesChamp}>
        <SearchBar
          valeur={valeur}
          onChange={setValeur}
          onRechercher={rechercher}
          libelle="Rechercher un patient"
          placeholder="Rechercher un patient"
        />
        {!valeur && (
          <kbd className="recherche-globale__touche" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
    </div>
  )
}
