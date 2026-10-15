import { Link } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatFCFA } from '../../../../lib/format.js'
import { ROLES_PARAMETRES } from '../../../../router/navigation.js'
import { MODES_PAIEMENT, REFERENCE_MAX } from '../../utils.js'
import './ChampsPaiement.css'

// Prestation vendue et encaissement : espèces, Wave, Orange Money, Free Money, ou gratuité
// avec un motif de la liste de la structure. Le tarif vient des Paramètres, jamais de
// l'écran. prestations, motifs : requêtes React Query.
// Tarifs : Paramètres, onglet Services (owner et admin). Les autres rôles sont invités à
// prévenir le responsable.
function LienTarifs() {
  const { role } = useOrganization()
  if (!ROLES_PARAMETRES.includes(role)) {
    return <p>Demandez au responsable de la structure de le saisir dans Paramètres → Services.</p>
  }
  return (
    <p>
      <Link className="champs-paiement__lien" to="/app/parametres?onglet=services">
        Saisir les tarifs dans Paramètres → Services
      </Link>{' '}
      (votre saisie ici est gardée).
    </p>
  )
}

export default function ChampsPaiement({ id, saisie, erreurs, maj, prestations, motifs }) {
  const liste = prestations.data ?? []
  const sansTarif = liste.filter((p) => p.price == null)
  const motifsActifs = (motifs.data ?? []).filter((m) => m.is_active)
  const choisie = liste.find((p) => p.id === saisie.prestationId)
  const gratuit = saisie.paiement === 'gratuit'
  const mobile = !gratuit && saisie.paiement && saisie.paiement !== 'cash'
  const erreurChargement = prestations.error ?? motifs.error

  if (erreurChargement) {
    return (
      <Message
        ton="erreur"
        action={
          <Button
            onClick={() => {
              prestations.refetch()
              motifs.refetch()
            }}
          >
            Réessayer
          </Button>
        }
      >
        <p>{erreurChargement.message}</p>
      </Message>
    )
  }
  if (prestations.isPending || motifs.isPending) return <Skeleton forme="bloc" hauteur="8rem" />

  return (
    <section className="champs-paiement" aria-labelledby={`${id}-paiement`}>
      <h3 id={`${id}-paiement`} className="champs-paiement__titre">
        Ticket et paiement
      </h3>

      {liste.length === 0 ? (
        <Message ton="info" titre="Aucune prestation de consultation">
          <p>Ajoutez d’abord une consultation et son tarif.</p>
          <LienTarifs />
        </Message>
      ) : (
        <div data-champ="prestationId">
          <Field label="Prestation" groupe requis erreur={erreurs.prestationId}>
            <div className="champs-paiement__choix">
              {liste.map((p) => (
                <Radio
                  key={p.id}
                  name={`${id}-prestation`}
                  value={p.id}
                  checked={saisie.prestationId === p.id}
                  disabled={p.price == null}
                  onChange={() => maj('prestationId', p.id)}
                  label={p.label}
                  description={p.price == null ? 'Pas encore de tarif' : formatFCFA(p.price)}
                />
              ))}
            </div>
          </Field>
        </div>
      )}
      {sansTarif.length > 0 && (
        <Message
          ton="info"
          titre={
            sansTarif.length === 1
              ? `« ${sansTarif[0].label} » n’a pas encore de tarif`
              : `${sansTarif.length} prestations n’ont pas encore de tarif`
          }
        >
          <p>
            Sans tarif, une prestation ne peut pas être délivrée, même gratuitement : un ticket
            gratuit garde le tarif du jour comme valeur.
          </p>
          <LienTarifs />
        </Message>
      )}

      <div data-champ="paiement">
        <Field label="Paiement" groupe requis erreur={erreurs.paiement}>
          <div className="champs-paiement__choix">
            {MODES_PAIEMENT.map((m) => (
              <Radio
                key={m.valeur}
                name={`${id}-mode`}
                value={m.valeur}
                checked={saisie.paiement === m.valeur}
                onChange={() => maj('paiement', m.valeur)}
                label={m.libelle}
              />
            ))}
            <Radio
              name={`${id}-mode`}
              value="gratuit"
              checked={gratuit}
              onChange={() => maj('paiement', 'gratuit')}
              label="Gratuit"
              description="0 FCFA, avec un motif"
            />
          </div>
        </Field>
      </div>

      {mobile && (
        <div data-champ="reference">
          <Field
            label="Référence de la transaction"
            aide="Facultatif. Le numéro indiqué dans le SMS de confirmation."
            erreur={erreurs.reference}
          >
            <Input
              value={saisie.reference}
              maxLength={REFERENCE_MAX}
              autoComplete="off"
              onChange={(e) => maj('reference', e.target.value)}
            />
          </Field>
        </div>
      )}

      {gratuit &&
        (motifsActifs.length === 0 ? (
          <Message ton="info" titre="Aucun motif de gratuité">
            <p>
              Le responsable doit d’abord en ajouter dans la page Tickets de consultation, bouton «
              Motifs de gratuité ».
            </p>
          </Message>
        ) : (
          <div data-champ="motifGratuiteId">
            <Field label="Motif de la gratuité" requis erreur={erreurs.motifGratuiteId}>
              <Select
                value={saisie.motifGratuiteId}
                onChange={(e) => maj('motifGratuiteId', e.target.value)}
                placeholder="Choisissez un motif"
                options={motifsActifs.map((m) => ({ valeur: m.id, libelle: m.label }))}
              />
            </Field>
          </div>
        ))}

      {choisie && choisie.price != null && (
        <p className="champs-paiement__total" aria-live="polite">
          <span>{gratuit ? 'Gratuit, à encaisser' : 'À encaisser'}</span>
          <span className="champs-paiement__montant">
            {formatFCFA(gratuit ? 0 : choisie.price)}
          </span>
          {gratuit && (
            <span className="champs-paiement__valeur">
              Valeur enregistrée : {formatFCFA(choisie.price)}
            </span>
          )}
        </p>
      )}
    </section>
  )
}
