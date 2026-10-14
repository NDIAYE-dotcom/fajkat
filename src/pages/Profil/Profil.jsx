import { useEffect } from 'react'
import Panel from '../../components/ui/Panel/Panel.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { useOrganization } from '../../hooks/useOrganization.js'
import { getOffre } from '../../lib/offres.js'
import { ROLES } from '../../router/navigation.js'
import './Profil.css'

// Page provisoire : le compte en lecture. La modification (nom, téléphone, mot de passe,
// signature) arrive avec la gestion du personnel.
export default function Profil() {
  const { utilisateur, nomComplet } = useAuth()
  const { structures } = useOrganization()

  useEffect(() => {
    document.title = 'Mon profil — Fajkat'
  }, [])

  return (
    <div className="profil">
      <h1 className="profil__titre">Mon profil</h1>

      <Panel titre="Votre compte" marque>
        <dl>
          <div className="profil__ligne">
            <dt>Nom</dt>
            <dd>{nomComplet || '—'}</dd>
          </div>
          <div className="profil__ligne">
            <dt>E-mail</dt>
            <dd className="profil__email">{utilisateur?.email || '—'}</dd>
          </div>
        </dl>
      </Panel>

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

      <p className="profil__note">
        La modification de votre nom, de votre mot de passe et de votre signature arrivera avec la
        gestion du personnel.
      </p>
    </div>
  )
}
