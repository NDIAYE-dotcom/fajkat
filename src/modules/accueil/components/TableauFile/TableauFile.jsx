import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { appelerPassage, appelerSuivant, cles } from '../../api.js'
import { useServicesFile } from '../../hooks/useFile.js'
import { usePreference } from '../../hooks/usePreference.js'
import { useDeplacement, useMaintenant, useSalles } from '../../hooks/useTableauFile.js'
import { COLONNES } from '../../utils.js'
import BarreAppel from '../BarreAppel/BarreAppel.jsx'
import ColonneFile from '../ColonneFile/ColonneFile.jsx'
import ModaleConstantes from '../ModaleConstantes/ModaleConstantes.jsx'
import './TableauFile.css'

// Tableau de la salle d'attente : En attente / Constantes / En consultation / Terminé.
// Chaque carte se déplace par un bouton (téléphone) ou par glisser-déposer (souris).
// lignes : passages du jour (get_queue_board), déjà triés par priorité puis arrivée.
// medical : soignant (bouton « Constantes » sur les cartes).
export default function TableauFile({ orgId, lignes, chargement, ecrire, medical }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const maintenant = useMaintenant()
  const enLigne = useEnLigne()
  const salles = useSalles(orgId)
  const services = useServicesFile(orgId)
  const deplacement = useDeplacement(orgId)
  const [salle, setSalle] = usePreference(`fajkat.file.salle.${orgId}`, '')
  const [file, setFile] = usePreference(`fajkat.file.service.${orgId}`, '')
  const [cible, setCible] = useState('consultation')
  const [colonneMobile, setColonneMobile] = useState('waiting')
  const [occupation, setOccupation] = useState(null) // { visitId, action }
  const [appel, setAppel] = useState(false)
  const [constantes, setConstantes] = useState(null) // ligne du passage

  // Une salle ou une file retirée entre-temps n'est plus proposée.
  const salleValide = (salles.data ?? []).some((s) => s.id === salle) ? salle : ''
  const fileValide = (services.data ?? []).some((s) => s.id === file) ? file : ''
  const visibles = fileValide ? lignes.filter((l) => l.queue_service_id === fileValide) : lignes

  function annoncer(visite) {
    const libelle = (salles.data ?? []).find((s) => s.id === visite.room_id)?.label
    toast.succes(`${visite.ticket_number} appelé${libelle ? ` : ${libelle}` : ''}`, {
      message: 'Le numéro s’affiche sur l’écran de la salle d’attente.',
    })
  }

  async function agir(ligne, action) {
    if (action.constantes) {
      setConstantes(ligne)
      return
    }
    if (action.vers) {
      deplacement.mutate({ visitId: ligne.visit_id, statut: action.vers })
      return
    }
    setOccupation({ visitId: ligne.visit_id, action: action.id })
    try {
      annoncer(await appelerPassage(ligne.visit_id, action.appel, salleValide || null))
    } catch (e) {
      toast.erreur('Appel non envoyé', { message: e.message })
    } finally {
      setOccupation(null)
      queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
    }
  }

  async function appelerLeSuivant() {
    setAppel(true)
    try {
      const visite = await appelerSuivant(
        orgId,
        cible,
        salleValide || null,
        fileValide ? [fileValide] : null,
      )
      if (visite) annoncer(visite)
      else toast.succes('Personne n’attend dans cette file')
    } catch (e) {
      toast.erreur('Appel non envoyé', { message: e.message })
    } finally {
      setAppel(false)
      queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
    }
  }

  function deposer(visitId, colonne) {
    const ligne = lignes.find((l) => l.visit_id === visitId)
    if (!ligne || ligne.status === colonne) return
    deplacement.mutate({ visitId, statut: colonne })
  }

  const parColonne = Object.fromEntries(
    COLONNES.map((c) => [c.id, visibles.filter((l) => c.statuts.includes(l.status))]),
  )

  return (
    <div className="tableau-file">
      <BarreAppel
        salles={salles.data ?? []}
        services={services.data ?? []}
        salle={salleValide}
        onSalle={setSalle}
        file={fileValide}
        onFile={setFile}
        cible={cible}
        onCible={setCible}
        ecrire={ecrire}
        horsLigne={!enLigne}
        appel={appel}
        onAppeler={appelerLeSuivant}
      />

      {!enLigne && (
        <Message ton="erreur" titre="Pas de connexion">
          <p>
            Les déplacements reprendront au retour du réseau. Le tableau affiché peut ne plus être à
            jour.
          </p>
        </Message>
      )}

      {(salles.error || services.error) && (
        <Message ton="erreur">
          <p>{(salles.error ?? services.error).message}</p>
        </Message>
      )}

      <div className="tableau-file__onglets" role="group" aria-label="Colonne affichée">
        {COLONNES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="tableau-file__onglet"
            aria-pressed={colonneMobile === c.id}
            onClick={() => setColonneMobile(c.id)}
          >
            {c.titre} <span className="tableau-file__compte">{parColonne[c.id].length}</span>
          </button>
        ))}
      </div>

      {chargement ? (
        <Skeleton forme="bloc" hauteur="16rem" />
      ) : (
        <div className="tableau-file__colonnes">
          {COLONNES.map((c) => (
            <ColonneFile
              key={c.id}
              colonne={c}
              lignes={parColonne[c.id]}
              active={colonneMobile === c.id}
              maintenant={maintenant}
              ecrire={ecrire}
              medical={medical}
              horsLigne={!enLigne}
              occupation={occupation}
              onAction={agir}
              onDeposer={deposer}
            />
          ))}
        </div>
      )}
      {constantes && (
        <ModaleConstantes orgId={orgId} ligne={constantes} onFermer={() => setConstantes(null)} />
      )}
    </div>
  )
}
