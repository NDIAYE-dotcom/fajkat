import { useEffect } from 'react'
import Panel from '../../components/ui/Panel/Panel.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useOrganization } from '../../hooks/useOrganization.js'
import { getOffre } from '../../lib/offres.js'
import { ROLES } from '../../router/navigation.js'
import IdentiteProfil from './IdentiteProfil/IdentiteProfil.jsx'
import MotDePasseProfil from './MotDePasseProfil/MotDePasseProfil.jsx'
import './Profil.css'

// Compte de l'utilisateur : nom, téléphone, mot de passe, structures. La fiche propre à
// chaque structure (fonction, contrat, contact d'urgence) est dans « Mon espace ».
export default function Profil() {
  const { utilisateur } = useAuth()
  const { structures } = useOrganization()

  useEffect(() => {
    document.title = 'Mon profil — Fajkat'
  }, [])

  return (
    <div className="profil">
      <h1 className="profil__titre">Mon profil</h1>

      <IdentiteProfil utilisateur={utilisateur} />
      <MotDePasseProfil email={utilisateur?.email} />

      <Panel titre={structures.length > 1 ? 'Vos structures' : 'Votre structure'}>
        <ul className="profil__structures">
          {structures.map((s) => (
            <li key={s.id} className="profil__ligne">
              <span className="profil__nom">{s.name}</span>
              <span className="profil__detail">
                {getOffre(s.type)?.nom} · {ROLES[s.role] ?? s.role}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
