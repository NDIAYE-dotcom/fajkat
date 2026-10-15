// Traitement commun à l'import d'un fichier (owner et admin) et à la page de registre
// recopiée (rôles qui créent un patient) : doublons probables, puis envoi journalisé.
// source : 'fichier' (lots de 500) ou 'registre' (une page, 60 lignes au plus).

import { chercherDoublonsImport, commencerImport, importerLot } from '../api.js'
import { nomComplet, RAISONS_DOUBLON } from '../utils.js'
import { criteresDoublon } from './validation.js'

export const TAILLE_LOT = { fichier: 500, registre: 60 }

export const RAISONS_IMPORT = {
  ...RAISONS_DOUBLON,
  meme_ancien_numero: 'Même ancien n° de dossier, nom proche',
}

function lots(liste, taille) {
  const resultat = []
  for (let i = 0; i < liste.length; i += taille) resultat.push(liste.slice(i, i + taille))
  return resultat
}

// Raison d'un doublon laissé de côté.
function raisonDoublon(ligne, source) {
  if (ligne.ligneJumelle) {
    return source === 'registre'
      ? `Même patient que la ligne ${ligne.ligneJumelle} de la page`
      : `Même patient que la ligne ${ligne.ligneJumelle} du fichier`
  }
  return ligne.candidats
    .map((c) => `${c.file_number} ${nomComplet(c)} (${RAISONS_IMPORT[c.reason] ?? c.reason})`)
    .join(' ; ')
}

// Lignes préparées (preparerLignes) -> mêmes lignes, les doublons probables du registre
// marqués (statut 'doublon', candidats). Rien n'est enregistré.
export async function marquerDoublons(orgId, preparees, source) {
  const aVerifier = preparees.filter((l) => l.statut === 'valide')
  const candidats = new Map()
  for (const lot of lots(aVerifier, TAILLE_LOT[source])) {
    const trouves = await chercherDoublonsImport(orgId, lot.map(criteresDoublon), source)
    for (const c of trouves) candidats.set(c.line, [...(candidats.get(c.line) ?? []), c])
  }
  return preparees.map((l) =>
    candidats.has(l.numero) ? { ...l, statut: 'doublon', candidats: candidats.get(l.numero) } : l,
  )
}

// Envoi après confirmation. journal : { nomFichier, annee, page } (repère du registre).
// onLot(lot, total) suit la progression. Si le journal ne s'ouvre pas, l'erreur remonte :
// rien n'a été enregistré.
// Renvoie { importees, creees: [{ numero, file_number }], refusees, ignorees, interruption } ;
// refusees et ignorees : [{ numero, brut, raison }], dans l'ordre des lignes.
export async function envoyerImport(orgId, { source, journal, lignes, onLot }) {
  const aEnvoyer = lignes.filter(
    (l) => l.statut === 'valide' || (l.statut === 'doublon' && l.importer),
  )
  const refusees = lignes
    .filter((l) => l.statut === 'erreur')
    .map((l) => ({ numero: l.numero, brut: l.brut, raison: l.erreurs.join(' ') }))
  const ignorees = lignes
    .filter((l) => l.statut === 'doublon' && !l.importer)
    .map((l) => ({ numero: l.numero, brut: l.brut, raison: raisonDoublon(l, source) }))
  const parNumero = new Map(aEnvoyer.map((l) => [l.numero, l]))
  const paquets = lots(aEnvoyer, TAILLE_LOT[source])

  onLot?.(0, paquets.length)
  const importId = await commencerImport(orgId, {
    source,
    nomFichier: journal.nomFichier,
    annee: journal.annee,
    page: journal.page,
    total: lignes.length,
    refusees: refusees.length,
    ignorees: ignorees.length,
  })

  const creees = []
  let interruption = null
  for (const [index, paquet] of paquets.entries()) {
    onLot?.(index + 1, paquets.length)
    let reponse
    try {
      reponse = await importerLot(
        orgId,
        importId,
        paquet.map((l) => ({ line: l.numero, ...l.patient })),
      )
    } catch (e) {
      // Lot incertain (la réponse a pu se perdre après l'enregistrement) et lots suivants
      // non envoyés : à vérifier, puis à envoyer de nouveau (reconnus comme doublons).
      interruption = { lot: index + 1, message: e.message }
      const relancer =
        source === 'registre' ? 'Vérifiez la page de nouveau' : 'Relancez l’import du fichier'
      for (const [i, reste] of paquets.slice(index).entries()) {
        for (const l of reste) {
          refusees.push({
            numero: l.numero,
            brut: l.brut,
            interrompue: true,
            raison:
              i === 0
                ? `Envoi interrompu : peut-être déjà enregistrée. ${relancer}, elle sera reconnue comme doublon.`
                : `Non envoyée (envoi interrompu). ${relancer}.`,
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
        creees.push({ numero: r.line, file_number: r.file_number })
      }
    }
  }

  refusees.sort((a, b) => a.numero - b.numero)
  return { importees: creees.length, creees, refusees, ignorees, interruption }
}
