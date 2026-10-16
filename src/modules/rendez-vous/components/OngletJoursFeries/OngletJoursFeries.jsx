import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { getFuseauHoraire } from '../../../../lib/format.js'
import {
  ajouterFetesFixes,
  ajouterJourFerie,
  cles,
  modifierJourFerie,
  retirerJourFerie,
} from '../../api.js'
import { useActionReglage } from '../../hooks/useActionReglage.js'
import { useJoursFeries, useModelesFeries } from '../../hooks/useParametresAgenda.js'
import { dateLongue } from '../../utils.js'
import FormulaireJourFerie from '../FormulaireJourFerie/FormulaireJourFerie.jsx'
import ListeReglages, { LigneReglage } from '../ListeReglages/ListeReglages.jsx'
import ModaleReport from '../ModaleReport/ModaleReport.jsx'
import PanneauReglages, { BlocNouveau } from '../PanneauReglages/PanneauReglages.jsx'
import './OngletJoursFeries.css'

const pad = (n) => String(n).padStart(2, '0')

// Jours fériés d'une année. Les fêtes à date variable (Korité, Tabaski, Tamkharit,
// Gamou, Magal…) sont saisies chaque année, souvent la veille : après un ajout ou un
// changement de date, les rendez-vous déjà pris ce jour-là s'affichent, prêts à reporter.
export default function OngletJoursFeries({ orgId, pays }) {
  const enLigne = useEnLigne()
  const toast = useToast()
  const [annee, setAnnee] = useState(() => dayjs().tz(getFuseauHoraire()).year())
  const feries = useJoursFeries(orgId, annee)
  const modeles = useModelesFeries(pays)
  const { agir, occupe, erreur } = useActionReglage(cles.toutesFeries(orgId))
  const [edition, setEdition] = useState(null) // id, 'nouveau'
  const [modele, setModele] = useState(null) // fête de la liste à dater
  const [retrait, setRetrait] = useState(null) // id en attente de confirmation
  const [report, setReport] = useState(null) // { date, libelle }

  const liste = feries.data ?? []
  const codesPris = new Set(liste.map((f) => f.template_code).filter(Boolean))
  const datesPrises = new Set(liste.map((f) => f.holiday_date))
  const aDater = (modeles.data ?? []).filter((m) => m.fixed_month == null && !codesPris.has(m.code))
  const fixesManquantes = (modeles.data ?? []).filter(
    (m) =>
      m.fixed_month != null &&
      !datesPrises.has(`${annee}-${pad(m.fixed_month)}-${pad(m.fixed_day)}`),
  )

  function ouvrir(cle, fete = null) {
    setModele(fete)
    setRetrait(null)
    setEdition(cle)
  }

  function changerAnnee(n) {
    setEdition(null)
    setRetrait(null)
    setAnnee(n)
  }

  // Après l'enregistrement : la liste de l'année de la date, puis les rendez-vous du jour.
  async function enregistrer(cle, action, champs, ancienneDate) {
    const { ok } = await agir(cle, action)
    if (!ok) return
    setEdition(null)
    setModele(null)
    const an = Number(champs.holiday_date.slice(0, 4))
    if (an !== annee) setAnnee(an)
    if (champs.holiday_date !== ancienneDate) {
      setReport({ date: champs.holiday_date, libelle: champs.label })
    }
  }

  async function ajouterFixes() {
    const { ok, resultat } = await agir('fixes', () => ajouterFetesFixes(orgId, annee))
    if (ok)
      toast.succes(
        `${resultat} fête${resultat > 1 ? 's' : ''} fixe${resultat > 1 ? 's' : ''} ajoutée${resultat > 1 ? 's' : ''} pour ${annee}.`,
      )
  }

  return (
    <PanneauReglages
      intro="Un rendez-vous pris un jour férié demande une confirmation explicite. La date de la Korité ou de la Tabaski n’est souvent confirmée que la veille : saisissez-la dès l’annonce, puis reportez les rendez-vous déjà pris."
      erreur={erreur}
      requetes={[feries, modeles]}
    >
      <div className="onglet-jours-feries__annee">
        <BoutonIcone
          icone={ChevronLeft}
          label={`Année ${annee - 1}`}
          onClick={() => changerAnnee(annee - 1)}
        />
        <h3 className="onglet-jours-feries__titre-annee">{annee}</h3>
        <BoutonIcone
          icone={ChevronRight}
          label={`Année ${annee + 1}`}
          onClick={() => changerAnnee(annee + 1)}
        />
      </div>

      {liste.length === 0 ? (
        <p>{`Aucun jour férié enregistré pour ${annee}.`}</p>
      ) : (
        <ListeReglages titre={`Jours fériés ${annee}`}>
          {liste.map((f) =>
            edition === f.id ? (
              <LigneReglage key={f.id}>
                <FormulaireJourFerie
                  ferie={f}
                  envoi={occupe === f.id}
                  onAnnuler={() => setEdition(null)}
                  onEnregistrer={(champs) =>
                    enregistrer(f.id, () => modifierJourFerie(f.id, champs), champs, f.holiday_date)
                  }
                />
              </LigneReglage>
            ) : (
              <LigneReglage
                key={f.id}
                texte={f.label}
                detail={dateLongue(f.holiday_date)}
                boutons={
                  retrait === f.id ? (
                    <>
                      <Button variante="discret" onClick={() => setRetrait(null)}>
                        Garder
                      </Button>
                      <Button
                        variante="secondaire"
                        chargement={occupe === `retrait-${f.id}`}
                        disabled={!enLigne}
                        onClick={() => agir(`retrait-${f.id}`, () => retirerJourFerie(f.id))}
                      >
                        Confirmer le retrait
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variante="discret"
                        onClick={() => setReport({ date: f.holiday_date, libelle: f.label })}
                      >
                        Rendez-vous ce jour
                      </Button>
                      <Button
                        variante="discret"
                        disabled={!enLigne || occupe !== null}
                        onClick={() => ouvrir(f.id)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variante="discret"
                        disabled={!enLigne || occupe !== null}
                        onClick={() => setRetrait(f.id)}
                      >
                        Retirer
                      </Button>
                    </>
                  )
                }
              />
            ),
          )}
        </ListeReglages>
      )}

      {aDater.length > 0 && (
        <ListeReglages titre={`Fêtes à dater pour ${annee}`}>
          {aDater.map((m) =>
            edition === `modele-${m.code}` ? (
              <LigneReglage key={m.code}>
                <FormulaireJourFerie
                  ferie={null}
                  modele={m}
                  envoi={occupe === `modele-${m.code}`}
                  onAnnuler={() => setEdition(null)}
                  onEnregistrer={(champs) =>
                    enregistrer(
                      `modele-${m.code}`,
                      () => ajouterJourFerie(orgId, champs),
                      champs,
                      null,
                    )
                  }
                />
              </LigneReglage>
            ) : (
              <LigneReglage
                key={m.code}
                texte={m.label}
                detail="Date variable : à saisir dès qu’elle est annoncée."
                boutons={
                  <Button
                    variante="discret"
                    disabled={!enLigne || occupe !== null}
                    onClick={() => ouvrir(`modele-${m.code}`, m)}
                  >
                    Saisir la date
                  </Button>
                }
              />
            ),
          )}
        </ListeReglages>
      )}

      {fixesManquantes.length > 0 && (
        <Button
          variante="secondaire"
          className="onglet-jours-feries__fixes"
          chargement={occupe === 'fixes'}
          disabled={!enLigne || (occupe !== null && occupe !== 'fixes')}
          onClick={ajouterFixes}
        >
          {`Ajouter les fêtes fixes de ${annee} (${fixesManquantes.length})`}
        </Button>
      )}

      <BlocNouveau
        titre="Autre jour férié"
        libelleBouton="Ajouter un autre jour férié"
        ouvert={edition === 'nouveau'}
        onOuvrir={() => ouvrir('nouveau')}
        desactive={!enLigne || occupe !== null}
      >
        <FormulaireJourFerie
          ferie={null}
          modele={modele}
          envoi={occupe === 'nouveau'}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={(champs) =>
            enregistrer('nouveau', () => ajouterJourFerie(orgId, champs), champs, null)
          }
        />
      </BlocNouveau>

      {report && (
        <ModaleReport
          orgId={orgId}
          date={report.date}
          libelle={report.libelle}
          onFermer={() => setReport(null)}
        />
      )}
    </PanneauReglages>
  )
}
