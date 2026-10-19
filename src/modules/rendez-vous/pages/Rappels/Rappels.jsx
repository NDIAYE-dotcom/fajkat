import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { ajouterJours, aujourdhui } from '../../agenda.js'
import { changerStatutRdv, cles, marquerRappel } from '../../api.js'
import GroupeRappel from '../../components/GroupeRappel/GroupeRappel.jsx'
import { useRappels } from '../../hooks/useAgenda.js'
import { grouperParTelephone } from '../../suivi.js'
import { dateLongue } from '../../utils.js'
import './Rappels.css'

const ENTREE = entreeDepuisChemin('/app/rendez-vous')

export default function Rappels() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageRappels />
      </RoleRoute>
    </FeatureRoute>
  )
}

// « À rappeler demain » : les rendez-vous du lendemain regroupés par téléphone (une famille
// partage souvent le même numéro), avec le titulaire, l'accord WhatsApp, la langue et le
// message prévu, qui ne nomme jamais un soin discret. Ce qui figure ici, et ce qui n'y
// figure pas, est décidé par la base. L'envoi WhatsApp viendra aux étapes 23 et 24.
function PageRappels() {
  const { structure } = useOrganization()
  const enLigne = useEnLigne()
  const queryClient = useQueryClient()
  const demain = ajouterJours(aujourdhui(), 1)
  const rappels = useRappels(structure.id, demain)
  const [enCours, setEnCours] = useState(null)
  const [echecs, setEchecs] = useState({})

  useEffect(() => {
    document.title = `À rappeler demain — ${structure.name} — Fajkat`
  }, [structure.name])

  const { avecTelephone, sansTelephone } = grouperParTelephone(rappels.data ?? [])
  const aAppeler = avecTelephone.filter((g) => !g.fait).length

  // Écriture, puis relecture de la liste ; un échec s'affiche sous le téléphone concerné.
  async function envoyer(cle, groupe, action) {
    setEnCours(cle)
    setEchecs((e) => ({ ...e, [groupe.cle]: null }))
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: cles.rappels(structure.id, demain) })
      queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'agenda', structure.id] })
    } catch (e) {
      setEchecs((x) => ({ ...x, [groupe.cle]: e.message }))
    } finally {
      setEnCours(null)
    }
  }

  // Un téléphone (ou le groupe « Sans téléphone ») ; l'échec s'affiche sous ce groupe.
  const rendreGroupe = (g) => (
    <GroupeRappel
      key={g.cle}
      groupe={g}
      nomStructure={structure.name}
      desactive={!enLigne || Boolean(enCours)}
      enCours={enCours}
      echec={echecs[g.cle]}
      onRappel={(groupe, fait) =>
        envoyer(`rappel:${groupe.cle}`, groupe, () =>
          marquerRappel(
            groupe.rdv.map((r) => r.appointment_id),
            fait,
          ),
        )
      }
      onConfirme={(r, oui) =>
        envoyer(`confirme:${r.appointment_id}`, g, () =>
          changerStatutRdv(r.appointment_id, oui ? 'confirmed' : 'scheduled'),
        )
      }
    />
  )

  return (
    <div className="rappels">
      <header className="rappels__entete">
        <Button variante="discret" to="/app/rendez-vous" iconeDebut={<Icone icone={ArrowLeft} />}>
          Agenda
        </Button>
        <h1 className="rappels__titre">À rappeler demain</h1>
        <p className="rappels__date">{dateLongue(demain)}</p>
      </header>

      {!enLigne && (
        <Message ton="info" titre="Vous êtes hors ligne">
          <p>La liste reste lisible ; les cases se cochent dès le retour de la connexion.</p>
        </Message>
      )}

      {rappels.error && (
        <Message ton="erreur" action={<Button onClick={() => rappels.refetch()}>Réessayer</Button>}>
          <p>{rappels.error.message}</p>
        </Message>
      )}

      {rappels.isPending && !rappels.error && <Skeleton forme="bloc" hauteur="12rem" />}

      {rappels.data && rappels.data.length === 0 && (
        <EmptyState
          icone={BellOff}
          titre="Aucun rendez-vous à rappeler demain"
          texte="Les rendez-vous prévus ou confirmés de demain apparaîtront ici."
        />
      )}

      {rappels.data?.length > 0 && (
        <>
          <p className="rappels__bilan">
            {bilan(avecTelephone.length, aAppeler, rappels.data.length)}
          </p>
          {avecTelephone.length > 0 && (
            <ul className="rappels__liste">{avecTelephone.map(rendreGroupe)}</ul>
          )}
          {sansTelephone && (
            <section className="rappels__sans" aria-labelledby="rappels-sans-titre">
              <h2 id="rappels-sans-titre" className="rappels__sous-titre">
                Sans téléphone
              </h2>
              <p className="rappels__aide">
                Aucun numéro au dossier : ces patients ne peuvent pas être rappelés.
              </p>
              <ul className="rappels__liste">{rendreGroupe(sansTelephone)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// « 3 téléphones à appeler · 5 rendez-vous » ; sans aucun numéro, seulement le nombre.
function bilan(telephones, aAppeler, total) {
  const rdv = `${total} rendez-vous`
  if (telephones === 0) return `Aucun téléphone à appeler · ${rdv}`
  if (aAppeler === 0) return 'Tous les téléphones ont été rappelés.'
  return `${aAppeler} téléphone${aAppeler > 1 ? 's' : ''} à appeler · ${rdv}`
}
