import { useEffect } from 'react'
import ToastProvider from '../../components/ui/Toast/ToastProvider.jsx'
import Affichage from './sections/Affichage/Affichage.jsx'
import Boutons from './sections/Boutons/Boutons.jsx'
import Champs from './sections/Champs/Champs.jsx'
import ChampsMetier from './sections/ChampsMetier/ChampsMetier.jsx'
import Fenetres from './sections/Fenetres/Fenetres.jsx'
import Impression from './sections/Impression/Impression.jsx'
import NouveauPatient from './sections/NouveauPatient/NouveauPatient.jsx'
import RegistreDuJour from './sections/RegistreDuJour/RegistreDuJour.jsx'
import './Atelier.css'

const SOMMAIRE = [
  ['boutons', 'Boutons'],
  ['champs', 'Champs'],
  ['champs-metier', 'Champs métier'],
  ['affichage', 'Navigation'],
  ['fenetres', 'Fenêtres'],
  ['impression', 'Impression'],
  ['nouveau-patient', 'Nouveau patient'],
  ['registre', 'Registre du jour'],
]

// Vitrine du design system de l'application connectée (page non indexée).
// Chaque composant y est montré dans ses états, puis assemblé dans deux écrans réalistes.
export default function Atelier() {
  // Page de travail : titre d'onglet explicite et aucune indexation par les moteurs de recherche.
  useEffect(() => {
    const titrePrecedent = document.title
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    document.title = 'Atelier du design system · Fajkat'
    return () => {
      robots.remove()
      document.title = titrePrecedent
    }
  }, [])

  return (
    <ToastProvider>
      <div className="atelier">
        <header className="atelier__entete">
          <p className="atelier__surtitre">Fajkat · application connectée</p>
          <h1 className="atelier__titre">Atelier du design system</h1>
          <p className="atelier__intro">
            Les composants de l'application, dans tous leurs états. Pour juger l'ensemble : réduisez
            la fenêtre à 360 px, naviguez au clavier (Tab, Maj+Tab, Échap) et imprimez le reçu.
          </p>
          <nav className="atelier__sommaire" aria-label="Sommaire de l'atelier">
            <ul className="atelier__liens">
              {SOMMAIRE.map(([id, libelle]) => (
                <li key={id}>
                  <a className="atelier__lien" href={`#${id}`}>
                    {libelle}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="atelier__contenu">
          <Boutons />
          <Champs />
          <ChampsMetier />
          <Affichage />
          <Fenetres />
          <Impression />
          <NouveauPatient />
          <RegistreDuJour />
        </main>
      </div>
    </ToastProvider>
  )
}
