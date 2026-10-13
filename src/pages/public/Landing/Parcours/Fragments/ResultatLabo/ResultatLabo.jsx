import { FlaskConical } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import TamponAnime from '../../TamponAnime/TamponAnime.jsx'
import './ResultatLabo.css'

// Résultats fictifs. bas : valeur sous la norme, signalée au médecin.
const RESULTATS = [
  { examen: 'Hémoglobine', valeur: '10,8 g/dL', norme: '13 – 17', bas: true },
  { examen: 'Leucocytes', valeur: '7,2 G/L', norme: '4 – 10' },
  { examen: 'Plaquettes', valeur: '245 G/L', norme: '150 – 400' },
]

// Le résultat de NFS s'affiche, est tamponné « VALIDÉ » et transmis au médecin.
export default function ResultatLabo({ actif }) {
  return (
    <CarteFragment icone={FlaskConical} titre="Résultat · NFS" precision="M. Diop" actif={actif}>
      <table className="resultat-labo__tableau">
        <thead>
          <tr>
            <th>Examen</th>
            <th>Résultat</th>
            <th>Norme</th>
          </tr>
        </thead>
        <tbody>
          {RESULTATS.map((r, index) => (
            <tr key={r.examen} className="resultat-labo__ligne" style={{ '--i': index }}>
              <td>{r.examen}</td>
              <td className="resultat-labo__valeur" data-bas={r.bas || undefined}>
                {r.valeur}
                {r.bas && <span className="resultat-labo__signal"> ↓ bas</span>}
              </td>
              <td className="resultat-labo__norme">{r.norme}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="resultat-labo__pied">
        <p className="resultat-labo__transmis">Transmis au Dr A. Sarr · 14:05</p>
        <TamponAnime actif={actif} delai={1500}>
          Validé
        </TamponAnime>
      </div>
    </CarteFragment>
  )
}
