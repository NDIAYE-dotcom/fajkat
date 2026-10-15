import { Download, FileSpreadsheet } from 'lucide-react'
import { useId, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { telechargerModele } from '../../import/fichiers.js'
import './ImportFichier.css'

// Étape 1 : modèle à télécharger, puis choix du fichier (.xlsx ou .csv). Le fichier est lu
// et vérifié sur l'appareil ; seuls les critères de doublon partent vers le serveur.
export default function ImportFichier({ lecture, onChoisir }) {
  const id = useId()
  const [modele, setModele] = useState({ enCours: false, erreur: null })

  async function surModele() {
    setModele({ enCours: true, erreur: null })
    try {
      await telechargerModele()
      setModele({ enCours: false, erreur: null })
    } catch {
      setModele({ enCours: false, erreur: 'Le modèle n’a pas pu être préparé. Réessayez.' })
    }
  }

  function surChoix(evenement) {
    const fichier = evenement.target.files?.[0]
    // Vider le champ : choisir de nouveau le même fichier (corrigé) relance la lecture.
    evenement.target.value = ''
    if (fichier) onChoisir(fichier)
  }

  return (
    <div className="import-fichier">
      <section className="import-fichier__panneau" aria-labelledby={`${id}-modele`}>
        <h2 id={`${id}-modele`} className="import-fichier__titre">
          1. Partez du modèle
        </h2>
        <p>
          Une ligne par patient. Nom, prénom, sexe, et date de naissance ou âge déclaré sont
          obligatoires. La feuille « Consignes » explique chaque colonne.
        </p>
        <p className="import-fichier__doux">
          Votre fichier a déjà ses colonnes ? Gardez-le : « Nom », « Prénom », « Sexe », « Date de
          naissance », « Téléphone »… sont reconnus.
        </p>
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Download} />}
            chargement={modele.enCours}
            onClick={surModele}
          >
            Télécharger le modèle Excel
          </Button>
        </div>
        {modele.erreur && <Message ton="erreur">{modele.erreur}</Message>}
      </section>

      <section className="import-fichier__panneau" aria-labelledby={`${id}-choix`}>
        <h2 id={`${id}-choix`} className="import-fichier__titre">
          2. Choisissez votre fichier
        </h2>
        <label
          className={`import-fichier__zone${lecture.enCours ? ' import-fichier__zone--occupee' : ''}`}
        >
          <input
            type="file"
            className="import-fichier__champ"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={lecture.enCours}
            onChange={surChoix}
            aria-describedby={`${id}-formats`}
          />
          {lecture.enCours ? (
            <Spinner taille={28} />
          ) : (
            <Icone icone={FileSpreadsheet} className="import-fichier__icone" />
          )}
          <span className="import-fichier__action">
            {lecture.enCours ? 'Lecture et vérification du fichier…' : 'Choisir un fichier'}
          </span>
          <span id={`${id}-formats`} className="import-fichier__doux">
            Excel (.xlsx) ou CSV (.csv), 5 000 lignes et 5 Mo au plus.
          </span>
        </label>
        <p className="import-fichier__doux">
          Rien n’est enregistré à cette étape : vous verrez d’abord l’aperçu.
        </p>
        {lecture.erreur && (
          <Message ton="erreur" titre="Le fichier n’a pas pu être lu">
            <p>{lecture.erreur}</p>
          </Message>
        )}
      </section>
    </div>
  )
}
