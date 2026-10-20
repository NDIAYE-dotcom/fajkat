import { useQueryClient } from '@tanstack/react-query'
import { Plus, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { marquerFavori } from '../../api.js'
import { useRechercheDiagnostics } from '../../hooks/useConsultation.js'
import { libelleDeclaration } from '../../utils.js'
import './RechercheDiagnostic.css'

// Recherche dans le catalogue (code CIM-10, nom, autres noms, fautes tolérées). Sans
// texte : favoris du soignant. Un diagnostic absent du catalogue s'ajoute en texte libre.
export default function RechercheDiagnostic({ orgId, dejaChoisis, onChoisir, desactive }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [saisie, setSaisie] = useState('')
  const [texte, setTexte] = useState('')
  const [favoriEnCours, setFavoriEnCours] = useState(null)
  const recherche = useRechercheDiagnostics(orgId, texte, !desactive)
  const resultats = recherche.data ?? []

  // Recherche lancée 250 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => setTexte(saisie.trim().length >= 2 ? saisie.trim() : ''), 250)
    return () => clearTimeout(t)
  }, [saisie])

  async function basculerFavori(r) {
    setFavoriEnCours(r.id)
    try {
      await marquerFavori(orgId, r.id, !r.is_favorite)
      await queryClient.invalidateQueries({ queryKey: ['consultations', 'diagnostics', orgId] })
    } catch (e) {
      toast.erreur('Favori non enregistré', { message: e.message })
    } finally {
      setFavoriEnCours(null)
    }
  }

  const libre = saisie.trim()
  return (
    <div className="recherche-diagnostic">
      <SearchBar
        libelle="Chercher un diagnostic"
        placeholder="Nom ou code : palu, B50.9…"
        valeur={saisie}
        onChange={setSaisie}
        onRechercher={(v) => setTexte(v.trim())}
        chargement={recherche.isFetching}
        disabled={desactive}
        dansFormulaire
      />
      {recherche.error && (
        <Message ton="erreur">
          <p>{recherche.error.message}</p>
        </Message>
      )}
      {!texte && resultats.length > 0 && <p className="recherche-diagnostic__titre">Vos favoris</p>}
      {!texte && !recherche.isPending && resultats.length === 0 && (
        <p className="recherche-diagnostic__aide">
          Tapez au moins 2 lettres. Marquez d’une étoile les diagnostics que vous posez souvent :
          ils s’afficheront ici.
        </p>
      )}
      {texte && !recherche.isFetching && resultats.length === 0 && (
        <p className="recherche-diagnostic__aide">Aucun diagnostic du catalogue ne correspond.</p>
      )}
      {resultats.length > 0 && (
        <ul className="recherche-diagnostic__resultats">
          {resultats.map((r) => {
            const choisi = dejaChoisis.includes(r.id)
            const declaration = libelleDeclaration(r.is_notifiable ? r.notification_delay : null)
            return (
              <li key={r.id} className="recherche-diagnostic__resultat">
                <button
                  type="button"
                  className="recherche-diagnostic__choix"
                  disabled={desactive || choisi}
                  onClick={() => onChoisir(r)}
                >
                  {r.code && <span className="recherche-diagnostic__code">{r.code}</span>}
                  <span className="recherche-diagnostic__libelle">{r.label}</span>
                  {choisi && <span className="recherche-diagnostic__deja">déjà ajouté</span>}
                </button>
                <span className="recherche-diagnostic__marques">
                  {declaration && (
                    <Tampon ton={r.notification_delay === 'immediate' ? 'alerte' : 'encre'}>
                      {declaration}
                    </Tampon>
                  )}
                  {r.is_sensitive && <Tampon ton="encre">Sensible</Tampon>}
                </span>
                <Button
                  variante="discret"
                  iconeDebut={
                    <Icone
                      icone={Star}
                      className={r.is_favorite ? 'recherche-diagnostic__etoile' : ''}
                    />
                  }
                  chargement={favoriEnCours === r.id}
                  disabled={desactive || (favoriEnCours !== null && favoriEnCours !== r.id)}
                  aria-pressed={r.is_favorite}
                  aria-label={`${r.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${r.label}`}
                  onClick={() => basculerFavori(r)}
                >
                  Favori
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {libre.length >= 2 && (
        <Button
          variante="discret"
          iconeDebut={<Icone icone={Plus} />}
          disabled={desactive}
          onClick={() => {
            onChoisir({ id: null, code: null, label: libre })
            setSaisie('')
          }}
        >
          {`Ajouter « ${libre.length > 60 ? `${libre.slice(0, 60)}…` : libre} » sans code`}
        </Button>
      )}
    </div>
  )
}
