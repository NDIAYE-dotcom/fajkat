import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useChamp } from '../Field/useChamp.js'
import Icone from '../Icone/Icone.jsx'
import Input from '../Input/Input.jsx'
import './PasswordInput.css'

// Mot de passe avec bouton « Afficher / Masquer » (texte visible) : sur un petit clavier,
// voir ce qu'on tape évite bien des erreurs.
export default function PasswordInput({ autoComplete = 'current-password', ...props }) {
  const [visible, setVisible] = useState(false)
  const { id } = useChamp(props)

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className="password-input"
      suffixe={
        <button
          type="button"
          className="password-input__bascule"
          aria-controls={id}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((v) => !v)}
        >
          <Icone icone={visible ? EyeOff : Eye} />
          <span>{visible ? 'Masquer' : 'Afficher'}</span>
        </button>
      }
    />
  )
}
