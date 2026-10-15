import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import StepIndicator from '../../../../components/ui/StepIndicator/StepIndicator.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import ImportApercu from '../../components/ImportApercu/ImportApercu.jsx'
import ImportFichier from '../../components/ImportFichier/ImportFichier.jsx'
import ImportResultat from '../../components/ImportResultat/ImportResultat.jsx'
import { useImportPatients } from '../../hooks/useImportPatients.js'
import { usePermissionsPatients } from '../../hooks/usePermissionsPatients.js'
import './ImportPatients.css'

const ENTREE = entreeDepuisChemin('/app/patients')
const ETAPES = ['Fichier', 'Aperçu', 'Import']
const INDEX = { fichier: 0, apercu: 1, envoi: 2, resultat: 2 }

export default function ImportPatients() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={['owner', 'admin']} libelle="Import d’une liste de patients">
        <Import />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Import d'une liste de patients (Excel ou CSV), réservé à owner et admin. Aucune saisie
// gardée sur l'appareil : le fichier contient des données de patients, il suffit de le
// choisir de nouveau.
function Import() {
  const { structure } = useOrganization()
  const droits = usePermissionsPatients(structure.id)
  const imp = useImportPatients(structure.id, structure.country_code)

  useEffect(() => {
    document.title = `Importer des patients — ${structure.name} — Fajkat`
  }, [structure.name])

  // Fermer l'onglet pendant l'envoi interromprait l'import : le navigateur demande confirmation.
  useEffect(() => {
    if (imp.etape !== 'envoi') return undefined
    const retenir = (e) => e.preventDefault()
    window.addEventListener('beforeunload', retenir)
    return () => window.removeEventListener('beforeunload', retenir)
  }, [imp.etape])

  if (droits.chargement) return <Spinner libelle="Chargement de vos droits" />
  if (!droits.importer) return <Navigate to="/app/patients" replace />

  return (
    <div className="import-patients">
      <header className="import-patients__entete">
        <Link to="/app/patients" className="import-patients__retour">
          <Icone icone={ArrowLeft} />
          Registre des patients
        </Link>
        <h1 className="import-patients__titre">Importer une liste de patients</h1>
        <p className="import-patients__intro">
          Votre registre tenu sous Excel entre dans Fajkat en une fois. Vous vérifiez chaque ligne
          avant l’enregistrement.
        </p>
      </header>

      <StepIndicator etapes={ETAPES} courante={INDEX[imp.etape]} libelle="Étapes de l’import" />

      {imp.etape === 'fichier' && (
        <ImportFichier lecture={imp.lecture} onChoisir={imp.choisirFichier} />
      )}
      {imp.etape === 'apercu' && (
        <ImportApercu
          fichier={imp.fichier}
          lignes={imp.lignes}
          erreurEnvoi={imp.erreurEnvoi}
          onDecider={imp.decider}
          onToutDecider={imp.toutDecider}
          onConfirmer={imp.confirmer}
          onAnnuler={imp.recommencer}
        />
      )}
      {(imp.etape === 'envoi' || imp.etape === 'resultat') && (
        <ImportResultat
          fichier={imp.fichier}
          envoi={imp.envoi}
          resultat={imp.resultat}
          onRecommencer={imp.recommencer}
        />
      )}
    </div>
  )
}
