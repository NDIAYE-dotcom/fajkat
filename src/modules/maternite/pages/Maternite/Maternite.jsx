import { Baby, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Pagination from '../../../../components/ui/Pagination/Pagination.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import ReserveAuxSoignants from '../../../consultations/components/ReserveAuxSoignants/ReserveAuxSoignants.jsx'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { PAGE_EN_COURS } from '../../api.js'
import ReglagesMaternite from '../../components/ReglagesMaternite/ReglagesMaternite.jsx'
import { formatSA, LIBELLES_DATATION } from '../../grossesse.js'
import { useGrossessesEnCours, usePermissionsMaternite } from '../../hooks/useMaternite.js'
import './Maternite.css'

const ENTREE = entreeDepuisChemin('/app/maternite')

export default function Maternite() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageMaternite />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Maternité : grossesses en cours (rôles médicaux) et réglages (owner, admin, sage-femme).
// L'owner ou l'admin qui n'exerce pas voit les réglages seulement : aucune requête sur les
// patientes n'est faite pour lui.
function PageMaternite() {
  const { structure } = useOrganization()
  const toast = useToast()
  const droits = usePermissionsMaternite(structure.id)
  const [parametres, setParametres] = useSearchParams()

  useEffect(() => {
    document.title = `Maternité — ${structure.name} — Fajkat`
  }, [structure.name])

  if (droits.chargement) return <EcranAttente integre libelle="Ouverture de la maternité…" />
  if (droits.erreur) {
    return (
      <EcranAttente
        integre
        libelle="La maternité n’a pas pu être ouverte"
        erreur={droits.erreur.message}
      />
    )
  }
  if (!droits.lire && !droits.configurer) {
    return (
      <ReserveAuxSoignants
        titre="Le suivi de grossesse est réservé aux soignants"
        texte="Le suivi des grossesses est couvert par le secret médical."
      />
    )
  }

  const onglets = [
    {
      id: 'en-cours',
      libelle: 'Grossesses en cours',
      contenu: droits.lire ? (
        <GrossessesEnCours orgId={structure.id} />
      ) : (
        <ReserveAuxSoignants
          titre="Le suivi de grossesse est réservé aux soignants"
          texte="Le suivi des grossesses est couvert par le secret médical."
        />
      ),
    },
    droits.configurer && {
      id: 'reglages',
      libelle: 'Réglages',
      contenu: (
        <ReglagesMaternite
          structure={structure}
          suivant={() => toast.succes('Maternité : modifications enregistrées')}
        />
      ),
    },
  ].filter(Boolean)
  const demande = parametres.get('onglet')
  const actif = onglets.some((o) => o.id === demande) ? demande : onglets[0].id

  return (
    <div className="maternite">
      <header className="maternite__entete">
        <p className="maternite__surtitre">{structure.name}</p>
        <h1 className="maternite__titre">Maternité</h1>
      </header>
      <Tabs
        libelle="Rubriques de la maternité"
        actif={actif}
        onChange={(id) => setParametres({ onglet: id }, { replace: true })}
        onglets={onglets}
      />
    </div>
  )
}

function GrossessesEnCours({ orgId }) {
  const [parametres, setParametres] = useSearchParams()
  const [saisie, setSaisie] = useState(() => parametres.get('q') ?? '')
  const texte = saisie.trim()
  const page = Math.max(1, Number(parametres.get('page')) || 1)
  const requete = useGrossessesEnCours(orgId, texte, page, true)
  const total = requete.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_EN_COURS))

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

  const colonnes = [
    {
      cle: 'nom',
      titre: 'Patiente',
      principale: true,
      rendu: (g) => (
        <Link className="maternite__nom" to={`/app/patients/${g.patient_id}?onglet=grossesse`}>
          {nomComplet(g)}
        </Link>
      ),
    },
    {
      cle: 'file_number',
      titre: 'N° de dossier',
      rendu: (g) => <span className="maternite__chiffres">{g.file_number}</span>,
    },
    { cle: 'age', titre: 'Âge', rendu: (g) => libelleAge(g) || '—' },
    { cle: 'neighborhood', titre: 'Quartier', rendu: (g) => g.neighborhood || '—' },
    {
      cle: 'ga_days',
      titre: 'Terme',
      rendu: (g) => <span className="maternite__chiffres">{formatSA(g.ga_days)}</span>,
    },
    {
      cle: 'edd',
      titre: 'Date prévue',
      rendu: (g) => <span className="maternite__chiffres">{formatDate(g.edd)}</span>,
    },
    { cle: 'dating_kind', titre: 'Datation', rendu: (g) => LIBELLES_DATATION[g.dating_kind] },
  ]

  const resume = texte
    ? `${total} grossesse${total > 1 ? 's' : ''} en cours pour « ${texte} »`
    : `${total} grossesse${total > 1 ? 's' : ''} en cours, date prévue la plus proche en haut`

  return (
    <div className="maternite__liste">
      <div className="maternite__recherche">
        <SearchBar
          valeur={saisie}
          onChange={(v) => {
            setSaisie(v)
            changer({ q: v.trim(), page: null })
          }}
          onRechercher={() => requete.refetch()}
          chargement={requete.isFetching}
          libelle="Rechercher une patiente suivie"
          placeholder="Nom, prénom, n° de dossier, quartier…"
        />
        {!requete.isPending && !requete.error && (
          <p className="maternite__resume" role="status">
            {resume}
          </p>
        )}
      </div>
      {requete.error ? (
        <Message
          ton="erreur"
          titre="Les grossesses en cours n’ont pas pu être chargées"
          action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}
        >
          <p>{requete.error.message}</p>
        </Message>
      ) : (
        <>
          <Table
            colonnes={colonnes}
            lignes={requete.data?.lignes ?? []}
            cleLigne="pregnancy_id"
            legende={resume}
            chargement={requete.isPending}
            vide={
              <EmptyState
                icone={texte ? SearchX : Baby}
                titre={texte ? 'Aucune patiente trouvée' : 'Aucune grossesse suivie'}
                texte={
                  texte
                    ? 'Vérifiez l’orthographe, ou cherchez par numéro de dossier ou quartier.'
                    : 'Le suivi s’ouvre depuis la fiche de la patiente, onglet « Grossesse ».'
                }
              />
            }
          />
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={total}
            parPage={PAGE_EN_COURS}
            libelle="Pages des grossesses en cours"
            onChange={(p) => changer({ page: p > 1 ? p : null })}
          />
        </>
      )}
    </div>
  )
}
