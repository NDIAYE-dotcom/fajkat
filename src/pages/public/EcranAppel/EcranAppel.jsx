import { Play, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button/Button.jsx'
import Field from '../../../components/ui/Field/Field.jsx'
import Icone from '../../../components/ui/Icone/Icone.jsx'
import Select from '../../../components/ui/Select/Select.jsx'
import { formatHeure } from '../../../lib/format.js'
import { useEcranAppel, useEcranEveille } from '../../../modules/accueil/hooks/useEcranAppel.js'
import { usePreference } from '../../../modules/accueil/hooks/usePreference.js'
import { useMaintenant } from '../../../modules/accueil/hooks/useTableauFile.js'
import {
  chargerVoixFrancaises,
  creerAnnonceur,
  creerCarillon,
} from '../../../modules/accueil/son.js'
import './EcranAppel.css'

// Mise en évidence d'un nouvel appel.
const EVIDENCE_MS = 12 * 1000
// La voix parle après le carillon (environ 1 s).
const APRES_CARILLON_MS = 1200

const MESSAGES = {
  revoked:
    'Cet écran a été retiré par le responsable de la structure. Demandez-lui un nouveau lien.',
  unknown: 'Ce lien d’écran n’est pas valable. Vérifiez l’adresse, ou demandez un nouveau lien.',
  unavailable: 'La structure n’est pas accessible pour le moment.',
}

// Écran d'appel pour la télévision de la salle d'attente, ouvert par un lien à jeton, sans
// connexion. Numéro, initiales et salle seulement : jamais le nom, le motif ni le service.
// Annonce : carillon, puis voix française (numéro et salle), pour qui ne lit pas l'écran.
export default function EcranAppel() {
  const { jeton } = useParams()
  const [carillon] = useState(creerCarillon)
  const [annonceur] = useState(creerAnnonceur)
  const [demarre, setDemarre] = useState(false)
  const [son, setSon] = useState(false)
  // null : voix non demandée ; false : aucune voix française sur l'appareil.
  const [voix, setVoix] = useState(null)
  // Voix françaises de l'appareil (null : en cours de lecture) ; choix gardé sur cet écran.
  const [listeVoix, setListeVoix] = useState(null)
  const [voixChoisie, setVoixChoisie] = usePreference('fajkat.ecran.voix', '')
  const voixRetenue = listeVoix ? annonceur.choisir(listeVoix, voixChoisie) : null
  const [evidence, setEvidence] = useState(null)
  const maintenant = useMaintenant()

  const { etat, infos, appels, connexion } = useEcranAppel(jeton, (appel) => {
    carillon.jouer()
    // Un rappel (call_count + 1) est un nouvel appel : l'annonce est répétée.
    annonceur.annoncer(appel, APRES_CARILLON_MS)
    setEvidence(`${appel.visit_id}:${appel.call_count}`)
  })
  const veillePossible = useEcranEveille(demarre && etat === 'valid')

  useEffect(() => {
    if (!evidence) return undefined
    const minuteur = setTimeout(() => setEvidence(null), EVIDENCE_MS)
    return () => clearTimeout(minuteur)
  }, [evidence])

  useEffect(() => {
    let actif = true
    chargerVoixFrancaises().then((liste) => actif && setListeVoix(liste))
    return () => {
      actif = false
    }
  }, [])

  // Page d'une salle d'attente : jamais indexée.
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    document.title = 'Écran d’appel — Fajkat'
    return () => robots.remove()
  }, [])

  async function demarrer(avecSon) {
    if (avecSon) {
      setSon(await carillon.activer())
      setVoix(annonceur.activer())
    }
    // Plein écran sur la télévision, si le navigateur l'accepte.
    document.documentElement.requestFullscreen?.().catch(() => {})
    setDemarre(true)
  }

  if (etat !== 'valid' && etat !== 'chargement') {
    return (
      <main className="ecran-appel ecran-appel--message">
        <p className="ecran-appel__message">{MESSAGES[etat] ?? MESSAGES.unknown}</p>
      </main>
    )
  }

  const [courant, ...precedents] = appels
  const cleCourant = courant && `${courant.visit_id}:${courant.call_count}`

  return (
    <main className="ecran-appel">
      <header className="ecran-appel__entete">
        <p className="ecran-appel__structure">{infos?.structure ?? ' '}</p>
        <p className="ecran-appel__heure">{formatHeure(maintenant)}</p>
      </header>

      <section className="ecran-appel__scene" aria-live="assertive" aria-atomic="true">
        {courant ? (
          <div
            className={`ecran-appel__appel${evidence === cleCourant ? ' ecran-appel__appel--nouveau' : ''}`}
          >
            <p className="ecran-appel__mention">
              {courant.call_count > 1 ? 'Rappel' : 'Numéro appelé'}
            </p>
            <p className="ecran-appel__numero">{courant.ticket_number}</p>
            <p className="ecran-appel__initiales">{courant.initials}</p>
            {courant.room && <p className="ecran-appel__salle">{courant.room}</p>}
          </div>
        ) : (
          <p className="ecran-appel__mention">
            {etat === 'chargement' ? 'Connexion…' : 'Les numéros appelés s’afficheront ici.'}
          </p>
        )}
      </section>

      {precedents.length > 0 && (
        <section className="ecran-appel__historique" aria-label="Appels précédents">
          <h2 className="ecran-appel__titre">Appels précédents</h2>
          <ul className="ecran-appel__liste">
            {precedents.map((a) => (
              <li key={`${a.visit_id}:${a.call_count}`} className="ecran-appel__ligne">
                <span className="ecran-appel__petit-numero">{a.ticket_number}</span>
                <span>{a.room}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="ecran-appel__pied">
        <span>{connexion === 'en_ligne' ? 'Connecté' : 'Reconnexion en cours…'}</span>
        {demarre && !son && <span>Son coupé</span>}
        {demarre && son && voix === false && (
          <span>Pas de voix française sur cet appareil : carillon seul.</span>
        )}
        {demarre && !veillePossible && (
          <span>Réglez la télévision pour qu’elle ne se mette pas en veille.</span>
        )}
      </footer>

      {!demarre && etat === 'valid' && (
        <div className="ecran-appel__voile">
          <div className="ecran-appel__depart" role="dialog" aria-labelledby="ecran-depart">
            <h1 id="ecran-depart" className="ecran-appel__depart-titre">
              {infos?.ecran ?? 'Écran d’appel'}
            </h1>
            <p>
              Le navigateur n’autorise le son qu’après un clic. Chaque appel sera annoncé par un
              carillon discret, puis par une voix : « Numéro A 3, Salle de soins ».
            </p>
            {listeVoix?.length > 0 && (
              <div className="ecran-appel__voix">
                <Field label="Voix" aide="Choix gardé sur cet écran.">
                  <Select
                    value={voixRetenue?.voiceURI ?? ''}
                    onChange={(e) => setVoixChoisie(e.target.value)}
                    options={listeVoix.map((v) => ({
                      valeur: v.voiceURI,
                      libelle: `${v.name} (${v.lang})`,
                    }))}
                  />
                </Field>
                <Button
                  variante="secondaire"
                  iconeDebut={<Icone icone={Play} />}
                  onClick={() => annonceur.tester()}
                >
                  Tester
                </Button>
              </div>
            )}
            {listeVoix?.length === 0 && (
              <p>
                Pas de voix française sur cet appareil : les appels seront annoncés par le carillon
                seul.
              </p>
            )}
            <div className="ecran-appel__boutons">
              <Button
                taille="grande"
                iconeDebut={<Icone icone={Volume2} />}
                onClick={() => demarrer(true)}
                autoFocus
              >
                Activer le son et la voix
              </Button>
              <Button variante="secondaire" onClick={() => demarrer(false)}>
                Continuer sans son
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
