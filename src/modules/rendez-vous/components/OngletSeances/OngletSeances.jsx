import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { aujourdhui } from '../../agenda.js'
import { ajouterSeance, cles, compterRdvAVenirSeance, modifierSeance } from '../../api.js'
import { useActionReglage } from '../../hooks/useActionReglage.js'
import { usePraticiens, useSeances, useTypesRdv } from '../../hooks/useParametresAgenda.js'
import { heureCourte, JOURS_SEMAINE } from '../../utils.js'
import FormulaireSeance from '../FormulaireSeance/FormulaireSeance.jsx'
import ListeReglages, { BoutonsReglage, LigneReglage } from '../ListeReglages/ListeReglages.jsx'
import PanneauReglages, { BlocNouveau } from '../PanneauReglages/PanneauReglages.jsx'

// Séances de la semaine, jour par jour. Une séance pleine refuse tout nouveau rendez-vous
// (contrôlé par la base). multiPraticiens : offre Clinique (praticien de la séance).
export default function OngletSeances({ orgId, multiPraticiens }) {
  const enLigne = useEnLigne()
  const seances = useSeances(orgId)
  const types = useTypesRdv(orgId)
  const praticiens = usePraticiens(orgId, multiPraticiens)
  const { agir, occupe, erreur } = useActionReglage(cles.seances(orgId))
  const [edition, setEdition] = useState(null)
  const [retrait, setRetrait] = useState(null) // { id, nombre } : retrait à confirmer
  const typesActifs = (types.data ?? []).filter((t) => t.is_active)
  const listePraticiens = multiPraticiens ? (praticiens.data ?? []) : null
  const nomType = (id) => types.data?.find((t) => t.id === id)?.label ?? 'Type retiré'
  const nomPraticien = (id) => praticiens.data?.find((p) => p.id === id)?.nom ?? 'Praticien inactif'

  // Retirer une séance qui a des rendez-vous à venir : on prévient d'abord, avec leur
  // nombre et ce qu'ils deviennent. Remettre une séance : la base refuse un chevauchement.
  function basculer(cle, seance) {
    setRetrait(null)
    return agir(cle, async () => {
      if (seance.is_active) {
        const nombre = await compterRdvAVenirSeance(seance.id, aujourdhui())
        if (nombre > 0) return setRetrait({ id: seance.id, nombre })
      }
      return modifierSeance(seance.id, { is_active: !seance.is_active })
    })
  }

  async function enregistrer(cle, action) {
    const { ok } = await agir(cle, action)
    if (ok) setEdition(null)
  }

  const formulaire = (seance) => (
    <FormulaireSeance
      seance={seance}
      types={
        seance
          ? (types.data ?? []).filter((t) => t.is_active || t.id === seance.appointment_type_id)
          : typesActifs
      }
      praticiens={listePraticiens}
      envoi={occupe === (seance?.id ?? 'nouveau')}
      onAnnuler={() => setEdition(null)}
      onEnregistrer={(champs) =>
        seance
          ? enregistrer(seance.id, () => modifierSeance(seance.id, champs))
          : enregistrer('nouveau', () => ajouterSeance(orgId, champs))
      }
    />
  )

  const parJour = JOURS_SEMAINE.map((j) => ({
    ...j,
    liste: (seances.data ?? []).filter((s) => s.weekday === j.valeur),
  })).filter((j) => j.liste.length)

  return (
    <PanneauReglages
      intro="Une séance réserve une plage de la semaine à un type de rendez-vous, avec un nombre de places. Exemple : vaccination le mardi de 08:00 à 12:00, 40 enfants. Une séance pleine refuse le rendez-vous suivant."
      erreur={erreur}
      requetes={[seances, types, ...(multiPraticiens ? [praticiens] : [])]}
    >
      {parJour.length === 0 && edition !== 'nouveau' && (
        <p>
          Aucune séance pour l’instant : les rendez-vous se prennent alors à toute heure, sans
          limite de places.
        </p>
      )}
      {parJour.map((j) => (
        <ListeReglages key={j.valeur} titre={j.libelle}>
          {j.liste.map((s) =>
            edition === s.id ? (
              <LigneReglage key={s.id}>{formulaire(s)}</LigneReglage>
            ) : retrait?.id === s.id ? (
              <LigneReglage
                key={s.id}
                texte={`Retirer la séance de ${heureCourte(s.start_time)} – ${heureCourte(s.end_time)} · ${nomType(s.appointment_type_id)} ?`}
                detail={`Elle a ${retrait.nombre} rendez-vous à venir. Ils restent prévus à la même heure, mais ne seront plus comptés dans une séance (plus de limite de places). Pour les déplacer, reportez-les depuis l’agenda.`}
                boutons={
                  <>
                    <Button variante="discret" onClick={() => setRetrait(null)}>
                      Garder la séance
                    </Button>
                    <Button
                      variante="secondaire"
                      chargement={occupe === `retrait-${s.id}`}
                      disabled={!enLigne}
                      onClick={async () => {
                        const { ok } = await agir(`retrait-${s.id}`, () =>
                          modifierSeance(s.id, { is_active: false }),
                        )
                        if (ok) setRetrait(null)
                      }}
                    >
                      Retirer quand même
                    </Button>
                  </>
                }
              />
            ) : (
              <LigneReglage
                key={s.id}
                retire={!s.is_active}
                texte={`${heureCourte(s.start_time)} – ${heureCourte(s.end_time)} · ${nomType(s.appointment_type_id)}${s.is_active ? '' : ' (retirée)'}`}
                detail={[
                  s.capacity ? `${s.capacity} places` : 'Sans limite de places',
                  multiPraticiens &&
                    s.practitioner_membership_id &&
                    nomPraticien(s.practitioner_membership_id),
                  s.label,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                boutons={
                  <BoutonsReglage
                    id={s.id}
                    actif={s.is_active}
                    occupe={occupe}
                    enLigne={enLigne}
                    onModifier={() => setEdition(s.id)}
                    onBasculer={(cle) => basculer(cle, s)}
                  />
                }
              />
            ),
          )}
        </ListeReglages>
      ))}

      <BlocNouveau
        titre="Nouvelle séance"
        libelleBouton="Ajouter une séance"
        ouvert={edition === 'nouveau'}
        onOuvrir={() => setEdition('nouveau')}
        desactive={!enLigne || occupe !== null || typesActifs.length === 0}
      >
        {formulaire(null)}
      </BlocNouveau>
    </PanneauReglages>
  )
}
