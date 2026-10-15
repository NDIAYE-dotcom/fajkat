import { formatTelephone } from '../../../../lib/format.js'
import { libelleNaissance, nomComplet } from '../../utils.js'
import './CartePatient.css'

// Carte patient au format bancaire (85,6 × 54 mm), recto et verso côte à côte sur la même
// face : on découpe le contour, on plie sur les pointillés, la carte est prête. Pas
// d'impression recto-verso, trop difficile à aligner sur les imprimantes des structures.
// qrSvg : QR code déjà dessiné (SVG) ; il ne contient que l'adresse du dossier.
export default function CartePatient({ patient, structure, qrSvg, className = '' }) {
  const retour = [structure.name, structure.phone && formatTelephone(structure.phone)]
    .filter(Boolean)
    .join(', ')

  return (
    <div className={`carte-patient ${className}`.trim()}>
      <div className="carte-patient__planche">
        <section className="carte-patient__face carte-patient__face--recto" aria-label="Recto">
          <header className="carte-patient__structure">
            {structure.logo_url && (
              <img className="carte-patient__logo" src={structure.logo_url} alt="" />
            )}
            <span className="carte-patient__nom-structure">{structure.name}</span>
          </header>
          <div className="carte-patient__corps">
            <div className="carte-patient__identite">
              <p className="carte-patient__mention">Carte patient</p>
              <p className="carte-patient__nom">{nomComplet(patient)}</p>
              <p className="carte-patient__numero">{patient.file_number}</p>
              <p className="carte-patient__naissance">{libelleNaissance(patient)}</p>
            </div>
            <div
              className="carte-patient__qr"
              role="img"
              aria-label="QR code du dossier"
              // SVG produit par la bibliothèque qrcode à partir de l'adresse du dossier.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
        </section>
        <section className="carte-patient__face carte-patient__face--verso" aria-label="Verso">
          <p className="carte-patient__consigne">Présentez cette carte à chaque visite.</p>
          <p className="carte-patient__perte">
            En cas de perte, merci de la rapporter à : {retour}.
          </p>
          <p className="carte-patient__numero carte-patient__numero--verso">
            {patient.file_number}
          </p>
        </section>
      </div>
      <p className="carte-patient__aide">
        Découpez le long du trait plein, pliez sur les pointillés, recto vers l’extérieur.
      </p>
    </div>
  )
}
