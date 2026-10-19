import { CalendarPlus, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import {
  entreeDepuisChemin,
  offresDeLEntree,
  ROLES_PARAMETRES,
} from '../../../../router/navigation.js'
import {
  aujourdhui as dateDuJour,
  dateValide,
  estClos,
  estFerme,
  joursDe,
  periode,
  seancesDuJour,
  VUES,
} from '../../agenda.js'
import { usePermissionsPatients } from '../../../patients/hooks/usePermissionsPatients.js'
import BarreAgenda from '../../components/BarreAgenda/BarreAgenda.jsx'
import FenetresAgenda from '../../components/FenetresAgenda/FenetresAgenda.jsx'
import MarquesJour from '../../components/MarquesJour/MarquesJour.jsx'
import VueJour from '../../components/VueJour/VueJour.jsx'
import VueListe from '../../components/VueListe/VueListe.jsx'
import VueSemaine from '../../components/VueSemaine/VueSemaine.jsx'
import { useAgenda, useFeriesPeriode } from '../../hooks/useAgenda.js'
import {
  usePermissionsAgenda,
  usePraticiens,
  useSeances,
  useTypesRdv,
} from '../../hooks/useParametresAgenda.js'
import './Agenda.css'

const ENTREE = entreeDepuisChemin('/app/rendez-vous')

export default function Agenda() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageAgenda />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Agenda : vue jour (colonnes par activité au poste, par praticien en clinique), semaine
// ou liste de deux semaines. Vue et date gardées dans l'adresse (?vue= & ?date=).
function PageAgenda() {
  const { structure, role } = useOrganization()
  const orgId = structure.id
  const multiPraticiens = useFeature('agenda_multi_praticiens').actif
  const [parametres, setParametres] = useSearchParams()
  const [afficherClos, setAfficherClos] = useState(false)
  const [fenetre, setFenetre] = useState(null)
  const droits = usePermissionsAgenda(orgId).data ?? {}
  const droitsPatients = usePermissionsPatients(orgId)
  const aujourdhui = dateDuJour()

  const vue = VUES.some((v) => v.id === parametres.get('vue')) ? parametres.get('vue') : 'jour'
  const date = dateValide(parametres.get('date')) ? parametres.get('date') : aujourdhui
  const { du, au } = periode(vue, date)

  const agenda = useAgenda(orgId, du, au)
  const feries = useFeriesPeriode(orgId, du, au)
  const seances = useSeances(orgId)
  const types = useTypesRdv(orgId)
  const praticiens = usePraticiens(orgId, multiPraticiens)

  useEffect(() => {
    document.title = `Agenda — ${structure.name} — Fajkat`
  }, [structure.name])

  function aller(champs) {
    const suivant = { vue, date, ...champs }
    setParametres(
      { vue: suivant.vue, ...(suivant.date === aujourdhui ? {} : { date: suivant.date }) },
      { replace: true },
    )
  }

  const tous = agenda.data ?? []
  const affiches = afficherClos ? tous : tous.filter((r) => !estClos(r))
  const listeSeances = seances.data ?? []
  const listeTypes = types.data ?? []
  const listePraticiens = praticiens.data ?? []
  const ferieDu = (iso) => feries.data?.find((f) => f.holiday_date === iso)
  const jour = (iso) => ({
    iso,
    rdv: affiches.filter((r) => r.local_date === iso),
    seances: seancesDuJour(listeSeances, tous, iso),
    ferie: ferieDu(iso),
    ferme: estFerme(structure.settings, iso),
  })

  const erreur = [agenda, seances, types, feries].find((r) => r.error)?.error
  const ouvrir = (rdv) => setFenetre({ type: 'rdv', rdv })
  const premierChargement = agenda.isPending || seances.isPending || types.isPending

  return (
    <div className="agenda">
      <header className="agenda__entete">
        <div>
          <p className="agenda__surtitre">{structure.name}</p>
          <h1 className="agenda__titre">Agenda</h1>
        </div>
        <div className="agenda__actions">
          {droits.write && (
            <Button
              iconeDebut={<Icone icone={CalendarPlus} />}
              onClick={() => setFenetre({ type: 'prise' })}
            >
              Nouveau rendez-vous
            </Button>
          )}
          {ROLES_PARAMETRES.includes(role) && (
            <Button
              variante="secondaire"
              to="/app/rendez-vous/parametres"
              iconeDebut={<Icone icone={Settings} />}
            >
              Paramètres de l’agenda
            </Button>
          )}
        </div>
      </header>

      <BarreAgenda
        vue={vue}
        date={date}
        aujourdhui={aujourdhui}
        afficherClos={afficherClos}
        onVue={(v) => aller({ vue: v })}
        onDate={(d) => aller({ date: d })}
        onAfficherClos={setAfficherClos}
      />

      {erreur && (
        <Message
          ton="erreur"
          action={
            <Button
              onClick={() =>
                [agenda, seances, types, feries].forEach((r) => r.error && r.refetch())
              }
            >
              Réessayer
            </Button>
          }
        >
          <p>{erreur.message}</p>
        </Message>
      )}

      {vue === 'jour' && (
        <div className="agenda__marques">
          <MarquesJour ferie={ferieDu(date)} ferme={estFerme(structure.settings, date)} />
        </div>
      )}

      {premierChargement && !erreur ? (
        <Skeleton forme="bloc" hauteur="16rem" />
      ) : (
        !erreur && (
          <div
            className={
              agenda.isPlaceholderData
                ? 'agenda__contenu agenda__contenu--attente'
                : 'agenda__contenu'
            }
          >
            {vue === 'jour' && (
              <VueJour
                {...jour(date)}
                types={listeTypes}
                praticiens={listePraticiens}
                multiPraticiens={multiPraticiens}
                onOuvrir={ouvrir}
              />
            )}
            {vue === 'semaine' && (
              <VueSemaine
                jours={joursDe({ du, au }).map(jour)}
                aujourdhui={aujourdhui}
                types={listeTypes}
                praticiens={listePraticiens}
                multiPraticiens={multiPraticiens}
                onOuvrirJour={(iso) => aller({ vue: 'jour', date: iso })}
              />
            )}
            {vue === 'liste' && (
              <VueListe
                rdv={affiches}
                types={listeTypes}
                praticiens={listePraticiens}
                multiPraticiens={multiPraticiens}
                chargement={agenda.isPlaceholderData}
                onOuvrir={ouvrir}
              />
            )}
          </div>
        )
      )}

      <FenetresAgenda
        orgId={orgId}
        droits={droits}
        multiPraticiens={multiPraticiens}
        peutCreerPatient={droitsPatients.ecrire}
        fenetre={fenetre}
        setFenetre={setFenetre}
      />
    </div>
  )
}
