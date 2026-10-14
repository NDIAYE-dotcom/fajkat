import { ClipboardList, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import Avatar from '../../../../components/ui/Avatar/Avatar.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Drawer from '../../../../components/ui/Drawer/Drawer.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Pagination from '../../../../components/ui/Pagination/Pagination.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import Switch from '../../../../components/ui/Switch/Switch.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatFCFA, formatTelephone } from '../../../../lib/format.js'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import { REGISTRE_DU_JOUR } from '../../donnees.js'
import './RegistreDuJour.css'

const PAR_PAGE = 5

// « Ndèye » doit se trouver en tapant « ndeye » ; un numéro, avec ou sans espaces.
function normaliser(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function correspond(ligne, recherche) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
  const cible = normaliser(`${ligne.prenom} ${ligne.nom} ${ligne.quartier} ${ligne.motif}`)
  const chiffres = recherche.replace(/\D/g, '')
  if (chiffres.length >= 4 && ligne.telephone.includes(chiffres)) return true
  return mots.every((mot) => cible.includes(mot))
}

export default function RegistreDuJour() {
  const toast = useToast()
  const [recherche, setRecherche] = useState('')
  const [page, setPage] = useState(1)
  const [chargement, setChargement] = useState(false)
  const [vide, setVide] = useState(false)
  const [detail, setDetail] = useState(null)

  const lignes = useMemo(
    () => (vide ? [] : REGISTRE_DU_JOUR.filter((ligne) => correspond(ligne, recherche))),
    [vide, recherche],
  )
  const totalPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE))
  const pageCourante = Math.min(page, totalPages)
  const visibles = lignes.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE)

  const colonnes = [
    { cle: 'numero', titre: 'N°', type: 'nombre', largeur: '4rem' },
    { cle: 'heure', titre: 'Arrivée', type: 'nombre', largeur: '5rem' },
    {
      cle: 'patient',
      titre: 'Patient',
      principale: true,
      rendu: (ligne) => (
        <span className="registre-jour__patient">
          <Avatar nom={`${ligne.prenom} ${ligne.nom}`} taille="s" decoratif />
          <span>
            <button type="button" className="registre-jour__nom" onClick={() => setDetail(ligne)}>
              {ligne.prenom} {ligne.nom}
            </button>
            <span className="registre-jour__quartier">{ligne.quartier}</span>
          </span>
        </span>
      ),
    },
    { cle: 'age', titre: 'Âge', masquerMobile: true },
    { cle: 'motif', titre: 'Motif' },
    { cle: 'montant', titre: 'Montant', type: 'montant' },
    {
      cle: 'statut',
      titre: 'Statut',
      rendu: (ligne) =>
        ligne.statut ? (
          <Tampon statut={ligne.statut} />
        ) : (
          <span className="registre-jour__attente">En attente</span>
        ),
    },
  ]

  return (
    <SectionAtelier
      id="registre"
      titre="Tableau « Registre du jour »"
      intro="Recherche par nom, quartier, motif ou numéro de téléphone (accents facultatifs). Sous 640 px, chaque ligne devient une fiche. Touchez un nom pour ouvrir le détail."
    >
      <div className="registre-jour">
        <div className="registre-jour__outils">
          <SearchBar
            libelle="Rechercher dans le registre"
            placeholder="Nom, quartier, téléphone…"
            valeur={recherche}
            onChange={(valeur) => {
              setRecherche(valeur)
              setPage(1)
            }}
          />
          <div className="registre-jour__reglages">
            <Switch
              label="Simuler le chargement"
              checked={chargement}
              onChange={(e) => setChargement(e.target.checked)}
            />
            <Switch
              label="Registre vide"
              checked={vide}
              onChange={(e) => setVide(e.target.checked)}
            />
          </div>
        </div>

        <Table
          legende="Registre du jour, 14/10/2026"
          legendeVisible
          colonnes={colonnes}
          lignes={visibles}
          chargement={chargement}
          vide={
            <EmptyState
              icone={ClipboardList}
              titre={recherche ? 'Aucun patient ne correspond' : 'Aucun passage aujourd’hui'}
              texte={
                recherche
                  ? 'Essayez le prénom de la mère, le quartier ou le numéro de téléphone.'
                  : 'Les patients enregistrés à l’accueil apparaîtront ici.'
              }
            />
          }
        />

        {lignes.length > PAR_PAGE && !chargement && (
          <Pagination
            libelle="Pages du registre"
            page={pageCourante}
            totalPages={totalPages}
            total={lignes.length}
            parPage={PAR_PAGE}
            onChange={setPage}
          />
        )}
      </div>

      <Drawer
        ouvert={detail !== null}
        onFermer={() => setDetail(null)}
        titre={detail ? `${detail.prenom} ${detail.nom}` : ''}
        actions={
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Printer} />}
            onClick={() => toast.info('Ticket envoyé à l’imprimante (démonstration)')}
          >
            Imprimer le ticket
          </Button>
        }
      >
        {detail && (
          <dl className="registre-jour__fiche">
            <dt>Ticket</dt>
            <dd className="registre-jour__chiffres">
              n° {detail.numero}, arrivé(e) à {detail.heure}
            </dd>
            <dt>Âge</dt>
            <dd>{detail.age}</dd>
            <dt>Quartier</dt>
            <dd>{detail.quartier}</dd>
            <dt>Téléphone</dt>
            <dd className="registre-jour__chiffres">{formatTelephone(detail.telephone)}</dd>
            <dt>Motif</dt>
            <dd>{detail.motif}</dd>
            <dt>Montant</dt>
            <dd className="registre-jour__chiffres">{formatFCFA(detail.montant)}</dd>
          </dl>
        )}
      </Drawer>
    </SectionAtelier>
  )
}
