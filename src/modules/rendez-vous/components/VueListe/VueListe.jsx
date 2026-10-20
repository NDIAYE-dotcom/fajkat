import { CalendarX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { ageOuNaissance, nomJour, statutRdv } from '../../agenda.js'
import { dateFr } from '../../utils.js'
import './VueListe.css'

// Vue liste : deux semaines de rendez-vous dans un tableau registre (cartes sous 640 px),
// avec un filtre par type, et par praticien en clinique. onOuvrir : détail d'un rendez-vous.
export default function VueListe({
  rdv,
  types,
  praticiens,
  multiPraticiens,
  chargement,
  onOuvrir,
}) {
  const [type, setType] = useState('')
  const [praticien, setPraticien] = useState('')
  // Libellés renvoyés par la base (neutres pour un type discret que le rôle ne voit pas),
  // et types visibles sans rendez-vous sur la période.
  const libellesTypes = [
    ...new Set([...types.map((t) => t.label), ...rdv.map((r) => r.type_label).filter(Boolean)]),
  ]
  const lignes = rdv.filter(
    (r) =>
      (!type || r.type_label === type) &&
      (!praticien ||
        (praticien === 'aucun'
          ? !r.practitioner_membership_id
          : r.practitioner_membership_id === praticien)),
  )

  // Trois colonnes (quatre en clinique) : lisible à côté du menu latéral, sans
  // défilement du tableau. Sous 640 px, chaque rendez-vous devient une carte.
  const colonnes = [
    {
      cle: 'quand',
      titre: 'Quand',
      rendu: (r) => (
        <span className="vue-liste__quand">
          <span className="vue-liste__date">
            {`${nomJour(r.local_date).slice(0, 3)}. ${dateFr(r.local_date)}`}
          </span>
          <span className="vue-liste__heure">{formatHeure(r.starts_at)}</span>
        </span>
      ),
    },
    {
      cle: 'patient',
      titre: 'Patient',
      principale: true,
      rendu: (r) => (
        <span className="vue-liste__identite">
          <Link className="vue-liste__patient" to={`/app/patients/${r.patient_id}`}>
            {nomComplet({ last_name: r.patient_last_name, first_name: r.patient_first_name })}
          </Link>
          <span className="vue-liste__precision">
            {r.file_number && <span className="vue-liste__dossier">{r.file_number}</span>}
            {ageOuNaissance(r) && <span>{ageOuNaissance(r)}</span>}
          </span>
        </span>
      ),
    },
    {
      cle: 'type',
      titre: 'Type et statut',
      rendu: (r) => {
        const s = statutRdv(r)
        return (
          <span className="vue-liste__type">
            <span>{r.type_label ?? '—'}</span>
            {s && (
              <Tampon ton={s.ton} long={s.long}>
                {s.libelle}
              </Tampon>
            )}
            {onOuvrir && (
              <Button
                variante="discret"
                aria-label={`Détails du rendez-vous du ${dateFr(r.local_date)} à ${formatHeure(r.starts_at)}`}
                onClick={() => onOuvrir(r)}
              >
                Détails
              </Button>
            )}
          </span>
        )
      },
    },
    ...(multiPraticiens
      ? [{ cle: 'praticien', titre: 'Praticien', rendu: (r) => r.practitioner_name ?? '—' }]
      : []),
  ]

  return (
    <div className="vue-liste">
      <div className="vue-liste__filtres">
        <Field label="Type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { valeur: '', libelle: 'Tous les types' },
              ...libellesTypes.map((l) => ({ valeur: l, libelle: l })),
            ]}
          />
        </Field>
        {multiPraticiens && (
          <Field label="Praticien">
            <Select
              value={praticien}
              onChange={(e) => setPraticien(e.target.value)}
              options={[
                { valeur: '', libelle: 'Tous les praticiens' },
                ...praticiens.map((p) => ({ valeur: p.id, libelle: p.nom })),
                { valeur: 'aucun', libelle: 'Sans praticien' },
              ]}
            />
          </Field>
        )}
      </div>
      <Table
        legende="Rendez-vous de la période"
        colonnes={colonnes}
        lignes={lignes}
        chargement={chargement}
        vide={
          <EmptyState
            icone={CalendarX}
            titre="Aucun rendez-vous sur ces deux semaines"
            texte={type || praticien ? 'Essayez sans filtre.' : undefined}
          />
        }
      />
    </div>
  )
}
