import { Bell, CalendarClock, Users, Wallet } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useNavigation } from '../../../../hooks/useNavigation.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { dayjs } from '../../../../lib/format.js'
import BrouillonsEnCours from '../../../consultations/components/BrouillonsEnCours/BrouillonsEnCours.jsx'
import { usePermissionsConsultation } from '../../../consultations/hooks/useConsultation.js'
import CarteConfiguration from '../../components/CarteConfiguration/CarteConfiguration.jsx'
import { doitOuvrirAssistant, peutConfigurer } from '../../utils.js'
import './TableauDeBord.css'

// Emplacements des indicateurs : remplis par les modules des étapes suivantes.
// Aucun chiffre n'est affiché tant que la donnée réelle n'existe pas.
const EMPLACEMENTS = [
  {
    code: 'patients',
    titre: 'Patients du jour',
    icone: Users,
    entree: 'patients',
    texte: 'Les patients reçus aujourd’hui et ceux qui attendent encore s’afficheront ici.',
  },
  {
    code: 'rendez_vous',
    titre: 'Rendez-vous',
    icone: CalendarClock,
    entree: 'rendez_vous',
    texte: 'Les rendez-vous du jour et les rappels WhatsApp envoyés la veille s’afficheront ici.',
  },
  {
    code: 'recettes',
    titre: 'Recettes',
    icone: Wallet,
    entree: 'caisse',
    texte: 'Les encaissements du jour, par espèces et mobile money, s’afficheront ici.',
  },
  {
    code: 'alertes',
    titre: 'Alertes',
    icone: Bell,
    entree: null,
    texte: 'Ruptures de stock, vaccins en retard et échéances s’afficheront ici.',
  },
]

// « mercredi 14 octobre 2026 » -> « Mercredi 14 octobre 2026 », dans le fuseau de la structure.
function dateDuJour() {
  const texte = dayjs.tz().format('dddd D MMMM YYYY')
  return texte.charAt(0).toLocaleUpperCase('fr') + texte.slice(1)
}

// Journée du jour : la date, la configuration à terminer, les consultations non validées
// du soignant, et les indicateurs à venir.
export default function TableauDeBord() {
  const { prenom } = useAuth()
  const { structure, role } = useOrganization()
  const { estVisible } = useNavigation()
  // Consultations commencées et pas encore validées : soignants qui rédigent.
  const consultations = usePermissionsConsultation(
    estVisible('consultations') ? structure.id : null,
  ).ecrire

  useEffect(() => {
    document.title = `Journée du jour — ${structure.name} — Fajkat`
  }, [structure.name])

  // Première connexion du propriétaire : l'assistant de démarrage s'ouvre, une seule fois.
  if (doitOuvrirAssistant(structure)) return <Navigate to="/app/demarrage" replace />

  const emplacements = EMPLACEMENTS.filter((e) => !e.entree || estVisible(e.entree))

  return (
    <div className="tableau-de-bord">
      <header className="tableau-de-bord__entete">
        <h1 className="tableau-de-bord__date">{dateDuJour()}</h1>
        <p className="tableau-de-bord__salut">
          Bonjour {prenom || 'et bienvenue'}, voici la journée de {structure.name}.
        </p>
      </header>

      {peutConfigurer(role) && <CarteConfiguration />}

      {consultations && <BrouillonsEnCours orgId={structure.id} />}

      <section aria-labelledby="tdb-indicateurs">
        <h2 id="tdb-indicateurs" className="sr-only">
          Indicateurs du jour
        </h2>
        <ul className="tableau-de-bord__grille">
          {emplacements.map((e) => (
            <li key={e.code} className="tableau-de-bord__emplacement">
              <h3 className="tableau-de-bord__titre">
                <Icone icone={e.icone} className="tableau-de-bord__icone" />
                {e.titre}
              </h3>
              <p className="tableau-de-bord__texte">{e.texte}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
