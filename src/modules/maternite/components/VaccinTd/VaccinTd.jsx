import { useQueryClient } from '@tanstack/react-query'
import { Syringe } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { annulerDose, cles } from '../../api.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import { formatDateApprox, texteProchaineDose, texteProtection } from '../../soins.js'
import ModaleMotif from '../ModaleMotif/ModaleMotif.jsx'
import ModaleTdCarnet from '../ModaleTdCarnet/ModaleTdCarnet.jsx'
import './VaccinTd.css'

// Vaccin Td de la patiente : doses (faites ici ou d'après le carnet, date à sa précision :
// « mars 2024 », « 2025 »), prochaine dose et protection, en lecture prudente ; ajout d'après
// le carnet et annulation motivée pour les soignants qui écrivent.
export default function VaccinTd({ patientId, grossesseId, td, ecrire }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const [fenetre, setFenetre] = useState(null) // 'carnet' | { annuler: dose }
  if (!td) return null

  async function apres(message) {
    setFenetre(null)
    await queryClient.invalidateQueries({ queryKey: cles.soins(grossesseId) })
    toast.succes(message)
  }

  const prochaine = td.next
  return (
    <section className="vaccin-td" aria-labelledby="vaccin-td-titre">
      <div className="vaccin-td__entete">
        <h3 id="vaccin-td-titre" className="vaccin-td__titre">
          Vaccin Td
        </h3>
        {ecrire && prochaine && (
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Syringe} />}
            disabled={!enLigne}
            onClick={() => setFenetre('carnet')}
          >
            Noter un Td d’après le carnet
          </Button>
        )}
      </div>
      {td.doses.length > 0 && (
        <div className="vaccin-td__bilan" role="status">
          <p>{texteProtection(td.protection)}</p>
          <p>
            {prochaine
              ? texteProchaineDose(prochaine, aujourdhuiStructure())
              : 'Toutes les doses sont notées.'}
          </p>
        </div>
      )}
      {td.doses.length === 0 ? (
        <p className="vaccin-td__doux">Aucune dose notée.</p>
      ) : (
        <ol className="vaccin-td__liste" aria-label="Doses de Td">
          {td.doses.map((d) => (
            <li key={d.id} className="vaccin-td__ligne">
              <span className="vaccin-td__dose">{d.dose_label}</span>
              <span className="vaccin-td__chiffres">
                {formatDateApprox(d.given_on, d.date_precision)}
              </span>
              <span className="vaccin-td__doux">
                {d.origin === 'here' ? 'Ici' : `D’après le carnet${d.place ? ` · ${d.place}` : ''}`}
                {d.lot_number && (
                  <>
                    {' · lot '}
                    <span className="vaccin-td__lot">{d.lot_number}</span>
                  </>
                )}
              </span>
              {ecrire && (
                <Button
                  variante="discret"
                  disabled={!enLigne}
                  onClick={() => setFenetre({ annuler: d })}
                >
                  Annuler
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      {fenetre === 'carnet' && (
        <ModaleTdCarnet
          patientId={patientId}
          rangPropose={prochaine?.rank ?? 1}
          rangsPris={td.doses.map((d) => d.dose_rank)}
          total={td.doses_total}
          onFermer={() => setFenetre(null)}
          onNotee={() => apres('Dose notée')}
        />
      )}
      {fenetre?.annuler && (
        <ModaleMotif
          titre={`Annuler la dose ${fenetre.annuler.dose_label} ?`}
          texte="À faire seulement pour une dose notée par erreur. Elle n’est jamais effacée : le journal du dossier la garde."
          action="Annuler la dose"
          aideMotif="Indiquez pourquoi cette dose est annulée."
          onFermer={() => setFenetre(null)}
          onConfirmer={async (motif) => {
            await annulerDose(fenetre.annuler.id, motif)
            await apres('Dose annulée')
          }}
        />
      )}
    </section>
  )
}
