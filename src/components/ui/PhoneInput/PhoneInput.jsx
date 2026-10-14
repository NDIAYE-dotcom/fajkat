import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useCurseurChiffres } from '../../../hooks/useCurseurChiffres.js'
import {
  PAYS_PAR_DEFAUT,
  PAYS_UEMOA,
  decouperE164,
  grouperChiffres,
  longueurNationale,
  paysParCode,
} from '../../../lib/pays.js'
import Input from '../Input/Input.jsx'
import Icone from '../Icone/Icone.jsx'
import './PhoneInput.css'

// Numéro collé ou tapé avec son indicatif (« +221 77… », « 00221 77… ») : on reconnaît le pays
// et on ne garde que le numéro national.
function analyserSaisie(chiffres, paysCourant) {
  const sansZeros = chiffres.replace(/^00/, '')
  for (const pays of [paysCourant, ...PAYS_UEMOA]) {
    if (
      sansZeros.startsWith(pays.indicatif) &&
      sansZeros.length === pays.indicatif.length + longueurNationale(pays)
    ) {
      return { pays, national: sansZeros.slice(pays.indicatif.length) }
    }
  }
  return { pays: paysCourant, national: chiffres.slice(0, longueurNationale(paysCourant)) }
}

// Téléphone : indicatif UEMOA + numéro national. Valeur au format E.164 (« +221771234567 »),
// chaîne vide si aucun chiffre. Affichage groupé selon le pays : « 77 123 45 67 ».
export default function PhoneInput({
  value = '',
  onChange,
  paysParDefaut = PAYS_PAR_DEFAUT,
  ref,
  ...props
}) {
  const parties = decouperE164(value)
  const [codePays, setCodePays] = useState(parties?.pays.code ?? paysParDefaut)
  // Un numéro reçu de l'extérieur (brouillon, dossier existant) fixe le pays ;
  // champ vide : on garde le pays choisi dans la liste.
  const pays = parties?.pays ?? paysParCode(codePays) ?? paysParCode(PAYS_PAR_DEFAUT)
  const national = parties?.national ?? ''
  const { ref: refChamp, memoriser } = useCurseurChiffres(ref)

  function emettre(paysChoisi, chiffres) {
    onChange?.(chiffres ? `+${paysChoisi.indicatif}${chiffres}` : '')
  }

  function surSaisie(evenement) {
    memoriser(evenement)
    const resultat = analyserSaisie(evenement.target.value.replace(/\D/g, ''), pays)
    if (resultat.pays.code !== pays.code) setCodePays(resultat.pays.code)
    emettre(resultat.pays, resultat.national)
  }

  function surChangementPays(evenement) {
    const nouveau = paysParCode(evenement.target.value)
    setCodePays(nouveau.code)
    emettre(nouveau, national.slice(0, longueurNationale(nouveau)))
  }

  const modele = grouperChiffres('0'.repeat(longueurNationale(pays)), pays.groupes)

  return (
    <Input
      {...props}
      ref={refChamp}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      mono
      className="phone-input"
      placeholder={props.placeholder ?? modele}
      value={grouperChiffres(national, pays.groupes)}
      onChange={surSaisie}
      prefixe={
        <span className="phone-input__pays">
          <span className="phone-input__indicatif" aria-hidden="true">
            +{pays.indicatif}
            <Icone icone={ChevronDown} taille={16} />
          </span>
          <select
            className="phone-input__liste"
            aria-label={`Pays : ${pays.nom} (+${pays.indicatif})`}
            value={pays.code}
            disabled={props.disabled}
            onChange={surChangementPays}
          >
            {PAYS_UEMOA.map((p) => (
              <option key={p.code} value={p.code}>
                {p.nom} (+{p.indicatif})
              </option>
            ))}
          </select>
        </span>
      }
    />
  )
}
