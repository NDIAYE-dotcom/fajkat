import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { estEmailValide } from '../../../../lib/motDePasse.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import { chargerFiche, cles, enregistrerIdentite } from '../../api.js'
import { lireHoraires, validerHoraires } from '../../utils.js'
import ChampLogo from '../ChampLogo/ChampLogo.jsx'
import ChargementEtape from '../ChargementEtape/ChargementEtape.jsx'
import EtapeCadre from '../EtapeCadre/EtapeCadre.jsx'
import HorairesSemaine from '../HorairesSemaine/HorairesSemaine.jsx'
import './EtapeIdentite.css'

// Écran 1 : identité de la structure. Les données enregistrées sont chargées d'abord,
// pour que le brouillon parte de ce qui est déjà en base.
export default function EtapeIdentite(props) {
  const fiche = useQuery({
    queryKey: cles.fiche(props.structure.id),
    queryFn: () => chargerFiche(props.structure.id),
  })
  if (!fiche.data) return <ChargementEtape erreur={fiche.error} onReessayer={fiche.refetch} />
  return <Formulaire {...props} fiche={fiche.data} onEnregistre={fiche.refetch} />
}

function valeursDe(fiche) {
  return {
    logo_url: fiche.logo_url ?? '',
    address: fiche.address ?? '',
    phone: fiche.phone ?? '',
    email: fiche.email ?? '',
    authorization_number: fiche.authorization_number ?? '',
    horaires: lireHoraires(fiche.settings),
  }
}

function valider(v) {
  const erreurs = {}
  if (v.phone && !estTelephoneValide(v.phone))
    erreurs.phone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  if (v.email.trim() && !estEmailValide(v.email))
    erreurs.email = 'Adresse e-mail non valide, par exemple poste.dioulacolon@gmail.com.'
  const horaires = validerHoraires(v.horaires)
  if (Object.keys(horaires).length) erreurs.horaires = horaires
  return erreurs
}

function Formulaire(props) {
  const { structure, fiche, onEnregistre, enregistrer, passer, precedent, suivant, edition } = props
  const [initiale] = useState(() => valeursDe(fiche))
  const brouillon = useBrouillon(`demarrage.${structure.id}.identite`, initiale)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((precedente) => ({ ...precedente, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }
  const texte = (champ) => (evenement) => maj(champ, evenement.target.value)

  async function surEnvoyer() {
    const trouvees = valider(v)
    setErreurs(trouvees)
    const premiere = ['phone', 'email'].find((champ) => trouvees[champ])
    if (premiere) document.getElementById(`identite-${premiere}`)?.focus()
    if (Object.keys(trouvees).length) return
    setEnvoi(true)
    setErreurEnvoi(null)
    const nettoye = (valeur) => valeur.trim() || null
    try {
      await enregistrerIdentite(structure.id, {
        logo_url: v.logo_url || null,
        address: nettoye(v.address),
        phone: v.phone || null,
        email: nettoye(v.email)?.toLowerCase() ?? null,
        authorization_number: nettoye(v.authorization_number),
      })
      await enregistrer({ reglages: { opening_hours: v.horaires } })
      onEnregistre()
      brouillon.effacer()
      suivant()
    } catch (e) {
      setErreurEnvoi(e.message)
      setEnvoi(false)
    }
  }

  return (
    <EtapeCadre
      titre="Identité de la structure"
      pourquoi="Ces informations figurent sur vos ordonnances, reçus et certificats, et permettent aux patients de vous joindre."
      edition={edition}
      brouillon={brouillon}
      erreur={erreurEnvoi}
      envoi={envoi}
      onEnvoyer={surEnvoyer}
      onPasser={passer}
      onPrecedent={precedent}
    >
      <ChampLogo orgId={structure.id} value={v.logo_url} onChange={(url) => maj('logo_url', url)} />

      <Field
        id="identite-address"
        label="Adresse"
        facultatif
        aide="Quartier, rue, repère connu : par exemple « Face à la mosquée de Sare Moussa »."
      >
        <Input autoComplete="street-address" value={v.address} onChange={texte('address')} />
      </Field>

      <div className="etape-identite__grille">
        <Field
          id="identite-phone"
          label="Téléphone de la structure"
          facultatif
          erreur={erreurs.phone}
        >
          <PhoneInput value={v.phone} onChange={(valeur) => maj('phone', valeur)} />
        </Field>
        <Field id="identite-email" label="E-mail de la structure" facultatif erreur={erreurs.email}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={v.email}
            onChange={texte('email')}
          />
        </Field>
      </div>

      <Field
        id="identite-authorization_number"
        label="Numéro d’autorisation"
        facultatif
        aide="Tel qu’il figure sur votre autorisation d’ouverture. Il apparaîtra sur vos documents."
      >
        <Input mono value={v.authorization_number} onChange={texte('authorization_number')} />
      </Field>

      <HorairesSemaine
        value={v.horaires}
        erreurs={erreurs.horaires}
        onChange={(horaires) => maj('horaires', horaires)}
      />
    </EtapeCadre>
  )
}
