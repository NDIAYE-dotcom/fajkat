import { ChevronDown, CreditCard, LogOut, Settings, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { ROLES, ROLES_ABONNEMENT, ROLES_PARAMETRES } from '../../../../router/navigation.js'
import Avatar from '../../../ui/Avatar/Avatar.jsx'
import Icone from '../../../ui/Icone/Icone.jsx'
import Spinner from '../../../ui/Spinner/Spinner.jsx'
import MenuDeroulant from '../MenuDeroulant/MenuDeroulant.jsx'
import './MenuUtilisateur.css'

// Menu de l'utilisateur : profil, paramètres de la structure, abonnement, déconnexion.
export default function MenuUtilisateur() {
  const { utilisateur, nomComplet, prenom, deconnecter } = useAuth()
  const { role } = useOrganization()
  const navigate = useNavigate()
  const [sortie, setSortie] = useState(false)
  const nom = nomComplet || utilisateur?.email || 'Mon compte'

  async function surDeconnexion() {
    setSortie(true)
    await deconnecter()
    navigate('/connexion', { replace: true })
  }

  const liens = [
    { to: '/app/profil', libelle: 'Mon profil', icone: UserRound, visible: true },
    {
      to: '/app/parametres',
      libelle: 'Paramètres de la structure',
      icone: Settings,
      visible: ROLES_PARAMETRES.includes(role),
    },
    {
      to: '/app/abonnement',
      libelle: 'Abonnement',
      icone: CreditCard,
      visible: ROLES_ABONNEMENT.includes(role),
    },
  ].filter((lien) => lien.visible)

  return (
    <MenuDeroulant
      libelle="Menu de votre compte"
      declencheur={({ attributs }) => (
        <button type="button" className="menu-utilisateur__bouton" {...attributs}>
          <Avatar nom={nom} taille="s" decoratif />
          <span className="menu-utilisateur__prenom">{prenom || 'Mon compte'}</span>
          <span className="sr-only">, menu de votre compte</span>
          <Icone icone={ChevronDown} className="menu-utilisateur__chevron" />
        </button>
      )}
    >
      {(fermer) => (
        <div className="menu-utilisateur__panneau">
          <div className="menu-utilisateur__identite">
            <p className="menu-utilisateur__nom">{nom}</p>
            {utilisateur?.email && nom !== utilisateur.email && (
              <p className="menu-utilisateur__email">{utilisateur.email}</p>
            )}
            <p className="menu-utilisateur__role">{ROLES[role] ?? role}</p>
          </div>
          <ul className="menu-utilisateur__liste">
            {liens.map((lien) => (
              <li key={lien.to}>
                <Link to={lien.to} className="menu-utilisateur__action" onClick={fermer}>
                  <Icone icone={lien.icone} className="menu-utilisateur__icone" />
                  {lien.libelle}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="menu-utilisateur__action menu-utilisateur__action--sortie"
                onClick={surDeconnexion}
                disabled={sortie}
                aria-busy={sortie || undefined}
              >
                {sortie ? (
                  <Spinner taille={20} />
                ) : (
                  <Icone icone={LogOut} className="menu-utilisateur__icone" />
                )}
                Se déconnecter
              </button>
            </li>
          </ul>
        </div>
      )}
    </MenuDeroulant>
  )
}
