import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useBrouillon } from '../../../hooks/useBrouillon.js'
import {
  LIGNES_MAX,
  libelleRepere,
  lignesLues,
  ligneVide,
  lireRepere,
  prochainId,
  SAISIE_VIDE,
} from '../import/registre.js'
import { envoyerImport, marquerDoublons } from '../import/traitement.js'
import { preparerLignes } from '../import/validation.js'

// Page de registre papier recopiée, en trois temps :
//   1. saisie dans la grille, brouillon gardé sur l'appareil (coupures d'électricité) ;
//   2. vérification (mêmes règles que l'import d'un fichier) : lignes en erreur signalées
//      dans la grille, puis aperçu avec les doublons probables, ignorés par défaut ;
//   3. envoi après confirmation, journalisé avec le repère « année, page ».
// Après l'envoi, les lignes enregistrées et les doublons ignorés quittent la grille ; les
// lignes refusées y restent pour être corrigées. Page entièrement enregistrée : la grille
// se vide et la page passe à la suivante.
// Objet sans la clé donnée (erreurs d'une ligne corrigée ou supprimée).
function sans(objet, cle) {
  const copie = { ...objet }
  delete copie[cle]
  return copie
}

export function useSaisieRegistre(orgId, codePays) {
  const queryClient = useQueryClient()
  const brouillon = useBrouillon(`patients.registre.${orgId}`, SAISIE_VIDE)
  const saisie = brouillon.valeur
  const [etape, setEtape] = useState('saisie') // saisie | apercu | envoi | resultat
  const [verification, setVerification] = useState({ enCours: false, erreur: null })
  const [erreursLignes, setErreursLignes] = useState({}) // id de ligne -> [messages]
  const [erreursRepere, setErreursRepere] = useState({})
  const [apercu, setApercu] = useState({ lignes: [], ids: new Map() }) // numéro -> id
  const [envoi, setEnvoi] = useState({ lot: 0, total: 0 })
  const [resultat, setResultat] = useState(null)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  function changerLignes(transformer) {
    brouillon.setValeur((s) => ({ ...s, lignes: transformer(s.lignes) }))
  }

  function modifierCellule(id, cle, valeur) {
    changerLignes((ls) => ls.map((l) => (l.id === id ? { ...l, [cle]: valeur } : l)))
    if (erreursLignes[id]) {
      setErreursLignes((e) => sans(e, id))
    }
  }

  function modifierRepere(cle, valeur) {
    brouillon.setValeur((s) => ({ ...s, [cle]: valeur }))
    if (erreursRepere[cle]) setErreursRepere((e) => sans(e, cle))
  }

  // Nouvelle ligne après la ligne d'index donné (à la fin par défaut). Renvoie son id,
  // ou null quand la page compte déjà 60 lignes.
  function ajouterLigne(apresIndex = saisie.lignes.length - 1) {
    if (saisie.lignes.length >= LIGNES_MAX) return null
    const id = prochainId(saisie.lignes)
    changerLignes((ls) => [
      ...ls.slice(0, apresIndex + 1),
      ligneVide(id),
      ...ls.slice(apresIndex + 1),
    ])
    return id
  }

  function supprimerLigne(id) {
    changerLignes((ls) => {
      const reste = ls.filter((l) => l.id !== id)
      return reste.length ? reste : [ligneVide(prochainId(ls))]
    })
    setErreursLignes((e) => sans(e, id))
  }

  // continuer : passer à l'aperçu malgré des lignes en erreur (elles restent dans la grille).
  async function verifier({ continuer = false } = {}) {
    const repere = lireRepere(saisie)
    setErreursRepere(repere.erreurs)
    if (Object.keys(repere.erreurs).length) {
      setVerification({ enCours: false, erreur: 'Corrigez l’année ou la page du registre.' })
      return
    }
    const lues = lignesLues(saisie.lignes)
    if (!lues.length) {
      setVerification({
        enCours: false,
        erreur: 'La page est vide : recopiez au moins un patient.',
      })
      return
    }
    const ids = new Map(lues.map((l) => [l.numero, l.id]))
    const preparees = preparerLignes(lues, codePays)
    const enErreur = Object.fromEntries(
      preparees.filter((l) => l.statut === 'erreur').map((l) => [ids.get(l.numero), l.erreurs]),
    )
    setErreursLignes(enErreur)
    if (Object.keys(enErreur).length && !continuer) {
      setVerification({ enCours: false, erreur: null })
      return
    }

    setVerification({ enCours: true, erreur: null })
    try {
      setApercu({ lignes: await marquerDoublons(orgId, preparees, 'registre'), ids })
      setErreurEnvoi(null)
      setEtape('apercu')
      setVerification({ enCours: false, erreur: null })
    } catch (e) {
      setVerification({ enCours: false, erreur: e.message })
    }
  }

  function decider(numero, importer) {
    setApercu((a) => ({
      ...a,
      lignes: a.lignes.map((l) => (l.numero === numero ? { ...l, importer } : l)),
    }))
  }

  function toutDecider(importer) {
    setApercu((a) => ({
      ...a,
      lignes: a.lignes.map((l) => (l.statut === 'doublon' ? { ...l, importer } : l)),
    }))
  }

  function retourGrille() {
    setEtape('saisie')
    setResultat(null)
    setErreurEnvoi(null)
  }

  async function confirmer() {
    const repere = lireRepere(saisie)
    setEtape('envoi')
    setErreurEnvoi(null)
    let bilan
    try {
      bilan = await envoyerImport(orgId, {
        source: 'registre',
        journal: { annee: repere.annee, page: repere.page },
        lignes: apercu.lignes,
        onLot: (lot, total) => setEnvoi({ lot, total }),
      })
    } catch (e) {
      // Le journal n'a pas pu s'ouvrir : rien n'a été enregistré, la grille est intacte.
      setErreurEnvoi(e.message)
      setEtape('apercu')
      return
    }

    // Lignes refusées (vérification, base, envoi interrompu) : gardées pour correction.
    const raisons = new Map(bilan.refusees.map((r) => [apercu.ids.get(r.numero), r.raison]))
    const restantes = saisie.lignes.filter((l) => raisons.has(l.id))
    if (restantes.length) {
      brouillon.setValeur((s) => ({ ...s, lignes: restantes }))
      setErreursLignes(Object.fromEntries(restantes.map((l) => [l.id, [raisons.get(l.id)]])))
    } else {
      // Page entièrement enregistrée : les données des patients quittent l'appareil, la
      // grille se vide et la page passe à la suivante.
      brouillon.effacer()
      brouillon.setValeur({
        ...SAISIE_VIDE,
        annee: saisie.annee,
        page: repere.page ? String(Math.min(repere.page + 1, 10000)) : '',
      })
      setErreursLignes({})
    }
    setResultat({ ...bilan, restantes: restantes.length, repere: libelleRepere(repere) })
    setEtape('resultat')
    if (bilan.importees > 0) {
      queryClient.invalidateQueries({ queryKey: ['patients', 'recherche', orgId] })
    }
  }

  return {
    saisie,
    brouillon,
    etape,
    verification,
    erreursLignes,
    erreursRepere,
    apercu: apercu.lignes,
    libelleRepere: libelleRepere(lireRepere(saisie)),
    envoi,
    resultat,
    erreurEnvoi,
    modifierCellule,
    modifierRepere,
    ajouterLigne,
    supprimerLigne,
    verifier,
    decider,
    toutDecider,
    retourGrille,
    confirmer,
  }
}
