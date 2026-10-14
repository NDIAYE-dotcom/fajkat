import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { dayjs, formatDate } from '../../../../lib/format.js'
import { getOffre } from '../../../../lib/offres.js'
import './TableauDeBord.css'

// Jours d'essai restants, arrondis au jour supérieur (il reste « 1 jour » jusqu'à la fin).
function joursRestants(finEssai) {
  if (!finEssai) return null
  const heures = dayjs(finEssai).diff(dayjs(), 'hour', true)
  return Math.max(0, Math.ceil(heures / 24))
}

// Page provisoire (étape 6) : la coquille de l'application arrive à l'étape 8.
export default function TableauDeBord() {
  const { prenom, deconnecter } = useAuth()
  const { structure, structures, changerStructure } = useOrganization()
  const navigate = useNavigate()
  const [sortie, setSortie] = useState(false)
  const offre = getOffre(structure.type)
  const jours = structure.status === 'trial' ? joursRestants(structure.trial_ends_at) : null

  useEffect(() => {
    document.title = `${structure.name} — Fajkat`
  }, [structure.name])

  async function surDeconnexion() {
    setSortie(true)
    await deconnecter()
    navigate('/connexion', { replace: true })
  }

  return (
    <div className="tableau-de-bord">
      <header className="tableau-de-bord__entete">
        <span className="tableau-de-bord__marque">Fajkat</span>
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={LogOut} />}
          chargement={sortie}
          onClick={surDeconnexion}
        >
          Déconnexion
        </Button>
      </header>

      <main className="tableau-de-bord__contenu" id="contenu">
        <h1 className="tableau-de-bord__titre">
          Bonjour {prenom || 'et bienvenue'}
          <span className="tableau-de-bord__structure"> — {structure.name}</span>
        </h1>

        <Panel titre="Votre abonnement" marque>
          <dl className="tableau-de-bord__fiche">
            <div className="tableau-de-bord__ligne">
              <dt>Offre</dt>
              <dd>{offre?.nom ?? structure.type}</dd>
            </div>
            {jours !== null && (
              <div className="tableau-de-bord__ligne">
                <dt>Essai gratuit</dt>
                <dd>
                  <span className="tableau-de-bord__chiffre">{jours}</span>{' '}
                  {jours > 1 ? 'jours restants' : jours === 1 ? 'jour restant' : '— terminé'}
                  <span className="tableau-de-bord__date">
                    {' '}
                    (jusqu’au {formatDate(structure.trial_ends_at)})
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </Panel>

        {structures.length > 1 && (
          <Field id="tdb-structure" label="Structure ouverte">
            <Select
              options={structures.map((s) => ({ valeur: s.id, libelle: s.name }))}
              value={structure.id}
              onChange={(e) => changerStructure(e.target.value)}
            />
          </Field>
        )}

        <p className="tableau-de-bord__note">
          Page provisoire : les modules de votre structure arrivent aux prochaines étapes.
        </p>
      </main>
    </div>
  )
}
