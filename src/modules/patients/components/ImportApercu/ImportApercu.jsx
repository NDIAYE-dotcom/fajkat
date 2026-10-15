import { Upload } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import TableImport from '../TableImport/TableImport.jsx'
import { COLONNES_ERREURS, COLONNES_VALIDES, colonnesDoublons } from './colonnesApercu.jsx'
import './ImportApercu.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

// Étape 2 : aperçu avant l'import. Rien n'est enregistré avant « Confirmer l'import ».
// Les doublons probables sont ignorés par défaut.
export default function ImportApercu({
  fichier,
  lignes,
  erreurEnvoi,
  onDecider,
  onToutDecider,
  onConfirmer,
  onAnnuler,
}) {
  const enLigne = useEnLigne()
  const valides = lignes.filter((l) => l.statut === 'valide')
  const erreurs = lignes.filter((l) => l.statut === 'erreur')
  const doublons = lignes.filter((l) => l.statut === 'doublon')
  const aImporter = doublons.filter((l) => l.importer).length
  const total = valides.length + aImporter
  const [onglet, setOnglet] = useState(() => (doublons.length ? 'doublons' : 'valides'))

  const onglets = [
    {
      id: 'valides',
      libelle: 'Valides',
      compteur: valides.length,
      contenu: (
        <TableImport
          colonnes={COLONNES_VALIDES}
          lignes={valides}
          legende="Lignes valides"
          vide={<EmptyState titre="Aucune ligne valide" />}
        />
      ),
    },
    {
      id: 'erreurs',
      libelle: 'En erreur',
      compteur: erreurs.length,
      contenu: (
        <TableImport
          colonnes={COLONNES_ERREURS}
          lignes={erreurs}
          legende="Lignes en erreur"
          vide={<EmptyState titre="Aucune ligne en erreur" />}
        />
      ),
    },
    {
      id: 'doublons',
      libelle: 'Doublons probables',
      compteur: doublons.length,
      contenu: (
        <div className="import-apercu__onglet">
          {doublons.length > 0 && (
            <div className="import-apercu__barre">
              <p className="import-apercu__doux">
                {pluriel(doublons.length - aImporter, 'ignoré', 'ignorés')},{' '}
                {pluriel(aImporter, 'importé quand même', 'importés quand même')}.
              </p>
              <div className="import-apercu__boutons">
                <Button variante="secondaire" onClick={() => onToutDecider(false)}>
                  Tout ignorer
                </Button>
                <Button variante="secondaire" onClick={() => onToutDecider(true)}>
                  Tout importer
                </Button>
              </div>
            </div>
          )}
          <TableImport
            colonnes={colonnesDoublons(onDecider)}
            lignes={doublons}
            legende="Doublons probables"
            vide={<EmptyState titre="Aucun doublon probable" />}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="import-apercu">
      <section className="import-apercu__resume" aria-label="Résumé du fichier">
        <p>
          <strong className="import-apercu__fichier">{fichier.nom}</strong> :{' '}
          {pluriel(lignes.length, 'ligne lue', 'lignes lues')}.
        </p>
        <ul className="import-apercu__compteurs">
          <li>{pluriel(valides.length, 'ligne valide', 'lignes valides')}</li>
          <li>{pluriel(erreurs.length, 'ligne en erreur', 'lignes en erreur')} (non importées)</li>
          <li>{pluriel(doublons.length, 'doublon probable', 'doublons probables')}</li>
        </ul>
      </section>

      {fichier.inconnues.length > 0 && (
        <Message ton="info" titre="Colonnes non reconnues, ignorées">
          <p>{fichier.inconnues.join(', ')}</p>
        </Message>
      )}

      <Tabs onglets={onglets} actif={onglet} onChange={setOnglet} libelle="Aperçu de l’import" />

      {erreurEnvoi && (
        <Message ton="erreur" titre="L’import n’a pas commencé">
          <p>{erreurEnvoi}</p>
          <p>Rien n’a été enregistré. Vos choix sont conservés : vous pouvez réessayer.</p>
        </Message>
      )}
      {!enLigne && (
        <Message ton="info" titre="Vous êtes hors ligne">
          <p>L’aperçu reste affiché. Confirmez l’import dès le retour de la connexion.</p>
        </Message>
      )}

      <div className="import-apercu__confirmation">
        <p>
          {total > 0
            ? `${pluriel(total, 'patient sera ajouté', 'patients seront ajoutés')} au registre.`
            : 'Aucune ligne à importer.'}{' '}
          {erreurs.length > 0 &&
            `Les lignes en erreur pourront être téléchargées pour être corrigées.`}
        </p>
        <div className="import-apercu__boutons">
          <Button variante="secondaire" onClick={onAnnuler}>
            Choisir un autre fichier
          </Button>
          <Button
            iconeDebut={<Icone icone={Upload} />}
            disabled={total === 0 || !enLigne}
            onClick={onConfirmer}
          >
            Confirmer l’import
          </Button>
        </div>
      </div>
    </div>
  )
}
