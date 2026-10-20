import { useEffect, useId, useState } from 'react'
import Input from '../../../../components/ui/Input/Input.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useSuggestionsMedicaments } from '../../hooks/useOrdonnance.js'
import './ChampMedicament.css'

// Nom du médicament en texte libre, avec les noms déjà prescrits dans la structure
// (liste déroulante au clavier : flèches, Entrée pour choisir, Échap pour fermer). Entrée
// sans suggestion choisie laisse passer au champ suivant (géré par la ligne).
// Étape 17 : produits du catalogue de la pharmacie et stock (« 12 en stock ») dans la même
// liste ; la place est prévue (suggestion.stock), rien n'est affiché tant qu'il est nul.
export default function ChampMedicament({ orgId, valeur, onChange, onChoisir, ref, ...props }) {
  const id = useId()
  const enLigne = useEnLigne()
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const requete = useSuggestionsMedicaments(orgId, texte, enLigne && ouvert && !props.disabled)
  const suggestions = texte.length >= 2 ? (requete.data ?? []) : []
  const visible = ouvert && suggestions.length > 0

  // Suggestions demandées 250 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => setTexte(valeur.trim().length >= 2 ? valeur.trim() : ''), 250)
    return () => clearTimeout(t)
  }, [valeur])

  function choisir(s) {
    onChoisir(s)
    setOuvert(false)
    setActif(-1)
  }

  function surTouche(e) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setOuvert(true)
      setActif((a) => (a + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault()
      setActif((a) => (a <= 0 ? suggestions.length - 1 : a - 1))
    } else if (e.key === 'Enter' && visible && actif >= 0) {
      e.preventDefault()
      e.stopPropagation()
      choisir(suggestions[actif])
    } else if (e.key === 'Escape' && visible) {
      e.preventDefault()
      e.stopPropagation()
      setOuvert(false)
    }
  }

  return (
    <div className="champ-medicament">
      <Input
        ref={ref}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={`${id}-liste`}
        aria-activedescendant={visible && actif >= 0 ? `${id}-${actif}` : undefined}
        autoComplete="off"
        maxLength={120}
        value={valeur}
        onChange={(e) => {
          onChange(e.target.value)
          setOuvert(true)
          setActif(-1)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={surTouche}
        {...props}
      />
      <ul id={`${id}-liste`} role="listbox" className="champ-medicament__liste" hidden={!visible}>
        {visible &&
          suggestions.map((s, i) => (
            <li
              key={`${s.product_name}-${s.dosage ?? ''}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === actif}
              className={`champ-medicament__option${i === actif ? ' champ-medicament__option--actif' : ''}`}
              // mousedown : choisir avant que le champ perde le focus.
              onMouseDown={(e) => {
                e.preventDefault()
                choisir(s)
              }}
            >
              <span className="champ-medicament__nom">{s.product_name}</span>
              {[s.dosage, s.form].some(Boolean) && (
                <span className="champ-medicament__detail">
                  {[s.dosage, s.form].filter(Boolean).join(' · ')}
                </span>
              )}
              {s.stock !== null && s.stock !== undefined && (
                <span className="champ-medicament__stock">{`${s.stock} en stock`}</span>
              )}
            </li>
          ))}
      </ul>
    </div>
  )
}
