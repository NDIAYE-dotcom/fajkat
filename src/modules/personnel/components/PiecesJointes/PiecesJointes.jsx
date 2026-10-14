import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Paperclip } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatDate } from '../../../../lib/format.js'
import { chargerPieces, cles, envoyerPiece, retirerPiece, urlPiece } from '../../api.js'
import { formatPoids, POIDS_MAX_PIECE, TYPES_PIECE } from '../../utils.js'
import './PiecesJointes.css'

// Pièces jointes d'une fiche (diplôme, contrat, pièce d'identité…). Fichiers privés :
// chaque ouverture demande un lien signé de courte durée. modifiable : owner et admin.
export default function PiecesJointes({ orgId, ficheId, modifiable }) {
  const idTitre = useId()
  const pieces = useQuery({ queryKey: cles.pieces(ficheId), queryFn: () => chargerPieces(ficheId) })
  const queryClient = useQueryClient()
  const [erreur, setErreur] = useState(null)
  const [ouverture, setOuverture] = useState(null)
  const [aRetirer, setARetirer] = useState(null)

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: cles.pieces(ficheId) })

  async function ouvrir(piece) {
    // Fenêtre ouverte tout de suite : sinon le navigateur bloque l'ouverture après l'attente.
    const fenetre = window.open('', '_blank')
    setOuverture(piece.id)
    setErreur(null)
    try {
      const url = await urlPiece(piece.storage_path)
      if (fenetre) fenetre.location.href = url
      else window.location.assign(url)
    } catch (e) {
      fenetre?.close()
      setErreur(e.message)
    } finally {
      setOuverture(null)
    }
  }

  async function retirer(piece) {
    setErreur(null)
    try {
      await retirerPiece(piece.id)
      setARetirer(null)
      rafraichir()
    } catch (e) {
      setErreur(e.message)
    }
  }

  return (
    <section className="pieces-jointes" aria-labelledby={idTitre}>
      <h3 id={idTitre} className="pieces-jointes__titre">
        Pièces jointes
      </h3>

      {erreur && (
        <Message ton="erreur">
          <p>{erreur}</p>
        </Message>
      )}

      {pieces.isPending && (
        <div aria-busy="true" className="pieces-jointes__chargement">
          <Skeleton />
          <Skeleton largeur="60%" />
        </div>
      )}
      {pieces.error && (
        <Message ton="erreur" titre="Pièces jointes indisponibles">
          <p>{pieces.error.message}</p>
          <Button variante="discret" onClick={() => pieces.refetch()}>
            Réessayer
          </Button>
        </Message>
      )}
      {pieces.data?.length === 0 && (
        <p className="pieces-jointes__vide">Aucune pièce jointe pour l’instant.</p>
      )}

      {pieces.data?.length > 0 && (
        <ul className="pieces-jointes__liste">
          {pieces.data.map((piece) => (
            <li key={piece.id} className="pieces-jointes__piece">
              <Icone icone={FileText} />
              <span className="pieces-jointes__nom">
                {piece.label}
                <span className="pieces-jointes__detail">
                  {piece.file_name} · {formatPoids(piece.size_bytes)} · ajouté le{' '}
                  {formatDate(piece.created_at)}
                </span>
              </span>
              <span className="pieces-jointes__actions">
                <Button
                  variante="secondaire"
                  chargement={ouverture === piece.id}
                  onClick={() => ouvrir(piece)}
                  aria-label={`Ouvrir ${piece.label}`}
                >
                  Ouvrir
                </Button>
                {modifiable &&
                  (aRetirer === piece.id ? (
                    <Button variante="secondaire" onClick={() => retirer(piece)}>
                      Confirmer le retrait
                    </Button>
                  ) : (
                    <Button
                      variante="discret"
                      onClick={() => setARetirer(piece.id)}
                      aria-label={`Retirer ${piece.label}`}
                    >
                      Retirer
                    </Button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {modifiable && <AjoutPiece orgId={orgId} ficheId={ficheId} onAjoute={rafraichir} />}
    </section>
  )
}

function AjoutPiece({ orgId, ficheId, onAjoute }) {
  const refFichier = useRef(null)
  const [libelle, setLibelle] = useState('')
  const [fichier, setFichier] = useState(null)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const idLibelle = `piece-${ficheId}-libelle`

  function surChoix(evenement) {
    const choisi = evenement.target.files?.[0]
    evenement.target.value = ''
    if (!choisi) return
    if (!TYPES_PIECE.includes(choisi.type)) {
      setErreurs({ fichier: 'Choisissez un PDF ou une photo (JPG, PNG, WebP).' })
      return
    }
    if (choisi.size > POIDS_MAX_PIECE) {
      setErreurs({ fichier: 'Ce fichier dépasse 10 Mo. Choisissez-en un plus léger.' })
      return
    }
    setErreurs({})
    setFichier(choisi)
  }

  async function ajouter() {
    const trouvees = {}
    if (!libelle.trim()) trouvees.libelle = 'Indiquez ce que contient le fichier.'
    if (!fichier) trouvees.fichier = 'Choisissez un fichier.'
    setErreurs(trouvees)
    if (trouvees.libelle) return document.getElementById(idLibelle)?.focus()
    if (trouvees.fichier) return
    setEnvoi(true)
    setErreurEnvoi(null)
    try {
      await envoyerPiece(orgId, ficheId, fichier, libelle)
      setLibelle('')
      setFichier(null)
      onAjoute()
    } catch (e) {
      setErreurEnvoi(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="pieces-jointes__ajout">
      <Field
        id={idLibelle}
        label="Nouvelle pièce jointe"
        aide="Par exemple « Diplôme d’État » ou « Contrat 2026 »."
        erreur={erreurs.libelle}
      >
        <Input value={libelle} maxLength={120} onChange={(e) => setLibelle(e.target.value)} />
      </Field>
      <input
        ref={refFichier}
        type="file"
        accept={TYPES_PIECE.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={surChoix}
      />
      <div className="pieces-jointes__choix">
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={Paperclip} />}
          onClick={() => refFichier.current?.click()}
        >
          {fichier ? 'Changer de fichier' : 'Choisir un fichier'}
        </Button>
        <span className="pieces-jointes__detail" aria-live="polite">
          {fichier
            ? `${fichier.name} · ${formatPoids(fichier.size)}`
            : 'PDF ou photo, 10 Mo au plus.'}
        </span>
      </div>
      {erreurs.fichier && (
        <p className="pieces-jointes__erreur" role="alert">
          {erreurs.fichier}
        </p>
      )}
      {erreurEnvoi && (
        <Message ton="erreur" titre="Envoi interrompu">
          <p>{erreurEnvoi}</p>
        </Message>
      )}
      <div>
        <Button chargement={envoi} onClick={ajouter}>
          Ajouter la pièce jointe
        </Button>
      </div>
    </div>
  )
}
