import { Printer } from 'lucide-react'
import { useRef } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { imprimer } from '../../../../lib/impression.js'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import './Impression.css'

export default function Impression() {
  const ticket = useRef(null)
  const ordonnance = useRef(null)

  return (
    <SectionAtelier
      id="impression"
      titre="Impression"
      intro="Ticket thermique 80 mm pour les reçus, A5 ou A4 pour les documents. Tout s'imprime en noir sur blanc ; seul l'élément choisi part à l'imprimante."
    >
      <Demo titre="Reçu de caisse, ticket 80 mm">
        <div className="impression__colonne">
          <div ref={ticket} className="ticket-80 impression__apercu">
            <div className="ticket-80__entete">
              <p className="ticket-80__structure">Poste de santé de Sikilo</p>
              <p>Kolda · +221 33 996 00 00</p>
            </div>
            <hr className="ticket-80__separateur" />
            <p className="ticket-80__ligne">
              <span>Reçu n°</span>
              <span>2026-001284</span>
            </p>
            <p className="ticket-80__ligne">
              <span>Date</span>
              <span>14/10/2026 08:24</span>
            </p>
            <p className="ticket-80__ligne">
              <span>Patient</span>
              <span>Ibrahima Fall</span>
            </p>
            <hr className="ticket-80__separateur" />
            <p className="ticket-80__ligne">
              <span>Ticket de consultation</span>
              <span>1 000</span>
            </p>
            <p className="ticket-80__ligne">
              <span>Pansement</span>
              <span>500</span>
            </p>
            <hr className="ticket-80__separateur" />
            <p className="ticket-80__ligne ticket-80__total">
              <span>Total</span>
              <span>1 500 FCFA</span>
            </p>
            <p className="ticket-80__ligne">
              <span>Payé par</span>
              <span>Wave</span>
            </p>
            <div className="ticket-80__pied">
              <Tampon statut="paye" />
              <p>Merci. Gardez ce reçu.</p>
            </div>
          </div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Printer} />}
            onClick={() => imprimer(ticket.current)}
          >
            Imprimer le reçu
          </Button>
        </div>
      </Demo>

      <Demo titre="Ordonnance A5">
        <div className="impression__colonne impression__colonne--large">
          <article ref={ordonnance} className="impression-a5 impression__feuille">
            <header className="impression__entete">
              <h1>Ordonnance</h1>
              <p>Poste de santé de Sikilo, Kolda</p>
              <p>Le 14/10/2026</p>
            </header>
            <p className="impression__patient">
              <strong>Aminata Ba</strong>, 3 ans, 14 kg
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">Médicament</th>
                  <th scope="col">Posologie</th>
                  <th scope="col">Durée</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Artéméther-luméfantrine 20/120 mg</td>
                  <td className="chiffres">1 cp matin et soir</td>
                  <td className="chiffres">3 jours</td>
                </tr>
                <tr>
                  <td>Paracétamol sirop 120 mg/5 ml</td>
                  <td className="chiffres">7,5 ml 3 fois par jour</td>
                  <td className="chiffres">3 jours</td>
                </tr>
              </tbody>
            </table>
            <div className="impression-signature impression__signature">
              <p>L'infirmier chef de poste</p>
            </div>
          </article>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Printer} />}
            onClick={() => imprimer(ordonnance.current)}
          >
            Imprimer l'ordonnance (A5)
          </Button>
        </div>
      </Demo>
    </SectionAtelier>
  )
}
