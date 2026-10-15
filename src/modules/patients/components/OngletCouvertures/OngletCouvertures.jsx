import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { dayjs, formatDate, getFuseauHoraire } from '../../../../lib/format.js'
import { chargerCouvertures, cles, retirerCouverture } from '../../api.js'
import { libelleDe, REGIMES } from '../../fiche.js'
import ModaleCouverture from '../ModaleCouverture/ModaleCouverture.jsx'
import './OngletCouvertures.css'

function validite(c) {
  if (c.valid_from && c.valid_to)
    return `du ${formatDate(c.valid_from)} au ${formatDate(c.valid_to)}`
  if (c.valid_to) return `jusqu’au ${formatDate(c.valid_to)}`
  if (c.valid_from) return `depuis le ${formatDate(c.valid_from)}`
  return null
}

// Régimes et tiers payants du patient. Retirer une couverture ne la supprime pas : elle
// reste dans l'historique (deleted_at) et dans le journal.
export default function OngletCouvertures({ patient, ecrire }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // null : fermée ; {} : ajout ; { couverture } : modification.
  const [edition, setEdition] = useState(null)
  const [aRetirer, setARetirer] = useState(null)
  const [retrait, setRetrait] = useState(false)
  const [erreurRetrait, setErreurRetrait] = useState(null)
  const couvertures = useQuery({
    queryKey: cles.couvertures(patient.id),
    queryFn: () => chargerCouvertures(patient.id),
  })
  const aujourdhui = dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: cles.couvertures(patient.id) })

  async function retirer() {
    setRetrait(true)
    setErreurRetrait(null)
    try {
      await retirerCouverture(aRetirer.id)
      setARetirer(null)
      toast.succes('Couverture retirée')
      rafraichir()
    } catch (e) {
      setErreurRetrait(e.message)
    } finally {
      setRetrait(false)
    }
  }

  let liste
  if (couvertures.isPending) liste = <Skeleton largeur="60%" />
  else if (couvertures.error) {
    liste = (
      <Message
        ton="erreur"
        action={<Button onClick={() => couvertures.refetch()}>Réessayer</Button>}
      >
        <p>{couvertures.error.message}</p>
      </Message>
    )
  } else if (couvertures.data.length === 0) {
    liste = (
      <EmptyState
        icone={ShieldCheck}
        titre="Aucune couverture"
        texte="Le patient paie lui-même, ou sa prise en charge n’a pas encore été saisie."
      />
    )
  } else {
    liste = (
      <ul className="onglet-couvertures__liste">
        {couvertures.data.map((c) => {
          const expiree = c.valid_to && c.valid_to < aujourdhui
          const details = [
            c.member_number && (
              <span className="onglet-couvertures__chiffres">N° {c.member_number}</span>
            ),
            c.coverage_rate !== null && (
              <span className="onglet-couvertures__chiffres">
                {c.coverage_rate} % pris en charge
              </span>
            ),
            validite(c),
          ].filter(Boolean)
          return (
            <li key={c.id} className="onglet-couvertures__ligne">
              <div className="onglet-couvertures__texte">
                <p className="onglet-couvertures__titre">
                  {libelleDe(REGIMES, c.scheme)}
                  {c.payer && ` — ${c.payer.name}`}
                  {expiree && <Tampon ton="neutre">Expirée</Tampon>}
                </p>
                {details.length > 0 && (
                  <p className="onglet-couvertures__details">
                    {details.map((d, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        {d}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {ecrire && (
                <div className="onglet-couvertures__actions">
                  <Button variante="secondaire" onClick={() => setEdition({ couverture: c })}>
                    Modifier
                  </Button>
                  <Button variante="discret" onClick={() => setARetirer(c)}>
                    Retirer
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="onglet-couvertures">
      {ecrire && (
        <div>
          <Button iconeDebut={<Icone icone={Plus} />} onClick={() => setEdition({})}>
            Ajouter une couverture
          </Button>
        </div>
      )}
      {liste}
      {edition && (
        <ModaleCouverture
          patient={patient}
          couverture={edition.couverture}
          onFermer={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null)
            toast.succes('Couverture enregistrée')
            rafraichir()
          }}
        />
      )}
      {aRetirer && (
        <Modal
          ouvert
          onFermer={() => setARetirer(null)}
          titre="Retirer cette couverture ?"
          description="Elle ne sera plus proposée à la caisse. Elle reste dans l’historique du dossier."
          actions={
            <Button onClick={retirer} chargement={retrait}>
              Retirer la couverture
            </Button>
          }
        >
          <p>
            {libelleDe(REGIMES, aRetirer.scheme)}
            {aRetirer.payer && ` — ${aRetirer.payer.name}`}
          </p>
          {erreurRetrait && <Message ton="erreur">{erreurRetrait}</Message>}
        </Modal>
      )}
    </div>
  )
}
