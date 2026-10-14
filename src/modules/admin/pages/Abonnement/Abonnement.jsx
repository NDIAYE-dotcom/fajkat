import { useEffect } from 'react'
import Message from '../../../../components/ui/Message/Message.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { joursRestants, LIBELLES_STATUT } from '../../../../lib/abonnement.js'
import { formatDate } from '../../../../lib/format.js'
import { autreOffre, getOffre, prixOffreParMois } from '../../../../lib/offres.js'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { ROLES_ABONNEMENT } from '../../../../router/navigation.js'
import './Abonnement.css'

// Page provisoire : l'état de l'abonnement, en lecture. Le paiement (Wave, Orange Money,
// Free Money) et le changement d'offre arrivent à l'étape 10.
export default function Abonnement() {
  return (
    <RoleRoute roles={ROLES_ABONNEMENT} libelle="Abonnement">
      <PageAbonnement />
    </RoleRoute>
  )
}

function PageAbonnement() {
  const { structure } = useOrganization()
  const offre = getOffre(structure.type)
  const jours = structure.status === 'trial' ? joursRestants(structure.trial_ends_at) : null
  const clinique = structure.type === 'poste_sante' ? autreOffre(structure.type) : null

  useEffect(() => {
    document.title = `Abonnement — ${structure.name} — Fajkat`
  }, [structure.name])

  return (
    <div className="abonnement">
      <header>
        <p className="abonnement__surtitre">{structure.name}</p>
        <h1 className="abonnement__titre">Abonnement</h1>
      </header>

      <Panel titre="Votre offre" marque>
        <dl className="abonnement__fiche">
          <div className="abonnement__ligne">
            <dt>Offre</dt>
            <dd>{offre?.nom ?? structure.type}</dd>
          </div>
          {offre && (
            <div className="abonnement__ligne">
              <dt>Tarif</dt>
              <dd className="abonnement__chiffre">{prixOffreParMois(offre)}</dd>
            </div>
          )}
          <div className="abonnement__ligne">
            <dt>État</dt>
            <dd>{LIBELLES_STATUT[structure.status] ?? structure.status}</dd>
          </div>
          {jours !== null && structure.trial_ends_at && (
            <div className="abonnement__ligne">
              <dt>Fin de l’essai</dt>
              <dd>
                <span className="abonnement__chiffre">{formatDate(structure.trial_ends_at)}</span>
                <span className="abonnement__detail">
                  {' '}
                  (
                  {jours > 1
                    ? `${jours} jours restants`
                    : jours === 1
                      ? '1 jour restant'
                      : 'terminé'}
                  )
                </span>
              </dd>
            </div>
          )}
        </dl>
      </Panel>

      {clinique && (
        <Panel titre={`Passer à l’offre ${clinique.nom}`} ton="surface">
          <p className="abonnement__texte">
            Hospitalisation, laboratoire, imagerie, agenda de plusieurs praticiens… pour{' '}
            <span className="abonnement__chiffre">{prixOffreParMois(clinique)}</span>. Le passage se
            fait sans perdre aucune donnée.
          </p>
        </Panel>
      )}

      <Message ton="info" titre="Paiement en ligne bientôt disponible">
        <p>
          Vous pourrez bientôt régler votre abonnement par Wave, Orange Money ou Free Money depuis
          cette page. D’ici là, rien n’est à payer pendant l’essai.
        </p>
      </Message>
    </div>
  )
}
