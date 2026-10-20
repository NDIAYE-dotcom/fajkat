import './MiseEnPageConsultation.css'

// Saisie (ou lecture) de la consultation et, à côté sur grand écran, le panneau du dossier
// (antécédents). Sur téléphone, le panneau passe au-dessus, replié.
export default function MiseEnPageConsultation({ panneau, children }) {
  return (
    <div className="mise-en-page-consultation">
      {panneau && <aside className="mise-en-page-consultation__panneau">{panneau}</aside>}
      <div className="mise-en-page-consultation__principal">{children}</div>
    </div>
  )
}
