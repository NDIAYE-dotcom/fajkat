import { Upload } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import TableImport from '../TableImport/TableImport.jsx'
import { COLONNES_VALIDES, colonnesDoublons, colonnesErreurs } from './colonnesApercu.jsx'
import './ImportApercu.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

// Textes selon l'origine : un fichier importé, ou une page de registre recopiée (les
// lignes en erreur y restent dans la grille au lieu d'être téléchargées).
const TEXTES = {
  fichier: {
    resume: 'Résumé du fichier',
    lues: ['ligne lue', 'lignes lues'],
    nonEnvoyees: '(non importées)',
    quandMeme: ['importé quand même', 'importés quand même'],
    tout: 'Tout importer',
    correction: 'Les lignes en erreur pourront être téléchargées pour être corrigées.',
    aucune: 'Aucune ligne à importer.',
    pasCommence: 'L’import n’a pas commencé',
    horsLigne: 'Confirmez l’import dès le retour de la connexion.',
    retour: 'Choisir un autre fichier',
    confirmer: 'Confirmer l’import',
  },
  registre: {
    resume: 'Résumé de la page',
    lues: ['ligne recopiée', 'lignes recopiées'],
    nonEnvoyees: '(restent dans la grille)',
    quandMeme: ['enregistré quand même', 'enregistrés quand même'],
    tout: 'Tout enregistrer',
    correction: 'Les lignes en erreur restent dans la grille pour être corrigées.',
    aucune: 'Aucune ligne à enregistrer.',
    pasCommence: 'L’enregistrement n’a pas commencé',
    horsLigne: 'Confirmez dès le retour de la connexion : la page reste gardée sur l’appareil.',
    retour: 'Retour à la grille',
    confirmer: 'Enregistrer la page',
  },
}

// Étape 2 : aperçu avant l'enregistrement. Rien n'est enregistré avant la confirmation.
// Les doublons probables sont ignorés par défaut.
export default function ImportApercu({
  source = 'fichier',
  fichier,
  lignes,
  erreurEnvoi,
  onDecider,
  onToutDecider,
  onConfirmer,
  onAnnuler,
}) {
  const enLigne = useEnLigne()
  const t = TEXTES[source]
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
          colonnes={colonnesErreurs(source)}
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
                {pluriel(aImporter, ...t.quandMeme)}.
              </p>
              <div className="import-apercu__boutons">
                <Button variante="secondaire" onClick={() => onToutDecider(false)}>
                  Tout ignorer
                </Button>
                <Button variante="secondaire" onClick={() => onToutDecider(true)}>
                  {t.tout}
                </Button>
              </div>
            </div>
          )}
          <TableImport
            colonnes={colonnesDoublons(onDecider, source)}
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
      <section className="import-apercu__resume" aria-label={t.resume}>
        <p>
          <strong className="import-apercu__fichier">{fichier.nom}</strong> :{' '}
          {pluriel(lignes.length, ...t.lues)}.
        </p>
        <ul className="import-apercu__compteurs">
          <li>{pluriel(valides.length, 'ligne valide', 'lignes valides')}</li>
          <li>
            {pluriel(erreurs.length, 'ligne en erreur', 'lignes en erreur')} {t.nonEnvoyees}
          </li>
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
        <Message ton="erreur" titre={t.pasCommence}>
          <p>{erreurEnvoi}</p>
          <p>Rien n’a été enregistré. Vos choix sont conservés : vous pouvez réessayer.</p>
        </Message>
      )}
      {!enLigne && (
        <Message ton="info" titre="Vous êtes hors ligne">
          <p>L’aperçu reste affiché. {t.horsLigne}</p>
        </Message>
      )}

      <div className="import-apercu__confirmation">
        <p>
          {total > 0
            ? `${pluriel(total, 'patient sera ajouté', 'patients seront ajoutés')} au registre.`
            : t.aucune}{' '}
          {erreurs.length > 0 && t.correction}
        </p>
        <div className="import-apercu__boutons">
          <Button variante="secondaire" onClick={onAnnuler}>
            {t.retour}
          </Button>
          <Button
            iconeDebut={<Icone icone={Upload} />}
            disabled={total === 0 || !enLigne}
            onClick={onConfirmer}
          >
            {t.confirmer}
          </Button>
        </div>
      </div>
    </div>
  )
}
