// Carillon discret de l'écran d'appel (deux notes descendantes), synthétisé : aucun fichier
// à télécharger. Les navigateurs bloquent le son tant que personne n'a cliqué : activer()
// doit être appelé depuis un clic (bouton « Activer le son »).

const NOTES = [
  { frequence: 659.25, debut: 0, duree: 0.45 },
  { frequence: 523.25, debut: 0.42, duree: 0.6 },
]
const VOLUME = 0.18

export function creerCarillon() {
  let contexte = null

  async function activer() {
    const Contexte = window.AudioContext ?? window.webkitAudioContext
    if (!Contexte) return false
    contexte ??= new Contexte()
    if (contexte.state === 'suspended') await contexte.resume()
    return contexte.state === 'running'
  }

  function jouer() {
    if (!contexte || contexte.state !== 'running') return
    const t0 = contexte.currentTime + 0.05
    for (const note of NOTES) {
      const oscillateur = contexte.createOscillator()
      const volume = contexte.createGain()
      oscillateur.type = 'sine'
      oscillateur.frequency.value = note.frequence
      // Attaque douce, extinction progressive : un « ding-dong », pas une alarme.
      volume.gain.setValueAtTime(0, t0 + note.debut)
      volume.gain.linearRampToValueAtTime(VOLUME, t0 + note.debut + 0.03)
      volume.gain.exponentialRampToValueAtTime(0.0001, t0 + note.debut + note.duree)
      oscillateur.connect(volume).connect(contexte.destination)
      oscillateur.start(t0 + note.debut)
      oscillateur.stop(t0 + note.debut + note.duree + 0.05)
    }
  }

  return { activer, jouer }
}

// --- Annonce vocale (synthèse vocale du navigateur) --------------------------------
// Beaucoup de patients ne lisent pas l'écran : après le carillon, une voix française dit
// « Numéro A 3, Salle de soins ». Jamais le nom. Aucune voix n'est téléchargée : on utilise
// celles de l'appareil ; sans voix française, l'écran garde le carillon seul.

// Les voix arrivent parfois après le chargement de la page (Chrome) : on les attend un peu.
const ATTENTE_VOIX_MS = 2000

// Le navigateur ne donne pas le genre des voix : voix féminines françaises connues, par
// ordre de préférence (Chrome, Android, macOS et iOS, Windows).
const VOIX_FEMININES = [
  /google fran[cç]ais/i,
  /am[ée]lie/i,
  /audrey/i,
  /marie/i,
  /aur[ée]lie/i,
  /hortense/i,
  /denise/i,
  /julie/i,
  /c[ée]line/i,
  /virginie/i,
  /l[ée]a\b/i,
]

export const PHRASE_TEST = 'Numéro A 3, Salle de soins'

function voixFrancaisesDisponibles() {
  return (window.speechSynthesis?.getVoices() ?? []).filter((v) =>
    v.lang?.toLowerCase().startsWith('fr'),
  )
}

// Première voix féminine connue, sinon la première voix française (fr-FR d'abord).
export function voixParDefaut(liste) {
  for (const motif of VOIX_FEMININES) {
    const trouvee = liste.find((v) => motif.test(v.name))
    if (trouvee) return trouvee
  }
  return liste.find((v) => v.lang.toLowerCase() === 'fr-fr') ?? liste[0] ?? null
}

// Voix françaises de l'appareil ; attend leur chargement au besoin. [] s'il n'y en a pas.
export async function chargerVoixFrancaises() {
  const synthese = window.speechSynthesis
  if (!synthese) return []
  let liste = voixFrancaisesDisponibles()
  if (liste.length > 0) return liste
  await new Promise((fin) => {
    const minuteur = setTimeout(fin, ATTENTE_VOIX_MS)
    synthese.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(minuteur)
        fin()
      },
      { once: true },
    )
  })
  liste = voixFrancaisesDisponibles()
  return liste
}

// « A-003 » -> « Numéro A 3 » ; puis la salle, si elle est connue.
export function texteAnnonce(appel) {
  const [lettre, chiffres] = String(appel.ticket_number ?? '').split('-')
  const nombre = Number.parseInt(chiffres, 10)
  const numero = Number.isFinite(nombre) ? `${lettre} ${nombre}` : appel.ticket_number
  return [`Numéro ${numero}`, appel.room].filter(Boolean).join(', ')
}

export function creerAnnonceur() {
  let voix = null
  // Énoncés en cours : gardés en mémoire jusqu'à leur fin (sinon Chrome peut les couper).
  const enCours = new Set()

  function dire(texte) {
    if (!voix || !window.speechSynthesis) return
    const enonce = new SpeechSynthesisUtterance(texte)
    enonce.voice = voix
    enonce.lang = voix.lang
    enonce.rate = 0.9
    enCours.add(enonce)
    const finir = () => enCours.delete(enonce)
    enonce.onend = finir
    enonce.onerror = finir
    window.speechSynthesis.speak(enonce)
  }

  // Voix choisie (voiceURI), sinon la voix par défaut. Renvoie la voix retenue, ou null.
  function choisir(liste, identifiant) {
    voix = liste.find((v) => v.voiceURI === identifiant) ?? voixParDefaut(liste)
    return voix
  }

  // À appeler depuis un clic : les navigateurs n'autorisent la voix qu'après un geste.
  // Renvoie true si une voix française est retenue.
  function activer() {
    if (!voix || !window.speechSynthesis) return false
    // Énoncé silencieux, dans le clic : débloque la voix pour la suite.
    const deblocage = new SpeechSynthesisUtterance(' ')
    deblocage.volume = 0
    window.speechSynthesis.speak(deblocage)
    return true
  }

  function tester() {
    window.speechSynthesis?.cancel()
    dire(PHRASE_TEST)
  }

  function annoncer(appel, delaiMs = 0) {
    setTimeout(() => dire(texteAnnonce(appel)), delaiMs)
  }

  return { choisir, activer, tester, annoncer }
}
