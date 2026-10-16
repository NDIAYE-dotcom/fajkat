import Button from '../../../../components/ui/Button/Button.jsx'
import './GrilleFormulaire.css'

// Petit formulaire de réglage en grille (une ligne d'une liste de paramètres) : champs,
// erreur générale au-dessus des boutons, « Annuler » et bouton d'envoi.
export default function GrilleFormulaire({
  onSubmit,
  onAnnuler,
  erreur,
  envoi,
  libelleEnvoi,
  children,
}) {
  return (
    <form className="grille-formulaire" onSubmit={onSubmit} noValidate>
      {children}
      {erreur && (
        <p className="grille-formulaire__erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="grille-formulaire__boutons">
        {onAnnuler && (
          <Button variante="discret" onClick={onAnnuler}>
            Annuler
          </Button>
        )}
        <Button type="submit" chargement={envoi}>
          {libelleEnvoi}
        </Button>
      </div>
    </form>
  )
}
