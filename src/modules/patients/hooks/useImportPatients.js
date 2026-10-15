import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { lireFichier } from '../import/lecture.js'
import { envoyerImport, marquerDoublons } from '../import/traitement.js'
import { preparerLignes } from '../import/validation.js'

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
      setLignes(await marquerDoublons(orgId, preparees, 'fichier'))
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
    setEtape('envoi')
    setErreurEnvoi(null)
    try {
      const bilan = await envoyerImport(orgId, {
        source: 'fichier',
        journal: { nomFichier: fichier.nom },
        lignes,
        onLot: (lot, total) => setEnvoi({ lot, total }),
      })
      setResultat(bilan)
      setEtape('resultat')
      if (bilan.importees > 0) {
        queryClient.invalidateQueries({ queryKey: ['patients', 'recherche', orgId] })
      }
    } catch (e) {
      // Le journal n'a pas pu s'ouvrir : rien n'a été enregistré. Retour à l'aperçu,
      // les choix sont conservés.
      setErreurEnvoi(e.message)
      setEtape('apercu')
    }
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
