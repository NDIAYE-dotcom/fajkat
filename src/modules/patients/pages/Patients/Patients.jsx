import { FileUp, SearchX, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Pagination from '../../../../components/ui/Pagination/Pagination.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { PAR_PAGE } from '../../api.js'
import ListePatients from '../../components/ListePatients/ListePatients.jsx'
import ModaleNouveauPatient from '../../components/ModaleNouveauPatient/ModaleNouveauPatient.jsx'
import { usePermissionsPatients } from '../../hooks/usePermissionsPatients.js'
import {
  LONGUEUR_MIN_RECHERCHE,
  requeteSuffisante,
  useRecherchePatients,
} from '../../hooks/useRecherchePatients.js'
import './Patients.css'

const ENTREE = entreeDepuisChemin('/app/patients')

export default function Patients() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <RegistrePatients />
      </RoleRoute>
    </FeatureRoute>
  )
}

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

// Registre des patients. L'adresse porte l'état : ?q= (recherche), ?page=, ?nouveau=1
// (création) — la recherche de l'en-tête y mène. Un patient s'ouvre dans sa fiche
// (/app/patients/<id>) ; l'ancien ?patient=<id> y redirige.
function RegistrePatients() {
  const { structure } = useOrganization()
  const toast = useToast()
  const orgId = structure.id
  const droits = usePermissionsPatients(orgId)
  const naviguer = useNavigate()
  const [parametres, setParametres] = useSearchParams()
  const [saisie, setSaisie] = useState(() => parametres.get('q') ?? '')
  const page = Math.max(1, Number(parametres.get('page')) || 1)
  const ancienLien = parametres.get('patient')
  const creation = parametres.get('nouveau') === '1' && droits.ecrire

  const recherche = useRecherchePatients(orgId, saisie, { page })
  const totalPages = Math.max(1, Math.ceil(recherche.total / PAR_PAGE))

  useEffect(() => {
    document.title = `Patients — ${structure.name} — Fajkat`
  }, [structure.name])

  // La recherche de l'en-tête change ?q= alors que la page est déjà ouverte.
  const qAdresse = parametres.get('q') ?? ''
  const [qVu, setQVu] = useState(qAdresse)
  if (qAdresse !== qVu) {
    setQVu(qAdresse)
    setSaisie(qAdresse)
  }

  function changer(modif) {
    setParametres(
      (p) => {
        const suivant = new URLSearchParams(p)
        for (const [cle, valeur] of Object.entries(modif)) {
          if (valeur === null || valeur === '') suivant.delete(cle)
          else suivant.set(cle, String(valeur))
        }
        return suivant
      },
      { replace: true },
    )
  }

  function surSaisie(valeur) {
    setSaisie(valeur)
    setQVu(valeur.trim())
    changer({ q: valeur.trim(), page: null })
  }

  if (ancienLien) return <Navigate to={`/app/patients/${ancienLien}`} replace />

  const enRecherche = requeteSuffisante(saisie)
  let resume = 'Derniers dossiers ouverts'
  if (saisie.trim() && !enRecherche) {
    resume = `Tapez au moins ${LONGUEUR_MIN_RECHERCHE} lettres ou chiffres pour chercher.`
  } else if (enRecherche && !recherche.chargement) {
    resume = `${pluriel(recherche.total, 'patient')} pour « ${recherche.requeteLancee} »`
  }

  const boutonNouveau = droits.ecrire && (
    <Button iconeDebut={<Icone icone={UserPlus} />} onClick={() => changer({ nouveau: 1 })}>
      Nouveau patient
    </Button>
  )

  return (
    <div className="patients">
      <header className="patients__entete">
        <div>
          <p className="patients__surtitre">{structure.name}</p>
          <h1 className="patients__titre">Patients</h1>
        </div>
        <div className="patients__actions">
          {droits.importer && (
            <Button
              variante="secondaire"
              to="/app/patients/import"
              iconeDebut={<Icone icone={FileUp} />}
            >
              Importer une liste
            </Button>
          )}
          {boutonNouveau}
        </div>
      </header>

      <div className="patients__recherche">
        <SearchBar
          valeur={saisie}
          onChange={surSaisie}
          onRechercher={() => recherche.relancer()}
          chargement={recherche.enCours}
          libelle="Rechercher dans le registre"
          placeholder="Nom, prénom, téléphone, n° de dossier, quartier, mère…"
        />
        <p className="patients__resume" role="status">
          {resume}
        </p>
      </div>

      {recherche.erreur ? (
        <Message
          ton="erreur"
          titre="Le registre n’a pas pu être chargé"
          action={<Button onClick={() => recherche.relancer()}>Réessayer</Button>}
        >
          <p>{recherche.erreur.message}</p>
        </Message>
      ) : (
        <>
          <ListePatients
            lignes={recherche.lignes}
            chargement={recherche.chargement}
            legende={resume}
            onOuvrir={(id) => naviguer(`/app/patients/${id}`)}
            vide={
              <EmptyState
                icone={SearchX}
                titre={enRecherche ? 'Aucun patient trouvé' : 'Le registre est vide'}
                texte={
                  enRecherche
                    ? 'Vérifiez l’orthographe, ou cherchez par téléphone, quartier ou prénom de la mère.'
                    : 'Les patients enregistrés apparaîtront ici.'
                }
                action={boutonNouveau || null}
              />
            }
          />
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={recherche.total}
            parPage={PAR_PAGE}
            libelle="Pages du registre"
            onChange={(p) => changer({ page: p > 1 ? p : null })}
          />
        </>
      )}

      {creation && (
        <ModaleNouveauPatient
          orgId={orgId}
          ouvert
          onFermer={() => changer({ nouveau: null })}
          onOuvrir={(id) => naviguer(`/app/patients/${id}`)}
          onCree={(patient) => {
            toast.succes(`Dossier ${patient.file_number} créé`, {
              message: `${patient.first_name} ${patient.last_name} est inscrit au registre.`,
            })
            naviguer(`/app/patients/${patient.id}`)
          }}
        />
      )}
    </div>
  )
}
