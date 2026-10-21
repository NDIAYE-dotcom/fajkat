import { useQueryClient } from '@tanstack/react-query'
import { Baby, Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import Antecedents from '../../../consultations/components/Antecedents/Antecedents.jsx'
import { cles } from '../../api.js'
import { useGrossessesPatiente, useReglagesMaternite } from '../../hooks/useMaternite.js'
import ModaleOuvertureGrossesse from '../ModaleOuvertureGrossesse/ModaleOuvertureGrossesse.jsx'
import SuiviGrossesse from '../SuiviGrossesse/SuiviGrossesse.jsx'
import './OngletGrossesse.css'

const ISSUES = { delivered: 'Accouchée', ended: 'Terminée' }

// Onglet « Grossesse » de la fiche d'une patiente (rôles médicaux) : grossesse en cours,
// ouverture du suivi, antécédents gynéco-obstétricaux, grossesses précédentes.
// droits : { ecrire } (maternité) ; dossier : { lire, ecrire, sensible } (antécédents).
export default function OngletGrossesse({ patient, droits, dossier }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const grossesses = useGrossessesPatiente(patient.id, true)
  const reglages = useReglagesMaternite(patient.org_id)
  const [ouverture, setOuverture] = useState(false)
  const [avertissement, setAvertissement] = useState(null)

  if (grossesses.isPending) return <Skeleton forme="bloc" hauteur="8rem" />
  if (grossesses.error) {
    return (
      <Message
        ton="erreur"
        action={<Button onClick={() => grossesses.refetch()}>Réessayer</Button>}
      >
        <p>{grossesses.error.message}</p>
      </Message>
    )
  }
  const enCours = grossesses.data.find((g) => g.status === 'ongoing')
  const precedentes = grossesses.data.filter((g) => g.status !== 'ongoing')

  async function ouverte(_id, alerte) {
    setOuverture(false)
    setAvertissement(alerte ?? null)
    await queryClient.invalidateQueries({ queryKey: cles.grossessesPatiente(patient.id) })
    toast.succes('Suivi de grossesse ouvert')
  }

  return (
    <div className="onglet-grossesse">
      {avertissement && (
        <Message ton="erreur" titre="Groupe sanguin non enregistré">
          <p>{avertissement}</p>
        </Message>
      )}
      {enCours ? (
        <SuiviGrossesse
          id={enCours.id}
          patientId={patient.id}
          ecrire={droits.ecrire}
          reglages={reglages.data}
        />
      ) : (
        <EmptyState
          icone={Baby}
          titre="Aucune grossesse suivie"
          texte={
            droits.ecrire
              ? 'Ouvrez le suivi dès la première consultation prénatale : le terme et la date prévue d’accouchement seront calculés.'
              : 'Le suivi est ouvert par une sage-femme, un infirmier ou un médecin.'
          }
          action={
            droits.ecrire ? (
              <Button
                iconeDebut={<Icone icone={Plus} />}
                disabled={!enLigne || reglages.isPending}
                onClick={() => setOuverture(true)}
              >
                Ouvrir un suivi de grossesse
              </Button>
            ) : null
          }
        />
      )}
      {reglages.error && (
        <Message ton="erreur" titre="Réglages de la maternité non lus">
          <p>{reglages.error.message}</p>
        </Message>
      )}

      {dossier.lire && (
        <section className="onglet-grossesse__section" aria-labelledby="grossesse-antecedents">
          <h2 id="grossesse-antecedents" className="onglet-grossesse__titre">
            Antécédents gynéco-obstétricaux
          </h2>
          <Antecedents
            patientId={patient.id}
            ecrire={dossier.ecrire}
            habilite={dossier.sensible}
            categories={['obstetric']}
          />
        </section>
      )}

      {precedentes.length > 0 && (
        <section className="onglet-grossesse__section" aria-labelledby="grossesses-precedentes">
          <h2 id="grossesses-precedentes" className="onglet-grossesse__titre">
            Grossesses précédentes suivies ici
          </h2>
          <ul className="onglet-grossesse__liste">
            {precedentes.map((g) => (
              <li key={g.id} className="onglet-grossesse__ligne">
                <span className="onglet-grossesse__chiffres">{formatDate(g.opened_on)}</span>
                <span>{ISSUES[g.status] ?? '—'}</span>
                <span className="onglet-grossesse__doux">
                  DPA <span className="onglet-grossesse__chiffres">{formatDate(g.edd)}</span> · G
                  {g.gravidity} P{g.parity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ouverture && reglages.data && (
        <ModaleOuvertureGrossesse
          patient={patient}
          reglages={reglages.data}
          onFermer={() => setOuverture(false)}
          onOuverte={ouverte}
        />
      )}
    </div>
  )
}
