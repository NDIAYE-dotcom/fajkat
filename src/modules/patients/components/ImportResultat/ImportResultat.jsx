import { Download } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { telechargerRefus } from '../../import/fichiers.js'
import './ImportResultat.css'

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

// Étape 3 : envoi par lots, puis bilan. Les lignes refusées (et les doublons ignorés)
// se téléchargent en Excel pour être corrigées puis importées de nouveau.
export default function ImportResultat({ fichier, envoi, resultat, onRecommencer }) {
  const [telechargement, setTelechargement] = useState({ enCours: false, erreur: null })

  if (!resultat) {
    return (
      <section className="import-resultat" aria-live="polite">
        <h2 className="import-resultat__titre">Enregistrement en cours…</h2>
        <progress
          className="import-resultat__progression"
          max={Math.max(envoi.total, 1)}
          value={envoi.lot}
          aria-label="Progression de l’import"
        />
        <p>
          Lot {envoi.lot} sur {envoi.total}. Ne fermez pas cette page.
        </p>
      </section>
    )
  }

  const { importees, refusees, ignorees, interruption } = resultat

  async function surTelechargement() {
    setTelechargement({ enCours: true, erreur: null })
    try {
      await telechargerRefus({
        nomFichier: fichier.nom,
        entetes: fichier.entetes,
        refusees,
        ignorees,
      })
      setTelechargement({ enCours: false, erreur: null })
    } catch {
      setTelechargement({
        enCours: false,
        erreur: 'Le fichier n’a pas pu être préparé. Réessayez.',
      })
    }
  }

  return (
    <section className="import-resultat" aria-labelledby="import-resultat-titre">
      <div className="import-resultat__bilan">
        <h2 id="import-resultat-titre" className="import-resultat__titre">
          {pluriel(importees, 'patient importé', 'patients importés')}
        </h2>
        {importees > 0 && !interruption && <Tampon ton="primaire">Importé</Tampon>}
      </div>
      <ul className="import-resultat__compteurs">
        <li>{pluriel(importees, 'dossier créé', 'dossiers créés')} au registre</li>
        <li>{pluriel(refusees.length, 'ligne refusée', 'lignes refusées')}</li>
        <li>{pluriel(ignorees.length, 'doublon ignoré', 'doublons ignorés')}</li>
      </ul>

      {interruption && (
        <Message ton="erreur" titre={`L’import s’est arrêté au lot ${interruption.lot}`}>
          <p>{interruption.message}</p>
          <p>
            Les {importees} dossiers annoncés sont bien enregistrés. Dès le retour de la connexion,
            relancez l’import du même fichier : les dossiers déjà créés seront reconnus comme
            doublons et ignorés.
          </p>
        </Message>
      )}

      {(refusees.length > 0 || ignorees.length > 0) && (
        <div className="import-resultat__refus">
          <p>
            Téléchargez ces lignes avec leur raison, corrigez-les dans Excel, puis importez le
            fichier corrigé.
          </p>
          <div>
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={Download} />}
              chargement={telechargement.enCours}
              onClick={surTelechargement}
            >
              Télécharger les lignes refusées
            </Button>
          </div>
          {telechargement.erreur && <Message ton="erreur">{telechargement.erreur}</Message>}
        </div>
      )}

      <div className="import-resultat__actions">
        <Button variante="secondaire" onClick={onRecommencer}>
          Importer un autre fichier
        </Button>
        <Button to="/app/patients">Voir le registre</Button>
      </div>
    </section>
  )
}
