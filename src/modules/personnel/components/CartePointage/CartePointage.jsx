import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, WifiOff } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import { chargerMesPresences, cles, pointerArrivee, pointerDepart } from '../../api.js'
import { dureeEntre, formatJour } from '../../utils.js'
import './CartePointage.css'

// Une arrivée sans départ plus ancienne que ce délai est considérée comme oubliée
// (même règle que la base : attendance_open_record).
const DELAI_OUBLI_MS = 24 * 60 * 60 * 1000

// Pointage depuis le téléphone du membre. Aucune heure n'est envoyée : le serveur
// enregistre la sienne, et c'est elle qui s'affiche ensuite.
export default function CartePointage({ orgId, userId }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const cle = cles.mesPresences(orgId, userId)
  // L'heure de lecture est gardée avec les données : l'état « en cours » se calcule
  // sans relire l'horloge à chaque affichage.
  const presences = useQuery({
    queryKey: cle,
    queryFn: async () => ({ liste: await chargerMesPresences(orgId, userId), luLe: Date.now() }),
  })

  const liste = presences.data?.liste
  const derniere = liste?.[0] ?? null
  const enCours =
    derniere &&
    !derniere.check_out_at &&
    presences.data.luLe - new Date(derniere.check_in_at) < DELAI_OUBLI_MS

  async function pointer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const ligne = enCours ? await pointerDepart(orgId) : await pointerArrivee(orgId)
      toast.succes(
        enCours
          ? `Départ enregistré à ${formatHeure(ligne.check_out_at)}`
          : `Arrivée enregistrée à ${formatHeure(ligne.check_in_at)}`,
      )
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
      // Relu dans tous les cas : un pointage fait sur un autre appareil apparaît aussi.
      queryClient.invalidateQueries({ queryKey: cle })
    }
  }

  return (
    <div className="carte-pointage">
      <Panel titre="Pointage" marque>
        {presences.isPending && <Spinner libelle="Chargement de vos pointages…" />}
        {presences.error && (
          <Message ton="erreur" titre="Vos pointages n’ont pas pu être chargés">
            <p>{presences.error.message}</p>
            <Button variante="discret" onClick={() => presences.refetch()}>
              Réessayer
            </Button>
          </Message>
        )}
        {presences.data && (
          <div className="carte-pointage__corps">
            <p className="carte-pointage__etat" aria-live="polite">
              {enCours ? (
                <>
                  Arrivée enregistrée à{' '}
                  <span className="carte-pointage__heure">{formatHeure(derniere.check_in_at)}</span>
                  {derniere.work_date && ` le ${formatJour(derniere.work_date)}`}.
                </>
              ) : (
                'Aucune arrivée en cours.'
              )}
            </p>
            {!enLigne && (
              <Message titre="Pas de connexion">
                <p>
                  <Icone icone={WifiOff} /> Le pointage demande Internet : l’heure enregistrée vient
                  du serveur, pas de votre téléphone.
                </p>
              </Message>
            )}
            {erreur && (
              <Message ton="erreur" titre="Pointage non enregistré">
                <p>{erreur}</p>
              </Message>
            )}
            <Button
              taille="grande"
              className="carte-pointage__bouton"
              iconeDebut={<Icone icone={enCours ? LogOut : LogIn} />}
              chargement={envoi}
              disabled={!enLigne}
              onClick={pointer}
            >
              {enCours ? 'Pointer mon départ' : 'Pointer mon arrivée'}
            </Button>
            <p className="carte-pointage__note">
              L’heure est celle du serveur. Une erreur ? Le responsable peut la corriger.
            </p>
          </div>
        )}
      </Panel>

      {liste?.length > 0 && (
        <Panel titre="Mes derniers pointages">
          <ul className="carte-pointage__historique">
            {liste.map((p) => (
              <li key={p.id} className="carte-pointage__ligne">
                <span className="carte-pointage__jour">{formatJour(p.work_date)}</span>
                <span className="carte-pointage__heure">
                  {formatHeure(p.check_in_at)} →{' '}
                  {p.check_out_at ? formatHeure(p.check_out_at) : '…'}
                </span>
                <span className="carte-pointage__duree">
                  {dureeEntre(p.check_in_at, p.check_out_at) ?? 'en cours'}
                </span>
                {p.is_corrected && <Tampon ton="neutre">Corrigé</Tampon>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
