import Table from '../../../../components/ui/Table/Table.jsx'
import { formatTelephone } from '../../../../lib/format.js'
import { libelleAge, libelleNaissance, libelleTitulaire, nomComplet } from '../../utils.js'
import './ListePatients.css'

// Registre des patients : une ligne par dossier, avec ce qui distingue les homonymes.
// Sous 640 px, chaque ligne devient une carte (Table).
export default function ListePatients({ lignes, chargement, legende, vide, onOuvrir }) {
  const colonnes = [
    {
      cle: 'nom',
      titre: 'Patient',
      principale: true,
      rendu: (p) => (
        <button type="button" className="liste-patients__nom" onClick={() => onOuvrir(p.id)}>
          {nomComplet(p)}
        </button>
      ),
    },
    {
      cle: 'file_number',
      titre: 'N° de dossier',
      rendu: (p) => (
        <span className="liste-patients__age">
          <span className="liste-patients__chiffres">{p.file_number}</span>
          {p.legacy_file_number && (
            <span className="liste-patients__doux">
              ancien n° <span className="liste-patients__chiffres">{p.legacy_file_number}</span>
            </span>
          )}
          {/* Trouvé par le numéro d'un dossier fusionné dans celui-ci. */}
          {p.merged_file_numbers && (
            <span className="liste-patients__fusion">
              ancien dossier{' '}
              <span className="liste-patients__chiffres">{p.merged_file_numbers}</span>, fusionné
            </span>
          )}
        </span>
      ),
    },
    {
      cle: 'age',
      titre: 'Âge',
      rendu: (p) => (
        <span className="liste-patients__age">
          <span>
            {p.sex} · {libelleAge(p)}
          </span>
          <span className="liste-patients__doux">{libelleNaissance(p)}</span>
        </span>
      ),
    },
    {
      cle: 'phone',
      titre: 'Téléphone',
      rendu: (p) =>
        p.phone ? (
          <span className="liste-patients__age">
            <span className="liste-patients__chiffres">{formatTelephone(p.phone)}</span>
            {p.phone_owner && (
              <span className="liste-patients__doux">{libelleTitulaire(p.phone_owner, p.sex)}</span>
            )}
          </span>
        ) : (
          '—'
        ),
    },
    { cle: 'neighborhood', titre: 'Quartier', rendu: (p) => p.neighborhood || '—' },
    {
      cle: 'mother_first_name',
      titre: 'Mère',
      masquerMobile: true,
      rendu: (p) => p.mother_first_name || '—',
    },
  ]

  return (
    <Table
      className="liste-patients"
      colonnes={colonnes}
      lignes={lignes}
      chargement={chargement}
      legende={legende}
      vide={vide}
      hauteurMax="none"
    />
  )
}
