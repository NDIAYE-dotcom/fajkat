import { Download, ExternalLink, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatDate } from '../../../../lib/format.js'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { useEnTeteStructure, useVoies } from '../../hooks/useOrdonnance.js'
import { libellesPrises, LIBELLES_PRISES } from '../../ordonnance.js'
import './ImpressionOrdonnance.css'

// Impression d'une ordonnance validée (soignants qui rédigent). Le PDF A5 est préparé dès
// l'ouverture, puis à chaque changement de langue des libellés : les boutons agissent
// aussitôt (un onglet ouvert après une attente serait bloqué par le navigateur).
export default function ImpressionOrdonnance({ ouvert, onFermer, ordonnance, patient }) {
  const { structure } = useOrganization()
  const enTete = useEnTeteStructure(structure.id, ouvert)
  const voies = useVoies()
  const [wolof, setWolof] = useState(false)
  const [essai, setEssai] = useState(0)
  // PDF préparé pour une demande (langue, essai) : { cle, fichier, erreur }. Un résultat
  // d'une autre demande est ignoré.
  const [resultat, setResultat] = useState({})
  const cadre = useRef(null)
  const pret = ouvert && enTete.data && voies.data && patient
  const demande = `${wolof ? 'wo' : 'fr'}-${essai}-${ordonnance?.id}`
  const fichier = resultat.cle === demande ? resultat.fichier : null
  const erreur = resultat.cle === demande ? resultat.erreur : null

  useEffect(() => {
    if (!pret) return undefined
    let annule = false
    let adresse = null
    import('../../pdf/genererOrdonnance.js')
      .then(({ genererOrdonnance }) =>
        genererOrdonnance({
          structure: enTete.data,
          patient: { nom: nomComplet(patient), age: libelleAge(patient) },
          date: formatDate(ordonnance.prescribed_at),
          ordonnance,
          voies: voies.data,
          libelles: libellesPrises(demande.startsWith('wo') ? 'wo' : 'fr', structure.settings),
        }),
      )
      .then((blob) => {
        if (annule) return
        adresse = URL.createObjectURL(blob)
        setResultat({ cle: demande, fichier: adresse })
      })
      .catch(() => {
        if (!annule) {
          setResultat({
            cle: demande,
            erreur:
              'L’ordonnance n’a pas pu être préparée. Vérifiez la connexion (la première impression télécharge les polices), puis réessayez.',
          })
        }
      })
    return () => {
      annule = true
      if (adresse) URL.revokeObjectURL(adresse)
    }
  }, [pret, demande, enTete.data, voies.data, patient, ordonnance, structure.settings])

  // Le PDF est chargé dans un cadre sans taille, créé le temps de l'impression ; sans
  // lecteur PDF dans le navigateur (certains téléphones), il s'ouvre dans un onglet.
  function imprimer() {
    if (!fichier) return
    cadre.current?.remove()
    const iframe = document.createElement('iframe')
    iframe.title = 'Ordonnance à imprimer'
    iframe.className = 'impression-ordonnance__cadre'
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch {
        window.open(fichier, '_blank', 'noopener')
      }
    }
    iframe.src = fichier
    document.body.append(iframe)
    cadre.current = iframe
  }

  // Cadre retiré à la fermeture de la fenêtre.
  useEffect(() => {
    if (ouvert) return undefined
    cadre.current?.remove()
    cadre.current = null
    return undefined
  }, [ouvert])

  const erreurChargement = enTete.error || voies.error
  const wo = libellesPrises('wo', structure.settings)
  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Imprimer l’ordonnance"
      description="Format A5, lisible en noir et blanc. Ni diagnostic ni type de consultation."
    >
      <div className="impression-ordonnance">
        <Checkbox
          label="Libellés en wolof"
          description={`${Object.values(LIBELLES_PRISES.fr).join(', ')} deviennent ${Object.values(wo).join(', ')}.`}
          checked={wolof}
          onChange={(e) => setWolof(e.target.checked)}
        />
        {(erreur || erreurChargement) && (
          <Message
            ton="erreur"
            action={
              <Button
                variante="secondaire"
                onClick={() => {
                  enTete.refetch()
                  voies.refetch()
                  setEssai((n) => n + 1)
                }}
              >
                Réessayer
              </Button>
            }
          >
            <p>{erreur ?? erreurChargement.message}</p>
          </Message>
        )}
        {!fichier && !erreur && !erreurChargement && (
          <p className="impression-ordonnance__attente">
            <Spinner taille={16} /> Préparation de l’ordonnance…
          </p>
        )}
        <div className="impression-ordonnance__actions">
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Download} />}
            href={fichier ?? undefined}
            download={`ordonnance-${(ordonnance.prescribed_at ?? '').slice(0, 10)}.pdf`}
            aria-disabled={!fichier}
            className={fichier ? '' : 'impression-ordonnance__inactif'}
          >
            Télécharger
          </Button>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={ExternalLink} />}
            href={fichier ?? undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={!fichier}
            className={fichier ? '' : 'impression-ordonnance__inactif'}
          >
            Ouvrir le PDF
          </Button>
          <Button iconeDebut={<Icone icone={Printer} />} disabled={!fichier} onClick={imprimer}>
            Imprimer
          </Button>
        </div>
      </div>
    </Modal>
  )
}
