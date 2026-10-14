import { useApparition } from '../../../../hooks/useApparition.js'
import { famillesOffre, prixOffre } from '../../../../lib/offres.js'
import BoutonDemo from '../BoutonDemo/BoutonDemo.jsx'
import BoutonInscription from '../BoutonInscription/BoutonInscription.jsx'
import ComparaisonOffres from '../ComparaisonOffres/ComparaisonOffres.jsx'
import './RecuTarif.css'

const PAIEMENTS = 'Wave · Orange Money · Free Money · carte'

// Passage d'offre sans perte de données (CLAUDE.md, section 6), formulé selon l'offre affichée.
const PASSAGE = {
  poste_sante: 'Passage à l’offre Clinique sans perte de données',
  clinique: 'Passage depuis l’offre Poste de santé sans perte de données',
}

// Tarif présenté comme un reçu de ticket thermique 80 mm qui sort de l'imprimante
// quand il arrive à l'écran. Le prix vient uniquement de src/lib/offres.js.
export default function RecuTarif({ offre, notes = [] }) {
  const [ref, apparu] = useApparition({ seuil: 0.3 })
  const familles = famillesOffre(offre)

  return (
    <section
      ref={ref}
      id="tarif"
      className="recu-tarif"
      data-apparu={apparu || undefined}
      aria-labelledby="recu-tarif-titre"
    >
      <div className="recu-tarif__interieur">
        <div className="recu-tarif__texte">
          <p className="recu-tarif__surtitre apparition">Tarif</p>
          <h2
            id="recu-tarif-titre"
            className="recu-tarif__titre apparition"
            style={{ '--rang': 1 }}
          >
            Un abonnement mensuel pour votre{' '}
            {offre.type === 'clinique' ? 'clinique' : 'poste de santé'}.
          </h2>
          <ul className="recu-tarif__notes">
            {notes.map((note, index) => (
              <li key={note} className="apparition" style={{ '--rang': index + 2 }}>
                {note}
              </li>
            ))}
          </ul>
          <div className="apparition" style={{ '--rang': notes.length + 2 }}>
            <ComparaisonOffres />
          </div>
        </div>

        <div className="recu-tarif__colonne">
          <div className="recu-tarif__imprimante">
            <span className="recu-tarif__fente" aria-hidden="true" />
            {/* La sortie masque le reçu tant qu'il n'est pas « imprimé » */}
            <div className="recu-tarif__sortie">
              <div className="recu-tarif__recu">
                <p className="recu-tarif__marque">Fajkat</p>
                <p className="recu-tarif__libelle">Abonnement · offre {offre.nom}</p>

                <p className="recu-tarif__prix">
                  <span className="recu-tarif__montant">{prixOffre(offre)}</span>
                  <span className="recu-tarif__periode">par mois</span>
                </p>

                <p className="recu-tarif__rubrique">Inclus</p>
                <ul className="recu-tarif__lignes">
                  {familles.map((famille) => (
                    <li key={famille.id} className="recu-tarif__ligne">
                      <span>{famille.titre}</span>
                      <span>{famille.fonctionnalites.length} modules</span>
                    </li>
                  ))}
                </ul>

                <p className="recu-tarif__rubrique">Paiement prévu</p>
                <p className="recu-tarif__info">{PAIEMENTS}</p>

                <p className="recu-tarif__passage">{PASSAGE[offre.type]}</p>
                <p className="recu-tarif__etat">En développement</p>
              </div>
            </div>
          </div>
          <div className="recu-tarif__action apparition" style={{ '--rang': 3 }}>
            <BoutonDemo offre={offre} taille="grande" />
            <BoutonInscription offre={offre} />
          </div>
        </div>
      </div>
    </section>
  )
}
