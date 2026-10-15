import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { dialogueDuDessus } from '../../../../lib/dialoguesOuverts.js'
import { usePermissionsPatients } from '../../../../modules/patients/hooks/usePermissionsPatients.js'
import {
  requeteSuffisante,
  useRecherchePatients,
} from '../../../../modules/patients/hooks/useRecherchePatients.js'
import BoutonIcone from '../../../ui/BoutonIcone/BoutonIcone.jsx'
import SearchBar from '../../../ui/SearchBar/SearchBar.jsx'
import ResultatsRecherche from '../ResultatsRecherche/ResultatsRecherche.jsx'
import './RechercheGlobale.css'

const NB_RESULTATS = 6

// La touche « / » ne doit jamais voler la frappe d'un champ (une date 12/03/2026, une
// posologie 1/2…) : on regarde la cible de l'événement ET l'élément qui a le focus.
function estChampDeSaisie(element) {
  return Boolean(
    element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
  )
}

function frappeDansUnChamp(evenement) {
  return (
    evenement.isComposing ||
    estChampDeSaisie(evenement.target) ||
    estChampDeSaisie(document.activeElement)
  )
}

// Recherche des patients dans l'en-tête, depuis n'importe quel écran (motif combobox :
// flèches, Entrée, Échap). Dès 2 caractères : quelques résultats, « Voir tous les
// résultats » (registre filtré) et « Nouveau patient ». Sur téléphone, une loupe ouvre
// le champ sous l'en-tête. Raccourci : « / » place le curseur dans le champ.
export default function RechercheGlobale() {
  const { structure } = useOrganization()
  const naviguer = useNavigate()
  const droits = usePermissionsPatients(structure?.id)
  const [valeur, setValeur] = useState('')
  const [ouverte, setOuverte] = useState(false)
  const [listeOuverte, setListeOuverte] = useState(false)
  const [actif, setActif] = useState(-1)
  const zone = useRef(null)
  const idListe = `recherche-globale-${useId()}`

  const recherche = useRecherchePatients(structure?.id, valeur, {
    parPage: NB_RESULTATS,
    vide: 'rien',
  })
  const assez = requeteSuffisante(valeur)

  // Options au clavier : les patients, puis « Voir tous les résultats », puis « Nouveau patient ».
  const options = [
    ...recherche.lignes.map((p) => ({ type: 'patient', patient: p })),
    ...(assez ? [{ type: 'tous' }] : []),
    ...(droits.ecrire ? [{ type: 'nouveau' }] : []),
  ]
  const afficher = listeOuverte && valeur.trim() !== ''

  const champ = () => zone.current?.querySelector('input')

  useEffect(() => {
    function surTouche(evenement) {
      if (evenement.key !== '/' || evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
        return
      }
      if (evenement.defaultPrevented || frappeDansUnChamp(evenement) || dialogueDuDessus()) return
      evenement.preventDefault()
      setOuverte(true)
      requestAnimationFrame(() => champ()?.focus())
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [])

  function ouvrir() {
    setOuverte(true)
    requestAnimationFrame(() => champ()?.focus())
  }

  function fermer() {
    setListeOuverte(false)
    setActif(-1)
  }

  function choisir(option) {
    const q = valeur.trim()
    if (option.type === 'patient') naviguer(`/app/patients/${option.patient.id}`)
    else if (option.type === 'tous') naviguer(`/app/patients?q=${encodeURIComponent(q)}`)
    else naviguer('/app/patients?nouveau=1')
    setValeur('')
    fermer()
    setOuverte(false)
    champ()?.blur()
  }

  function surTouchesChamp(evenement) {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault()
      if (!options.length) return
      setListeOuverte(true)
      const pas = evenement.key === 'ArrowDown' ? 1 : -1
      const n = options.length
      setActif((i) => (i < 0 ? (pas > 0 ? 0 : n - 1) : (i + pas + n) % n))
      return
    }
    if (evenement.key === 'Escape') {
      evenement.preventDefault()
      if (afficher) fermer()
      else {
        setOuverte(false)
        champ()?.blur()
      }
    }
  }

  // Entrée : l'option choisie au clavier, sinon le registre filtré.
  function rechercher() {
    if (afficher && options[actif]) choisir(options[actif])
    else if (assez) choisir({ type: 'tous' })
  }

  // Focus sorti de la zone (champ et liste) : la liste se ferme.
  function surSortie(evenement) {
    if (!zone.current?.contains(evenement.relatedTarget)) fermer()
  }

  const idOption = (i) => `${idListe}-option-${i}`

  return (
    <div className={`recherche-globale${ouverte ? ' recherche-globale--ouverte' : ''}`}>
      <BoutonIcone
        icone={Search}
        label="Rechercher un patient"
        className="recherche-globale__loupe"
        aria-expanded={ouverte}
        onClick={ouverte ? () => setOuverte(false) : ouvrir}
      />
      <div ref={zone} className="recherche-globale__champ" onBlur={surSortie}>
        <SearchBar
          valeur={valeur}
          onChange={(v) => {
            setValeur(v)
            setListeOuverte(true)
            setActif(-1)
          }}
          onRechercher={rechercher}
          chargement={recherche.enCours}
          libelle="Rechercher un patient"
          placeholder="Rechercher un patient"
          champ={{
            role: 'combobox',
            'aria-autocomplete': 'list',
            'aria-expanded': afficher,
            'aria-controls': idListe,
            'aria-activedescendant': afficher && options[actif] ? idOption(actif) : undefined,
            onKeyDown: surTouchesChamp,
            onFocus: () => setListeOuverte(true),
          }}
        />
        {!valeur && (
          <kbd className="recherche-globale__touche" aria-hidden="true">
            /
          </kbd>
        )}
        <ResultatsRecherche
          id={idListe}
          visible={afficher}
          options={options}
          actif={actif}
          idOption={idOption}
          recherche={recherche}
          assez={assez}
          requete={valeur.trim()}
          onChoisir={choisir}
          onSurvol={setActif}
        />
      </div>
    </div>
  )
}
