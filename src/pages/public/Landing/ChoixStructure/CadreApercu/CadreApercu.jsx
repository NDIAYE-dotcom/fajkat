import { Info } from 'lucide-react'
import { useState } from 'react'
import { getFuseauHoraire } from '../../../../../lib/format.js'
import './CadreApercu.css'

// « mar. 13 oct. 2026 » -> « Mar. 13 oct. 2026 », dans le fuseau de la structure.
function dateDuJour() {
  const texte = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: getFuseauHoraire(),
  }).format(new Date())
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

// Fenêtre d'application miniature : barre latérale (logo + menu) et panneau principal.
// Uniquement des <span> : elle s'affiche à l'intérieur du bouton de choix.
// navigation : [{ icone, libelle, actif }] ; titre : écran affiché, sousTitre : sa vue.
// anime : vrai quand la carte est à l'écran ; l'entrée en cascade se rejoue à chaque retour au défilement.
// indicateur : petit élément affiché à droite de l'en-tête (jauge, compteur…).
export default function CadreApercu({
  logo,
  nom,
  navigation,
  titre,
  sousTitre,
  heure,
  indicateur,
  anime,
  children,
}) {
  const [date] = useState(dateDuJour)

  return (
    <span className="cadre-apercu" data-anime={anime || undefined} aria-hidden="true">
      <span className="cadre-apercu__laterale">
        <span className="cadre-apercu__marque">
          <span className="cadre-apercu__logo">{logo}</span>
          {nom}
        </span>
        {navigation.map(({ icone: Icone, libelle, actif }, index) => (
          <span
            key={libelle}
            className="cadre-apercu__lien"
            data-actif={actif || undefined}
            style={{ '--i': index + 1 }}
          >
            <Icone size={18} strokeWidth={1.75} />
            {libelle}
          </span>
        ))}
      </span>

      <span className="cadre-apercu__principal">
        <span className="cadre-apercu__tete">
          <span className="cadre-apercu__titre">
            <strong>{titre}</strong> · {sousTitre}
          </span>
          <span className="cadre-apercu__date">{date}</span>
          {heure && <span className="cadre-apercu__heure">{heure}</span>}
          {indicateur}
        </span>
        <span className="cadre-apercu__contenu">{children}</span>
        <span className="cadre-apercu__mention">
          <Info size={16} strokeWidth={1.75} />
          Aperçu — données fictives
        </span>
      </span>
    </span>
  )
}
