import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Printer, Settings2 } from 'lucide-react'
import { useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { imprimer } from '../../../../lib/impression.js'
import { chargerAffectations, chargerCreneaux, chargerMembres, cles } from '../../api.js'
import {
  aujourdhui,
  decalerJours,
  formatJour,
  indexerAffectations,
  joursDeLaSemaine,
  lundiDe,
} from '../../utils.js'
import GrillePlanning from '../GrillePlanning/GrillePlanning.jsx'
import ModaleCreneau from '../ModaleCreneau/ModaleCreneau.jsx'
import PlanningImpression from '../PlanningImpression/PlanningImpression.jsx'
import ReglagesCreneaux from '../ReglagesCreneaux/ReglagesCreneaux.jsx'
import './PlanningSemaine.css'

// Planning des gardes, semaine par semaine. modifiable : owner et admin (la base le
// vérifie aussi). moi : utilisateur connecté, mis en évidence dans la grille.
export default function PlanningSemaine({ structure, modifiable, moi }) {
  const orgId = structure.id
  const queryClient = useQueryClient()
  const refImpression = useRef(null)
  const [lundi, setLundi] = useState(() => lundiDe(aujourdhui()))
  const [caseOuverte, setCaseOuverte] = useState(null)
  const [reglages, setReglages] = useState(false)
  const jours = joursDeLaSemaine(lundi)
  const dimanche = jours[6]

  const creneaux = useQuery({
    queryKey: cles.creneaux(orgId),
    queryFn: () => chargerCreneaux(orgId),
  })
  const membres = useQuery({ queryKey: cles.membres(orgId), queryFn: () => chargerMembres(orgId) })
  const affectations = useQuery({
    queryKey: cles.affectations(orgId, lundi, dimanche),
    queryFn: () => chargerAffectations(orgId, lundi, dimanche),
  })

  const actifs = (creneaux.data ?? []).filter((c) => c.is_active)
  const cases = indexerAffectations(affectations.data, membres.data)
  const erreur = creneaux.error ?? membres.error ?? affectations.error
  const chargement = creneaux.isPending || membres.isPending || affectations.isPending

  function rafraichir() {
    queryClient.invalidateQueries({ queryKey: ['personnel', 'affectations', orgId] })
  }

  return (
    <section className="planning-semaine" aria-labelledby="planning-semaine-titre">
      <header className="planning-semaine__entete">
        <h2 id="planning-semaine-titre" className="planning-semaine__titre">
          Semaine du <span className="planning-semaine__date">{formatJour(lundi)}</span> au{' '}
          <span className="planning-semaine__date">{formatJour(dimanche)}</span>
        </h2>
        <div className="planning-semaine__navigation">
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={ChevronLeft} />}
            onClick={() => setLundi(decalerJours(lundi, -7))}
          >
            Semaine précédente
          </Button>
          <Button variante="discret" onClick={() => setLundi(lundiDe(aujourdhui()))}>
            Cette semaine
          </Button>
          <Button
            variante="secondaire"
            iconeFin={<Icone icone={ChevronRight} />}
            onClick={() => setLundi(decalerJours(lundi, 7))}
          >
            Semaine suivante
          </Button>
        </div>
        <div className="planning-semaine__outils">
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Printer} />}
            disabled={chargement || Boolean(erreur)}
            onClick={() => imprimer(refImpression.current)}
          >
            Imprimer (A4 paysage)
          </Button>
          {modifiable && (
            <Button
              variante="discret"
              iconeDebut={<Icone icone={Settings2} />}
              onClick={() => setReglages(true)}
            >
              Créneaux et horaires
            </Button>
          )}
        </div>
      </header>

      {erreur && (
        <Message ton="erreur" titre="Le planning n’a pas pu être chargé">
          <p>{erreur.message}</p>
          <Button
            variante="discret"
            onClick={() => {
              creneaux.refetch()
              membres.refetch()
              affectations.refetch()
            }}
          >
            Réessayer
          </Button>
        </Message>
      )}

      {!erreur && (
        <GrillePlanning
          jours={jours}
          creneaux={actifs}
          cases={cases}
          chargement={chargement}
          aujourdhui={aujourdhui()}
          moi={moi}
          modifiable={modifiable}
          onOuvrir={(jour, creneau) => setCaseOuverte({ jour, creneau })}
        />
      )}

      {caseOuverte && (
        <ModaleCreneau
          orgId={orgId}
          jour={caseOuverte.jour}
          creneau={caseOuverte.creneau}
          creneaux={actifs}
          cases={cases}
          membres={membres.data}
          onFermer={() => setCaseOuverte(null)}
          onChange={rafraichir}
        />
      )}

      {reglages && (
        <ReglagesCreneaux
          orgId={orgId}
          creneaux={creneaux.data ?? []}
          onFermer={() => setReglages(false)}
          onChange={() => queryClient.invalidateQueries({ queryKey: cles.creneaux(orgId) })}
        />
      )}

      <PlanningImpression
        ref={refImpression}
        structure={structure}
        jours={jours}
        creneaux={actifs}
        cases={cases}
      />
    </section>
  )
}
