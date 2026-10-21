import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, FileText, Printer, Send } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDateHeure } from '../../../../lib/format.js'
import { STATUTS_RDV } from '../../../rendez-vous/agenda.js'
import { cles } from '../../api.js'
import { libelleProchainRdv } from '../../documents.js'
import { useSuivis } from '../../hooks/useDocuments.js'
import ImpressionCertificat from '../ImpressionCertificat/ImpressionCertificat.jsx'
import ImpressionReference from '../ImpressionReference/ImpressionReference.jsx'
import ModaleCertificat from '../ModaleCertificat/ModaleCertificat.jsx'
import ModaleProchainRdv from '../ModaleProchainRdv/ModaleProchainRdv.jsx'
import ModaleReference from '../ModaleReference/ModaleReference.jsx'
import './DocumentsConsultation.css'

// Documents de la consultation (soignants qui rédigent) : lettre de référence, certificat,
// prochain rendez-vous ; ceux déjà émis, à réimprimer. Dans la consultation en cours comme
// dans la consultation validée.
//   contenu : contenuConsultation(...) (pré-remplissage de la lettre) ; references : droit
//   « references » (feature et rôle).
export default function DocumentsConsultation({
  consultation: c,
  contenu,
  patient,
  sensible,
  references,
}) {
  const { structure } = useOrganization()
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const agenda = useFeature('rendez_vous').actif
  const suivis = useSuivis(c.id, agenda)
  // Fenêtre ouverte : { type: 'reference' | 'certificat' | 'rdv' | 'impReference' | 'impCertificat', id? }
  const [fenetre, setFenetre] = useState(null)
  const fermer = () => setFenetre(null)

  // Documents émis depuis l'ouverture de l'écran : ajoutés ici, sans relire la consultation
  // (en brouillon, une relecture remonterait la saisie).
  const [ajouts, setAjouts] = useState({ lettres: [], certificats: [] })
  const avecAjouts = (liste, ajoutes) => [
    ...liste,
    ...ajoutes.filter((a) => !liste.some((x) => x.id === a.id)),
  ]
  const lettres = avecAjouts(c.referrals ?? [], ajouts.lettres)
  const certificats = avecAjouts(c.certificates ?? [], ajouts.certificats)
  const rdv = suivis.data ?? []

  return (
    <section className="documents-consultation" aria-labelledby="documents-consultation-titre">
      <h2 id="documents-consultation-titre" className="documents-consultation__titre">
        Documents
      </h2>
      <div className="documents-consultation__actions">
        {references && (
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Send} />}
            disabled={!enLigne}
            onClick={() => setFenetre({ type: 'reference' })}
          >
            Référer le patient
          </Button>
        )}
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={FileText} />}
          disabled={!enLigne || !patient}
          onClick={() => setFenetre({ type: 'certificat' })}
        >
          Certificat
        </Button>
        {agenda && (
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={CalendarPlus} />}
            disabled={!enLigne}
            onClick={() => setFenetre({ type: 'rdv' })}
          >
            Prochain rendez-vous
          </Button>
        )}
      </div>

      {lettres.length + certificats.length + rdv.length > 0 && (
        <ul className="documents-consultation__liste">
          {lettres.map((r) => (
            <li key={r.id} className="documents-consultation__ligne">
              <span className="documents-consultation__libelle">
                {`Référence vers ${r.destination_name}`}
                <span className="documents-consultation__date">
                  {formatDateHeure(r.referred_at)}
                </span>
              </span>
              {r.urgency === 'urgent' && <Tampon statut="urgent" />}
              <Tampon ton={r.counter_referral ? 'primaire' : 'neutre'} long>
                {r.counter_referral ? 'Retour reçu' : 'En attente de retour'}
              </Tampon>
              <Button
                variante="discret"
                iconeDebut={<Icone icone={Printer} />}
                onClick={() => setFenetre({ type: 'impReference', id: r.id })}
              >
                Réimprimer la lettre
              </Button>
            </li>
          ))}
          {certificats.map((x) => (
            <li key={x.id} className="documents-consultation__ligne">
              <span className="documents-consultation__libelle">
                {x.title}
                <span className="documents-consultation__numero">{`n° ${x.number}`}</span>
                <span className="documents-consultation__date">{formatDateHeure(x.issued_at)}</span>
              </span>
              <Button
                variante="discret"
                iconeDebut={<Icone icone={Printer} />}
                onClick={() => setFenetre({ type: 'impCertificat', id: x.id })}
              >
                Réimprimer le certificat
              </Button>
            </li>
          ))}
          {rdv.map((s) => (
            <li key={s.appointment_id} className="documents-consultation__ligne">
              <span className="documents-consultation__libelle">
                {`Rendez-vous ${libelleProchainRdv(s.starts_at)}`}
                <span className="documents-consultation__date">
                  {[s.type_label, s.practitioner_name].filter(Boolean).join(' · ')}
                </span>
              </span>
              {STATUTS_RDV[s.status] && (
                <Tampon ton={STATUTS_RDV[s.status].ton}>{STATUTS_RDV[s.status].libelle}</Tampon>
              )}
            </li>
          ))}
        </ul>
      )}

      {fenetre?.type === 'reference' && (
        <ModaleReference
          orgId={structure.id}
          consultation={c}
          contenu={contenu}
          sensible={sensible}
          onFermer={fermer}
          onEmise={(id, lettre) => {
            toast.succes('Lettre de référence émise')
            setAjouts((a) => ({ ...a, lettres: [...a.lettres, { ...lettre, id }] }))
            queryClient.invalidateQueries({ queryKey: cles.toutesReferences(structure.id) })
            setFenetre({ type: 'impReference', id })
          }}
        />
      )}
      {fenetre?.type === 'certificat' && (
        <ModaleCertificat
          consultation={c}
          patient={patient}
          sensible={sensible}
          onFermer={fermer}
          onEmis={(id) => {
            toast.succes('Certificat émis')
            setFenetre({ type: 'impCertificat', id })
          }}
        />
      )}
      {fenetre?.type === 'rdv' && (
        <ModaleProchainRdv
          consultation={c}
          onFermer={fermer}
          onPris={(a) => {
            toast.succes(`Rendez-vous enregistré : ${libelleProchainRdv(a.starts_at)}`)
            suivis.refetch()
            queryClient.invalidateQueries({ queryKey: ['rendez-vous'] })
            fermer()
          }}
        />
      )}
      {fenetre?.type === 'impReference' && (
        <ImpressionReference referenceId={fenetre.id} patient={patient} onFermer={fermer} />
      )}
      {fenetre?.type === 'impCertificat' && (
        <ImpressionCertificat
          certificatId={fenetre.id}
          onFermer={fermer}
          onLu={(x) =>
            setAjouts((a) =>
              a.certificats.some((y) => y.id === x.id)
                ? a
                : { ...a, certificats: [...a.certificats, x] },
            )
          }
        />
      )}
    </section>
  )
}
