import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import Button from '../../components/ui/Button/Button.jsx'
import Icone from '../../components/ui/Icone/Icone.jsx'
import { useOrganization } from '../../hooks/useOrganization.js'
import { descriptionEntree } from '../../router/navigation.js'
import './ModuleEnPreparation.css'

// Module inclus dans l'offre mais pas encore construit : son nom, ce qu'il fera, et rien d'autre.
export default function ModuleEnPreparation({ entree }) {
  const { structure } = useOrganization()
  const description = descriptionEntree(entree, structure.type)

  useEffect(() => {
    document.title = `${entree.libelle} — ${structure.name} — Fajkat`
  }, [entree.libelle, structure.name])

  return (
    <div className="module-en-preparation">
      <p className="module-en-preparation__surtitre">
        <Icone icone={entree.icone} className="module-en-preparation__icone" />
        Module en préparation
      </p>
      <h1 className="module-en-preparation__titre">{entree.libelle}</h1>
      {description && <p className="module-en-preparation__texte">{description}</p>}
      <p className="module-en-preparation__note">
        Il sera ajouté à votre espace dans une prochaine mise à jour, sans rien à installer.
      </p>
      <Button to="/app" variante="secondaire" iconeDebut={<Icone icone={ArrowLeft} />}>
        Revenir à la journée
      </Button>
    </div>
  )
}
