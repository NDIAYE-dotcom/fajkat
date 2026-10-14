import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../components/ui/Button/Button.jsx'
import Field from '../../../components/ui/Field/Field.jsx'
import Input from '../../../components/ui/Input/Input.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import Panel from '../../../components/ui/Panel/Panel.jsx'
import PhoneInput from '../../../components/ui/PhoneInput/PhoneInput.jsx'
import Spinner from '../../../components/ui/Spinner/Spinner.jsx'
import { useToast } from '../../../hooks/useToast.js'
import { estTelephoneValide } from '../../../lib/pays.js'
import { chargerMonProfil, CLE_MON_PROFIL, enregistrerMonProfil } from '../../../lib/profil.js'
import './IdentiteProfil.css'

// Nom et téléphone du compte, communs à toutes les structures de l'utilisateur.
export default function IdentiteProfil({ utilisateur }) {
  const profil = useQuery({
    queryKey: CLE_MON_PROFIL(utilisateur.id),
    queryFn: () => chargerMonProfil(utilisateur.id),
  })

  return (
    <Panel titre="Votre compte" marque>
      {profil.isPending && <Spinner libelle="Chargement de votre profil…" />}
      {profil.error && (
        <Message ton="erreur" titre="Votre profil n’a pas pu être chargé">
          <p>{profil.error.message}</p>
          <Button variante="discret" onClick={() => profil.refetch()}>
            Réessayer
          </Button>
        </Message>
      )}
      {profil.data && <Formulaire utilisateur={utilisateur} profil={profil.data} />}
    </Panel>
  )
}

function Formulaire({ utilisateur, profil }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [nom, setNom] = useState(profil.full_name ?? '')
  const [telephone, setTelephone] = useState(profil.phone ?? '')
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = {}
    if (nom.trim().length < 2) trouvees.nom = 'Indiquez votre prénom et votre nom.'
    if (telephone && !estTelephoneValide(telephone))
      trouvees.telephone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
    setErreurs(trouvees)
    if (trouvees.nom) return document.getElementById('profil-nom')?.focus()
    if (trouvees.telephone) return document.getElementById('profil-telephone')?.focus()
    setEnvoi(true)
    setEchec(null)
    try {
      await enregistrerMonProfil(utilisateur.id, { nomComplet: nom.trim(), telephone })
      queryClient.setQueryData(CLE_MON_PROFIL(utilisateur.id), {
        full_name: nom.trim(),
        phone: telephone || null,
      })
      toast.succes('Profil enregistré')
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form className="identite-profil" noValidate onSubmit={surEnvoi}>
      <Field id="profil-nom" label="Prénom et nom" requis erreur={erreurs.nom}>
        <Input
          autoComplete="name"
          value={nom}
          maxLength={160}
          onChange={(e) => setNom(e.target.value)}
        />
      </Field>
      <Field
        id="profil-telephone"
        label="Téléphone"
        facultatif
        aide="Votre numéro personnel. Chaque structure garde aussi le sien sur votre fiche."
        erreur={erreurs.telephone}
      >
        <PhoneInput value={telephone} onChange={setTelephone} />
      </Field>
      <div className="identite-profil__email">
        <span className="identite-profil__terme">E-mail de connexion</span>
        <span className="identite-profil__valeur">{utilisateur.email || '—'}</span>
      </div>
      {echec && (
        <Message ton="erreur" titre="Profil non enregistré">
          <p>{echec}</p>
        </Message>
      )}
      <div>
        <Button type="submit" chargement={envoi}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
