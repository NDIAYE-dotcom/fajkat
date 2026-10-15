import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { nomComplet } from '../../utils.js'
import './ResultatRegistre.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

const chiffres = (v) => <span className="resultat-registre__chiffres">{v}</span>

const COLONNES = [
  { cle: 'numero', titre: 'Ligne', type: 'nombre', rendu: (c) => chiffres(c.numero) },
  { cle: 'patient', titre: 'Patient', principale: true, rendu: (c) => nomComplet(c.patient) },
  { cle: 'dossier', titre: 'N° de dossier', rendu: (c) => chiffres(c.file_number) },
]

// Bilan d'une page recopiée : dossiers créés avec leur numéro (à reporter dans la marge
// du registre papier), lignes restées dans la grille, doublons laissés de côté.
// pageSuivante : numéro de la page suivante quand toute la page est enregistrée.
export default function ResultatRegistre({ envoi, resultat, lignes, pageSuivante, onContinuer }) {
  if (!resultat) {
    return (
      <section className="resultat-registre" aria-live="polite">
        <h2 className="resultat-registre__titre">Enregistrement en cours…</h2>
        <progress
          className="resultat-registre__progression"
          max={Math.max(envoi.total, 1)}
          value={envoi.lot}
          aria-label="Progression de l’enregistrement"
        />
        <p>Ne fermez pas cette page.</p>
      </section>
    )
  }

  const { importees, creees, ignorees, restantes, interruption, repere } = resultat
  const patients = new Map(lignes.map((l) => [l.numero, l.patient]))
  const lignesCreees = creees.map((c) => ({ ...c, patient: patients.get(c.numero) ?? {} }))

  let suite = 'Corriger les lignes restantes'
  if (!restantes)
    suite = pageSuivante ? `Recopier la page ${pageSuivante}` : 'Recopier une autre page'

  return (
    <section className="resultat-registre" aria-labelledby="resultat-registre-titre">
      <div className="resultat-registre__bilan">
        <div>
          <p className="resultat-registre__repere">{repere}</p>
          <h2 id="resultat-registre-titre" className="resultat-registre__titre">
            {pluriel(importees, 'patient enregistré', 'patients enregistrés')}
          </h2>
        </div>
        {importees > 0 && !restantes && <Tampon ton="primaire">Recopiée</Tampon>}
      </div>
      <ul className="resultat-registre__compteurs">
        <li>{pluriel(importees, 'dossier créé', 'dossiers créés')} au registre</li>
        <li>{pluriel(restantes, 'ligne restée', 'lignes restées')} dans la grille</li>
        <li>{pluriel(ignorees.length, 'doublon laissé', 'doublons laissés')} de côté</li>
      </ul>

      {interruption && (
        <Message ton="erreur" titre="L’enregistrement s’est interrompu">
          <p>{interruption.message}</p>
          <p>
            Les lignes concernées restent dans la grille. Dès le retour de la connexion, vérifiez la
            page de nouveau : un dossier déjà créé sera reconnu comme doublon.
          </p>
        </Message>
      )}
      {restantes > 0 && !interruption && (
        <Message ton="info" titre="Des lignes restent à corriger">
          <p>Elles sont gardées dans la grille avec la raison du refus.</p>
        </Message>
      )}

      {lignesCreees.length > 0 && (
        <div className="resultat-registre__dossiers">
          <p>Vous pouvez reporter le nouveau numéro dans la marge du registre papier.</p>
          <Table
            colonnes={COLONNES}
            lignes={lignesCreees}
            cleLigne="numero"
            legende="Dossiers créés"
            hauteurMax="none"
          />
        </div>
      )}

      <div className="resultat-registre__actions">
        <Button variante="secondaire" to="/app/patients">
          Voir le registre
        </Button>
        <Button onClick={onContinuer}>{suite}</Button>
      </div>
    </section>
  )
}
