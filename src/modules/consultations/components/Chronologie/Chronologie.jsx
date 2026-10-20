import { History } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { filtresChronologie } from '../../dossier.js'
import { useChronologie } from '../../hooks/useConsultation.js'
import LigneChronologie from '../LigneChronologie/LigneChronologie.jsx'
import './Chronologie.css'

// Chronologie du dossier : toutes les rencontres, la plus récente en haut, par pages de 20.
// La base décide de ce que chacun voit : passages et rendez-vous pour tous les rôles qui
// les lisent (type discret affiché « Consultation » hors des rôles médicaux) ; consultations,
// ordonnances, références et certificats pour les soignants, rien de sensible pour qui n'est
// pas habilité. Aucun total affiché.
export default function Chronologie({ patientId, medical }) {
  const filtres = filtresChronologie(medical)
  const [filtreId, setFiltreId] = useState('tout')
  const filtre = filtres.find((f) => f.id === filtreId) ?? filtres[0]
  const requete = useChronologie(patientId, filtre.types)
  const lignes = requete.data?.pages.flatMap((p) => p.lignes) ?? []

  return (
    <div className="chronologie">
      <div className="chronologie__filtres" role="group" aria-label="Afficher">
        {filtres.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chronologie__filtre"
            aria-pressed={f.id === filtre.id}
            onClick={() => setFiltreId(f.id)}
          >
            {f.libelle}
          </button>
        ))}
      </div>

      {requete.isPending ? (
        <Skeleton forme="bloc" hauteur="10rem" />
      ) : requete.error && !lignes.length ? (
        <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
          <p>{requete.error.message}</p>
        </Message>
      ) : lignes.length === 0 ? (
        <EmptyState
          icone={History}
          titre={filtre.id === 'tout' ? 'Rien dans le dossier pour l’instant' : 'Rien de ce type'}
          texte={
            filtre.id === 'tout'
              ? 'Les passages, les rendez-vous et les consultations de ce patient apparaîtront ici.'
              : 'Choisissez « Tout » pour voir tout le dossier.'
          }
        />
      ) : (
        <>
          <ul className="chronologie__liste">
            {lignes.map((l) => (
              <LigneChronologie key={`${l.kind}-${l.item_id}`} ligne={l} />
            ))}
          </ul>
          {requete.isFetchNextPageError && (
            <Message ton="erreur">
              <p>{requete.error?.message ?? 'La suite n’a pas pu être chargée.'}</p>
            </Message>
          )}
          {requete.hasNextPage && (
            <div>
              <Button
                variante="secondaire"
                chargement={requete.isFetchingNextPage}
                onClick={() => requete.fetchNextPage()}
              >
                Afficher plus
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
