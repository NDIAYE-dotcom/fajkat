import { useCurseurChiffres } from '../../../hooks/useCurseurChiffres.js'
import { formatNombre } from '../../../lib/format.js'
import Input from '../Input/Input.jsx'
import './MoneyInput.css'

// Au-delà, les entiers JavaScript perdent en précision ; aucun montant réel n'en approche.
const CHIFFRES_MAX = 12

// Montant en FCFA : entier positif uniquement (pas de centimes), affiché « 12 500 ».
// Valeur : nombre entier, ou null si le champ est vide.
export default function MoneyInput({ value = null, onChange, ref, ...props }) {
  const { ref: refChamp, memoriser } = useCurseurChiffres(ref)

  function surSaisie(evenement) {
    memoriser(evenement)
    const chiffres = evenement.target.value
      .replace(/\D/g, '')
      .replace(/^0+(?=\d)/, '')
      .slice(0, CHIFFRES_MAX)
    onChange?.(chiffres === '' ? null : Number(chiffres))
  }

  return (
    <Input
      {...props}
      ref={refChamp}
      inputMode="numeric"
      autoComplete="off"
      mono
      className="money-input"
      value={formatNombre(value)}
      onChange={surSaisie}
      suffixe={<span className="money-input__devise">FCFA</span>}
    />
  )
}
