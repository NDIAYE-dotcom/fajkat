import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { chercherDoublonsImport, commencerImport, importerLot } from '../api.js'
import { lireFichier } from '../import/lecture.js'
import { criteresDoublon, preparerLignes } from '../import/validation.js'
import { nomComplet, RAISONS_DOUBLON } from '../utils.js'

const TAILLE_LOT = 500

export const RAISONS_IMPORT = {
  ...RAISONS_DOUBLON,
  meme_ancien_numero: 'Même ancien n° de dossier, nom proche',
}

function lots(liste) {
  const resultat = []
  for (let i = 0; i < liste.length; i += TAILLE_LOT) resultat.push(liste.slice(i, i + TAILLE_LOT))
  return resultat
}

// Raison écrite dans le fichier des doublons ignorés.
function raisonDoublon(ligne) {
  if (ligne.ligneJumelle) return `Même patient que la ligne ${ligne.ligneJumelle} du fichier`
  return ligne.candidats
    .map((c) => `${c.file_number} ${nomComplet(c)} (${RAISONS_IMPORT[c.reason] ?? c.reason})`)
    .join(' ; ')
}

// Import d'une liste de patients, en trois temps :
//   1. lecture et vérification du fichier, doublons probables (rien n'est enregistré) ;
//   2. aperçu : chaque doublon est ignoré par défaut (un import relancé après une coupure
//      ne crée pas de doublons), « Tout importer » ou ligne par ligne ;
//   3. envoi par lots de 500 après confirmation, journalisé par la base.
export function useImportPatients(orgId, codePays) {
  const queryClient = useQueryClient()
  const [etape, setEtape] = useState('fichier') // fichier | apercu | envoi | resultat
  const [lecture, setLecture] = useState({ enCours: false, erreur: null })
  const [fichier, setFichier] = useState(null) // { nom, entetes, inconnues }
  const [lignes, setLignes] = useState([])
  const [envoi, setEnvoi] = useState({ lot: 0, total: 0 })
  const [resultat, setResultat] = useState(null)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  async function choisirFichier(f) {
    setLecture({ enCours: true, erreur: null })
    try {
      const lu = await lireFichier(f)
      const preparees = preparerLignes(lu.lignes, codePays)
      const aVerifier = preparees.filter((l) => l.statut === 'valide')
      const candidats = new Map()
      for (const lot of lots(aVerifier)) {
        const trouves = await chercherDoublonsImport(orgId, lot.map(criteresDoublon))
        for (const c of trouves) candidats.set(c.line, [...(candidats.get(c.line) ?? []), c])
      }
      setLignes(
        preparees.map((l) =>
          candidats.has(l.numero)
            ? { ...l, statut: 'doublon', candidats: candidats.get(l.numero) }
            : l,
        ),
      )
      setFichier({ nom: f.name, entetes: lu.entetes, inconnues: lu.inconnues })
      setEtape('apercu')
      setLecture({ enCours: false, erreur: null })
    } catch (e) {
      setLecture({ enCours: false, erreur: e.message })
    }
  }

  function decider(numero, importer) {
    setLignes((ls) => ls.map((l) => (l.numero === numero ? { ...l, importer } : l)))
  }

  function toutDecider(importer) {
    setLignes((ls) => ls.map((l) => (l.statut === 'doublon' ? { ...l, importer } : l)))
  }

  function recommencer() {
    setEtape('fichier')
    setFichier(null)
    setLignes([])
    setResultat(null)
    setLecture({ enCours: false, erreur: null })
  }

  async function confirmer() {
    const aEnvoyer = lignes.filter(
      (l) => l.statut === 'valide' || (l.statut === 'doublon' && l.importer),
    )
    const refusees = lignes
      .filter((l) => l.statut === 'erreur')
      .map((l) => ({ numero: l.numero, brut: l.brut, raison: l.erreurs.join(' ') }))
    const ignorees = lignes
      .filter((l) => l.statut === 'doublon' && !l.importer)
      .map((l) => ({ numero: l.numero, brut: l.brut, raison: raisonDoublon(l) }))
    const parNumero = new Map(aEnvoyer.map((l) => [l.numero, l]))
    const paquets = lots(aEnvoyer)

    setEtape('envoi')
    setEnvoi({ lot: 0, total: paquets.length })
    setErreurEnvoi(null)
    let importId
    try {
      importId = await commencerImport(orgId, {
        nomFichier: fichier.nom,
        total: lignes.length,
        refusees: refusees.length,
        ignorees: ignorees.length,
      })
    } catch (e) {
      // Rien n'a été enregistré : retour à l'aperçu, les choix sont conservés.
      setErreurEnvoi(e.message)
      setEtape('apercu')
      return
    }

    let importees = 0
    let interruption = null
    for (const [index, paquet] of paquets.entries()) {
      setEnvoi({ lot: index + 1, total: paquets.length })
      let reponse
      try {
        reponse = await importerLot(
          orgId,
          importId,
          paquet.map((l) => ({ line: l.numero, ...l.patient })),
        )
      } catch (e) {
        // Lot incertain (la réponse a pu se perdre après l'enregistrement) et lots suivants
        // non envoyés : à vérifier, puis à importer de nouveau.
        interruption = { lot: index + 1, message: e.message }
        for (const [i, reste] of paquets.slice(index).entries()) {
          for (const l of reste) {
            refusees.push({
              numero: l.numero,
              brut: l.brut,
              raison:
                i === 0
                  ? 'Envoi interrompu : peut-être déjà enregistrée. Relancez l’import du fichier, elle sera reconnue comme doublon.'
                  : 'Non envoyée (envoi interrompu). Relancez l’import du fichier.',
            })
          }
        }
        break
      }
      for (const r of reponse) {
        if (r.error) {
          const l = parNumero.get(r.line)
          refusees.push({ numero: r.line, brut: l?.brut ?? [], raison: r.error })
        } else {
          importees += 1
        }
      }
    }

    refusees.sort((a, b) => a.numero - b.numero)
    setResultat({ importees, refusees, ignorees, interruption })
    setEtape('resultat')
    if (importees > 0) queryClient.invalidateQueries({ queryKey: ['patients', 'recherche', orgId] })
  }

  return {
    etape,
    lecture,
    fichier,
    lignes,
    envoi,
    resultat,
    erreurEnvoi,
    choisirFichier,
    decider,
    toutDecider,
    recommencer,
    confirmer,
  }
}
