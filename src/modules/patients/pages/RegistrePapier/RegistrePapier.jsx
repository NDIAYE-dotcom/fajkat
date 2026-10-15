import { ArrowLeft, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleNonInclus from '../../../../components/layout/ModuleNonInclus/ModuleNonInclus.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import StepIndicator from '../../../../components/ui/StepIndicator/StepIndicator.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatHeure } from '../../../../lib/format.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import GrilleRegistre from '../../components/GrilleRegistre/GrilleRegistre.jsx'
import ImportApercu from '../../components/ImportApercu/ImportApercu.jsx'
import RepereRegistre from '../../components/RepereRegistre/RepereRegistre.jsx'
import ResultatRegistre from '../../components/ResultatRegistre/ResultatRegistre.jsx'
import { estVide } from '../../import/registre.js'
import { usePermissionsPatients } from '../../hooks/usePermissionsPatients.js'
import { useSaisieRegistre } from '../../hooks/useSaisieRegistre.js'
import './RegistrePapier.css'

const ENTREE = entreeDepuisChemin('/app/patients')
const ETAPES = ['Saisie', 'Aperçu', 'Enregistrement']
const INDEX = { saisie: 0, apercu: 1, envoi: 2, resultat: 2 }
const LIBELLE = 'Recopier un registre papier'

export default function RegistrePapier() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <Garde />
    </FeatureRoute>
  )
}

// Ouvert aux rôles qui créent un patient : une page recopiée vaut plusieurs créations
// rapides, chacune journalisée.
function Garde() {
  const { structure } = useOrganization()
  const droits = usePermissionsPatients(structure.id)
  if (droits.chargement) return <Spinner libelle="Chargement de vos droits" />
  if (!droits.ecrire) return <ModuleNonInclus libelle={LIBELLE} raison="role" />
  return <Saisie structure={structure} />
}

function Saisie({ structure }) {
  const reg = useSaisieRegistre(structure.id, structure.country_code)
  const { saisie, brouillon } = reg
  const nonVides = saisie.lignes.filter((l) => !estVide(l)).length
  const enErreur = Object.keys(reg.erreursLignes).length
  // Saisie retrouvée à l'ouverture (coupure, rechargement) : annoncée jusqu'à l'envoi.
  const [retrouvee, setRetrouvee] = useState(() => brouillon.restaure && nonVides > 0)

  useEffect(() => {
    document.title = `${LIBELLE} — ${structure.name} — Fajkat`
  }, [structure.name])

  // Fermer l'onglet pendant l'envoi laisserait la page à moitié enregistrée.
  useEffect(() => {
    if (reg.etape !== 'envoi') return undefined
    const retenir = (e) => e.preventDefault()
    window.addEventListener('beforeunload', retenir)
    return () => window.removeEventListener('beforeunload', retenir)
  }, [reg.etape])

  return (
    <div className="registre-papier">
      <header className="registre-papier__entete">
        <Link to="/app/patients" className="registre-papier__retour">
          <Icone icone={ArrowLeft} />
          Registre des patients
        </Link>
        <h1 className="registre-papier__titre">{LIBELLE}</h1>
        <p className="registre-papier__intro">
          Recopiez une page, une ligne par patient. Votre saisie reste gardée sur cet appareil en
          cas de coupure. Rien n’est enregistré avant votre confirmation.
        </p>
      </header>

      <StepIndicator etapes={ETAPES} courante={INDEX[reg.etape]} libelle="Étapes de la saisie" />

      {reg.etape === 'saisie' && (
        <>
          {retrouvee && brouillon.enregistreLe && (
            <Message ton="info">
              <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
            </Message>
          )}
          <RepereRegistre
            annee={saisie.annee}
            page={saisie.page}
            erreurs={reg.erreursRepere}
            onChange={reg.modifierRepere}
          />
          <GrilleRegistre
            lignes={saisie.lignes}
            erreursLignes={reg.erreursLignes}
            onModifier={reg.modifierCellule}
            onSupprimer={reg.supprimerLigne}
            onAjouter={reg.ajouterLigne}
          />

          {reg.verification.erreur && <Message ton="erreur">{reg.verification.erreur}</Message>}
          {enErreur > 0 && !reg.verification.enCours && (
            <Message
              ton="erreur"
              titre={enErreur > 1 ? `${enErreur} lignes à corriger` : 'Une ligne à corriger'}
              action={
                <Button variante="secondaire" onClick={() => reg.verifier({ continuer: true })}>
                  Continuer sans ces lignes
                </Button>
              }
            >
              <p>
                La raison est écrite sous chaque ligne. Vous pouvez aussi continuer : ces lignes
                resteront dans la grille.
              </p>
            </Message>
          )}

          <div className="registre-papier__actions">
            <Button
              iconeDebut={<Icone icone={ListChecks} />}
              chargement={reg.verification.enCours}
              disabled={nonVides === 0}
              onClick={() => reg.verifier()}
            >
              Vérifier la page
            </Button>
          </div>
        </>
      )}

      {reg.etape === 'apercu' && (
        <ImportApercu
          source="registre"
          fichier={{ nom: reg.libelleRepere, inconnues: [] }}
          lignes={reg.apercu}
          erreurEnvoi={reg.erreurEnvoi}
          onDecider={reg.decider}
          onToutDecider={reg.toutDecider}
          onConfirmer={reg.confirmer}
          onAnnuler={reg.retourGrille}
        />
      )}
      {(reg.etape === 'envoi' || reg.etape === 'resultat') && (
        <ResultatRegistre
          envoi={reg.envoi}
          resultat={reg.resultat}
          lignes={reg.apercu}
          pageSuivante={reg.resultat?.restantes ? null : saisie.page}
          onContinuer={() => {
            setRetrouvee(false)
            reg.retourGrille()
          }}
        />
      )}
    </div>
  )
}
