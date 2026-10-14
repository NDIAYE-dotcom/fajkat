import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { formatHeure } from '../../../../lib/format.js'
import './EtapeCadre.css'

// Cadre commun des écrans de l'assistant : titre, raison de la demande (une phrase),
// brouillon retrouvé, erreur d'envoi, et les trois actions (précédent, passer, enregistrer).
export default function EtapeCadre({
  titre,
  pourquoi,
  brouillon,
  erreur,
  envoi = false,
  libelleEnvoi = 'Enregistrer et continuer',
  onEnvoyer,
  onPasser,
  onPrecedent,
  children,
}) {
  // Nouvel écran : le focus va sur son titre (clavier, lecteurs d'écran).
  const refTitre = useRef(null)
  useEffect(() => {
    refTitre.current?.focus()
  }, [])

  function surEnvoi(evenement) {
    evenement.preventDefault()
    onEnvoyer()
  }

  return (
    <form className="etape-cadre" noValidate onSubmit={surEnvoi}>
      <header className="etape-cadre__entete">
        <h2 ref={refTitre} tabIndex={-1} className="etape-cadre__titre">
          {titre}
        </h2>
        <p className="etape-cadre__pourquoi">{pourquoi}</p>
      </header>

      {brouillon?.restaure && brouillon.enregistreLe && (
        <Message ton="info">
          <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          <Button variante="discret" onClick={brouillon.effacer}>
            Revenir aux informations enregistrées
          </Button>
        </Message>
      )}

      <div className="etape-cadre__corps">{children}</div>

      {erreur && (
        <Message ton="erreur" titre="L’enregistrement n’a pas abouti">
          <p>{erreur}</p>
          <p>Votre saisie est conservée sur cet appareil.</p>
        </Message>
      )}

      <footer className="etape-cadre__actions">
        {onPrecedent && (
          <Button
            variante="discret"
            iconeDebut={<Icone icone={ArrowLeft} />}
            onClick={onPrecedent}
            disabled={envoi}
          >
            Précédent
          </Button>
        )}
        <span className="etape-cadre__droite">
          {onPasser && (
            <Button variante="secondaire" onClick={onPasser} disabled={envoi}>
              Passer pour l’instant
            </Button>
          )}
          <Button type="submit" chargement={envoi}>
            {libelleEnvoi}
          </Button>
        </span>
      </footer>
    </form>
  )
}
