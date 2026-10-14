import { Link } from 'react-router-dom'
import { useOffre } from '../../../../hooks/useOffre.js'
import { EDITEUR, A_COMPLETER } from '../../../../lib/editeur.js'
import { formatTelephone } from '../../../../lib/format.js'
import { CONTACT_DEMO, OFFRES, lienDemoWhatsApp } from '../../../../lib/offres.js'
import './PiedDePage.css'

// Pied de page commun aux pages publiques : présentation, liens, contact et documents légaux.
export default function PiedDePage() {
  const { offre, derniereOffre } = useOffre()
  // Tarifs et FAQ se trouvent sur la page d'une offre : celle affichée, sinon la dernière consultée.
  const cible = (offre ?? OFFRES[derniereOffre] ?? OFFRES.poste_sante).chemin
  const { whatsapp, email } = CONTACT_DEMO

  return (
    <footer className="pied-de-page">
      <div className="pied-de-page__interieur">
        <div className="pied-de-page__presentation">
          <p className="pied-de-page__marque">
            <svg className="pied-de-page__logo" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" />
              <text x="16" y="23" textAnchor="middle">
                F
              </text>
            </svg>
            Fajkat
          </p>
          <p className="pied-de-page__phrase">
            Logiciel de gestion pour les postes de santé et les cliniques, au Sénégal puis dans
            l’espace UEMOA. En cours de développement.
          </p>
        </div>

        <nav className="pied-de-page__colonne" aria-labelledby="pied-offres">
          <p id="pied-offres" className="pied-de-page__titre">
            Offres
          </p>
          <ul className="pied-de-page__liste">
            <li>
              <Link to={OFFRES.poste_sante.chemin} className="pied-de-page__lien">
                Poste de santé
              </Link>
            </li>
            <li>
              <Link to={OFFRES.clinique.chemin} className="pied-de-page__lien">
                Clinique
              </Link>
            </li>
            <li>
              <Link to={{ pathname: cible, hash: 'tarif' }} className="pied-de-page__lien">
                Tarifs
              </Link>
            </li>
            <li>
              <Link to={{ pathname: cible, hash: 'faq' }} className="pied-de-page__lien">
                FAQ
              </Link>
            </li>
          </ul>
        </nav>

        <div className="pied-de-page__colonne">
          <p className="pied-de-page__titre">Contact</p>
          <ul className="pied-de-page__liste">
            <li>
              <a
                href={lienDemoWhatsApp(offre)}
                target="_blank"
                rel="noopener noreferrer"
                className="pied-de-page__lien"
              >
                Demander une démo<span className="sr-only"> sur WhatsApp (nouvel onglet)</span>
              </a>
            </li>
            <li className="pied-de-page__contact">
              WhatsApp :{' '}
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                className="pied-de-page__lien"
              >
                {formatTelephone(whatsapp)}
              </a>
            </li>
            <li className="pied-de-page__contact">
              E-mail :{' '}
              {email ? (
                <a href={`mailto:${email}`} className="pied-de-page__lien">
                  {email}
                </a>
              ) : (
                A_COMPLETER
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="pied-de-page__bas">
        <p>
          © {new Date().getFullYear()} {EDITEUR.raisonSociale}
        </p>
        <ul className="pied-de-page__legal">
          <li>
            <Link to="/mentions-legales" className="pied-de-page__lien">
              Mentions légales
            </Link>
          </li>
          <li>
            <Link to="/confidentialite" className="pied-de-page__lien">
              Confidentialité
            </Link>
          </li>
          <li>
            <Link to="/cgu" className="pied-de-page__lien">
              CGU
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  )
}
