import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import Avatar from '../../../../components/ui/Avatar/Avatar.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import RecadrageImage from '../../../../components/ui/RecadrageImage/RecadrageImage.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { cles, envoyerPhoto, urlPhoto } from '../../api.js'
import { nomComplet } from '../../utils.js'
import './PhotoPatient.css'

// Photo d'identité : bucket privé, lue par URL signée (valable une heure). Une nouvelle
// photo a un nouveau nom : l'ancienne n'est ni remplacée ni supprimée.
export default function PhotoPatient({ patient, cle, ecrire }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const champ = useRef(null)
  const [fichier, setFichier] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const url = useQuery({
    queryKey: cles.photo(patient.photo_path),
    queryFn: () => urlPhoto(patient.photo_path),
    enabled: Boolean(patient.photo_path),
    staleTime: 50 * 60 * 1000,
  })

  async function valider(blob) {
    setEnvoi(true)
    setErreur(null)
    try {
      const misAJour = await envoyerPhoto(patient, blob)
      queryClient.setQueryData(cle, (ancien) => ({ ...ancien, ...misAJour }))
      setFichier(null)
      toast.succes('Photo enregistrée')
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="photo-patient">
      <Avatar nom={nomComplet(patient)} src={url.data} taille="l" decoratif />
      {ecrire && (
        <>
          <input
            ref={champ}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const choisi = e.target.files?.[0]
              e.target.value = ''
              if (choisi) setFichier(choisi)
            }}
          />
          <Button
            variante="discret"
            iconeDebut={<Icone icone={Camera} />}
            onClick={() => champ.current?.click()}
          >
            {patient.photo_path ? 'Changer la photo' : 'Ajouter une photo'}
          </Button>
        </>
      )}
      {fichier && (
        <RecadrageImage
          key={fichier.name + fichier.lastModified}
          fichier={fichier}
          titre="Recadrer la photo"
          description="Placez le visage au centre du carré, puis ajustez le zoom. Demandez l’accord de la personne."
          libelleValider="Utiliser cette photo"
          libelleApercu="Aperçu de la photo"
          envoi={envoi}
          erreurEnvoi={erreur}
          onFermer={() => setFichier(null)}
          onValider={valider}
        />
      )}
    </div>
  )
}
