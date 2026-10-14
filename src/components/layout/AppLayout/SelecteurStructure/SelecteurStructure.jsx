import { Check, ChevronDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { getOffre } from '../../../../lib/offres.js'
import { ROLES } from '../../../../router/navigation.js'
import Icone from '../../../ui/Icone/Icone.jsx'
import LogoStructure from '../LogoStructure/LogoStructure.jsx'
import MenuDeroulant from '../MenuDeroulant/MenuDeroulant.jsx'
import './SelecteurStructure.css'

// Logo et nom de la structure active. Avec plusieurs structures, c'est aussi le moyen
// d'en changer : on revient alors à la Journée du jour, les modules pouvant différer.
export default function SelecteurStructure() {
  const { structure, structures, changerStructure } = useOrganization()
  const navigate = useNavigate()

  const identite = (
    <>
      <LogoStructure structure={structure} />
      <span className="selecteur-structure__nom">{structure.name}</span>
    </>
  )

  if (structures.length < 2) {
    return (
      <Link to="/app" className="selecteur-structure selecteur-structure__bouton">
        {identite}
      </Link>
    )
  }

  return (
    <MenuDeroulant
      className="selecteur-structure"
      alignement="gauche"
      libelle="Changer de structure"
      declencheur={({ attributs }) => (
        <button type="button" className="selecteur-structure__bouton" {...attributs}>
          {identite}
          <Icone icone={ChevronDown} className="selecteur-structure__chevron" />
          <span className="sr-only">, changer de structure</span>
        </button>
      )}
    >
      {(fermer) => (
        <div className="selecteur-structure__panneau">
          <p className="selecteur-structure__titre">Vos structures</p>
          <ul className="selecteur-structure__liste">
            {structures.map((s) => {
              const active = s.id === structure.id
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="selecteur-structure__choix"
                    aria-current={active || undefined}
                    onClick={() => {
                      fermer()
                      if (active) return
                      changerStructure(s.id)
                      navigate('/app')
                    }}
                  >
                    <LogoStructure structure={s} />
                    <span className="selecteur-structure__texte">
                      <span className="selecteur-structure__choix-nom">{s.name}</span>
                      <span className="selecteur-structure__details">
                        {getOffre(s.type)?.nom} · {ROLES[s.role] ?? s.role}
                      </span>
                    </span>
                    {active && <Icone icone={Check} label="Structure ouverte" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </MenuDeroulant>
  )
}
