import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, Pencil } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDateHeure } from '../../../../lib/format.js'
import { chargerMedical, cles, enregistrerMedical } from '../../api.js'
import { GROUPES_SANGUINS } from '../../fiche.js'
import { usePermissionsPatients } from '../../hooks/usePermissionsPatients.js'
import './OngletMedical.css'

const ID = 'medical'

function saisieDe(m) {
  return {
    groupe: m?.blood_group ?? '',
    allergies: m?.allergies ?? '',
    antecedents: m?.medical_history ?? '',
    sensible: Boolean(m?.is_sensitive),
  }
}

// Données médicales : uniquement par get_ / save_patient_medical (soignants habilités).
// Pas de brouillon dans le navigateur : ces données ne doivent pas rester sur l'appareil.
// En cas d'échec, la saisie reste dans le formulaire.
export default function OngletMedical({ patient }) {
  const { structure } = useOrganization()
  const droits = usePermissionsPatients(structure.id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const [edition, setEdition] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const medical = useQuery({
    queryKey: cles.medical(patient.id),
    queryFn: () => chargerMedical(patient.id),
    // Aucune copie gardée en mémoire après la sortie de l'onglet.
    gcTime: 0,
  })

  if (medical.isPending) return <Skeleton largeur="50%" />
  if (medical.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => medical.refetch()}>Réessayer</Button>}>
        <p>{medical.error.message}</p>
      </Message>
    )
  }
  const m = medical.data
  const masque = Boolean(m?.history_hidden)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    setEnvoi(true)
    setEchec(null)
    try {
      // Antécédents masqués : la base les conserve, quoi qu'on envoie.
      await enregistrerMedical(patient.id, {
        ...edition,
        antecedents: masque ? null : edition.antecedents,
      })
      await queryClient.invalidateQueries({ queryKey: cles.medical(patient.id) })
      setEdition(null)
      toast.succes('Données médicales enregistrées')
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  if (edition) {
    const maj = (champ, valeur) => setEdition((p) => ({ ...p, [champ]: valeur }))
    return (
      <form className="onglet-medical" noValidate onSubmit={surEnvoi}>
        <Field id={`${ID}-groupe`} label="Groupe sanguin" facultatif>
          <Select
            placeholder="Inconnu"
            options={GROUPES_SANGUINS}
            value={edition.groupe}
            onChange={(e) => maj('groupe', e.target.value)}
          />
        </Field>
        <Field id={`${ID}-allergies`} label="Allergies" facultatif>
          <Textarea
            rows={3}
            maxLength={1000}
            value={edition.allergies}
            onChange={(e) => maj('allergies', e.target.value)}
          />
        </Field>
        {masque ? (
          <Message ton="info" titre="Antécédents masqués">
            <p>Ils sont réservés aux soignants habilités et restent inchangés.</p>
          </Message>
        ) : (
          <Field id={`${ID}-antecedents`} label="Antécédents" facultatif>
            <Textarea
              rows={5}
              maxLength={4000}
              value={edition.antecedents}
              onChange={(e) => maj('antecedents', e.target.value)}
            />
          </Field>
        )}
        {droits.sensible && (
          <Checkbox
            label="Antécédents sensibles"
            description="VIH / PTME, santé mentale… Masqués à l’aide-soignant ; chaque lecture est journalisée."
            checked={edition.sensible}
            onChange={(e) => maj('sensible', e.target.checked)}
          />
        )}
        {echec && (
          <Message ton="erreur" titre="Données non enregistrées">
            <p>{echec}</p>
          </Message>
        )}
        <div className="onglet-medical__actions">
          <Button variante="secondaire" onClick={() => setEdition(null)} disabled={envoi}>
            Annuler
          </Button>
          <Button type="submit" chargement={envoi} disabled={!enLigne}>
            Enregistrer
          </Button>
        </div>
      </form>
    )
  }

  const lignes = [
    ['Groupe sanguin', m?.blood_group],
    ['Allergies', m?.allergies],
    [
      'Antécédents',
      masque ? (
        <span className="onglet-medical__masque">
          <Icone icone={EyeOff} />
          Masqués : réservés aux soignants habilités
        </span>
      ) : (
        m?.medical_history
      ),
    ],
  ]

  return (
    <div className="onglet-medical">
      <div className="onglet-medical__entete">
        {m?.is_sensitive && <Tampon ton="alerte">Sensible</Tampon>}
        {m?.updated_at && (
          <p className="onglet-medical__maj">Mis à jour le {formatDateHeure(m.updated_at)}</p>
        )}
      </div>
      <dl className="onglet-medical__liste">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="onglet-medical__ligne">
            <dt className="onglet-medical__terme">{terme}</dt>
            <dd className="onglet-medical__valeur">
              {valeur || <span className="onglet-medical__vide">Non renseigné</span>}
            </dd>
          </div>
        ))}
      </dl>
      {droits.ecrire && (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Pencil} />}
            onClick={() => setEdition(saisieDe(m))}
          >
            Modifier les données médicales
          </Button>
        </div>
      )}
    </div>
  )
}
