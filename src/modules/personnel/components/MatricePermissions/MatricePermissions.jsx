import { Check } from 'lucide-react'
import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { FAMILLES_NAV } from '../../../../router/navigation.js'
import { libelleRole, matricePermissions } from '../../utils.js'
import './MatricePermissions.css'

// Qui voit quoi : la matrice module × rôle de navigation.js, en lecture seule, limitée aux
// modules de l'offre. Sur téléphone, le choix d'un rôle donne une liste plus lisible.
export default function MatricePermissions({ features }) {
  const { roles, lignes } = matricePermissions(features)
  const [role, setRole] = useState('tous')

  return (
    <div className="matrice-permissions">
      <p className="matrice-permissions__intro">
        Chaque membre ne voit que les modules de son rôle. La base de données applique les mêmes
        règles : un module masqué reste fermé, même par une adresse tapée à la main.
      </p>

      <Field id="matrice-role" label="Afficher">
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { valeur: 'tous', libelle: 'Tous les rôles (tableau)' },
            ...roles.map((r) => ({ valeur: r, libelle: `Rôle : ${libelleRole(r)}` })),
          ]}
        />
      </Field>

      {role === 'tous' ? (
        <div
          className="matrice-permissions__defilement"
          tabIndex={0}
          role="region"
          aria-label="Matrice des permissions"
        >
          <table className="matrice-permissions__tableau">
            <caption className="matrice-permissions__legende">Modules accessibles par rôle</caption>
            <thead>
              <tr>
                <th scope="col" className="matrice-permissions__module">
                  Module
                </th>
                {roles.map((r) => (
                  <th key={r} scope="col" className="matrice-permissions__role">
                    {libelleRole(r)}
                  </th>
                ))}
              </tr>
            </thead>
            {FAMILLES_NAV.map((famille) => {
              const duGroupe = lignes.filter((l) => l.famille === famille.id)
              if (!duGroupe.length) return null
              return (
                <tbody key={famille.id}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={roles.length + 1}
                      className="matrice-permissions__famille"
                    >
                      {famille.titre}
                    </th>
                  </tr>
                  {duGroupe.map((l) => (
                    <tr key={l.code} className="matrice-permissions__ligne">
                      <th scope="row" className="matrice-permissions__module">
                        {l.libelle}
                      </th>
                      {roles.map((r) => (
                        <td key={r} className="matrice-permissions__case">
                          {l.roles.has(r) ? (
                            <Icone icone={Check} label="Accès" />
                          ) : (
                            <span className="matrice-permissions__non">
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">Pas d’accès</span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
      ) : (
        <ListeRole role={role} lignes={lignes} />
      )}
    </div>
  )
}

function ListeRole({ role, lignes }) {
  const ouverts = lignes.filter((l) => l.roles.has(role))
  const fermes = lignes.filter((l) => !l.roles.has(role))
  return (
    <div className="matrice-permissions__listes">
      <section aria-labelledby="matrice-ouverts">
        <h3 id="matrice-ouverts" className="matrice-permissions__titre">
          Accessible ({ouverts.length})
        </h3>
        <ul className="matrice-permissions__liste">
          {ouverts.map((l) => (
            <li key={l.code} className="matrice-permissions__element">
              <Icone icone={Check} /> {l.libelle}
            </li>
          ))}
        </ul>
      </section>
      {fermes.length > 0 && (
        <section aria-labelledby="matrice-fermes">
          <h3 id="matrice-fermes" className="matrice-permissions__titre">
            Non accessible ({fermes.length})
          </h3>
          <ul className="matrice-permissions__liste matrice-permissions__liste--fermee">
            {fermes.map((l) => (
              <li key={l.code} className="matrice-permissions__element">
                {l.libelle}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
