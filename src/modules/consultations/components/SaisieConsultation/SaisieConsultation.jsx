import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import SectionCpn from '../../../maternite/components/SectionCpn/SectionCpn.jsx'
import { caseCpnDuMessage, verifierCpn } from '../../../maternite/cpn.js'
import { useCpnConsultation } from '../../../maternite/hooks/useMaternite.js'
import { useSauvegardeConsultation } from '../../hooks/useSauvegardeConsultation.js'
import { contenuConsultation } from '../../documents.js'
import { avertissementsOrdonnance, ligneVide, ordonnancePourValidation } from '../../ordonnance.js'
import { declarationsImmediates, LIMITES, verifier } from '../../utils.js'
import ConflitVersion from '../ConflitVersion/ConflitVersion.jsx'
import ConstantesPassage from '../ConstantesPassage/ConstantesPassage.jsx'
import Diagnostics from '../Diagnostics/Diagnostics.jsx'
import DocumentsConsultation from '../DocumentsConsultation/DocumentsConsultation.jsx'
import EnTeteConsultation from '../EnTeteConsultation/EnTeteConsultation.jsx'
import ExamensRapides from '../ExamensRapides/ExamensRapides.jsx'
import IndicateurEnregistrement from '../IndicateurEnregistrement/IndicateurEnregistrement.jsx'
import MiseEnPageConsultation from '../MiseEnPageConsultation/MiseEnPageConsultation.jsx'
import ModaleValidation from '../ModaleValidation/ModaleValidation.jsx'
import Ordonnance from '../Ordonnance/Ordonnance.jsx'
import SectionConsultation from '../SectionConsultation/SectionConsultation.jsx'
import './SaisieConsultation.css'

const ID = 'saisie-consultation'
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Consultation en brouillon, tenue par l'utilisateur : une seule page, sections repliables.
// Chaque frappe est gardée sur l'appareil, et envoyée au serveur toutes les 10 secondes.
// panneau(sensible) : panneau du dossier affiché à côté (antécédents).
export default function SaisieConsultation({
  panneau,
  consultation,
  patient,
  orgId,
  types,
  examens,
  references = false,
  onValidee,
  onRecharger,
}) {
  const s = useSauvegardeConsultation(consultation)
  const c = s.contenu
  const enLigne = useEnLigne()
  const [erreurs, setErreurs] = useState({})
  const [validation, setValidation] = useState(false)
  const bloque = ['conflit', 'reprise'].includes(s.etat)
  const typeId = c.encounter_type_id ?? consultation.encounter_type_id
  const type = types.find((t) => t.id === typeId)
  // Consultation prénatale : section CPN (étape 15), recopiée par la base à la validation.
  const estCpn = type?.template_code === 'cpn'
  const cpn = useCpnConsultation(consultation.id, estCpn)
  const declarations = declarationsImmediates(c)
  // Sensible d'office (type, diagnostic ou examen sensible) : la base le fera aussi au
  // prochain enregistrement, et une consultation sensible le reste.
  const sensibleAuto =
    s.sensible ||
    Boolean(type?.is_sensitive_default) ||
    c.diagnoses.some((d) => d.is_sensitive) ||
    c.tests.some((t) => examens.find((e) => e.id === t.rapid_test_type_id)?.is_sensitive)
  const sensible = sensibleAuto || c.is_sensitive
  const medicaments = c.prescription.items.filter((l) => !ligneVide(l)).length

  function maj(champ, valeur) {
    s.setContenu((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }

  function demanderValidation() {
    // Lignes d'ordonnance ajoutées puis jamais remplies : retirées avant la validation.
    if (medicaments !== c.prescription.items.length) {
      s.setContenu((p) => ({ ...p, prescription: ordonnancePourValidation(p.prescription) }))
    }
    const trouvees = verifier(c, examens)
    if (estCpn) {
      const m = verifierCpn(c.maternite)
      if (cpn.data && !cpn.data.pregnancy) {
        m.grossesse =
          'Ouvrez le suivi de grossesse avant de valider la CPN, ou changez le type de consultation.'
      }
      if (Object.keys(m).length) trouvees.maternite = m
    }
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) {
      const premier = document.querySelector(
        `#${ID} [aria-invalid='true'], #${ID} .message--erreur`,
      )
      premier?.scrollIntoView({ block: 'center' })
      if (premier?.focus) premier.focus()
      return
    }
    setValidation(true)
  }

  const champTexte = (champ, label, rows, requis = false) => (
    <Field label={label} requis={requis} erreur={erreurs[champ]}>
      <Textarea
        rows={rows}
        maxLength={LIMITES[champ]}
        value={c[champ] ?? ''}
        disabled={bloque}
        onChange={(e) => maj(champ, e.target.value)}
      />
    </Field>
  )

  return (
    <div id={ID} className="saisie-consultation">
      <EnTeteConsultation consultation={consultation} patient={patient} sensible={sensible}>
        <div className="saisie-consultation__type">
          <Field label="Type de consultation">
            <Select
              value={typeId ?? ''}
              disabled={bloque}
              options={types
                .filter((t) => t.is_active || t.id === typeId)
                .map((t) => ({ valeur: t.id, libelle: t.label }))}
              onChange={(e) => maj('encounter_type_id', e.target.value)}
            />
          </Field>
        </div>
        <IndicateurEnregistrement
          etat={s.etat}
          serveurA={s.serveurA}
          localA={s.localA}
          enLigne={enLigne}
          onReessayer={s.envoyer}
        />
      </EnTeteConsultation>

      {!enLigne && (
        <Message ton="info" titre="Pas de connexion">
          <p>
            Continuez la saisie : elle est gardée sur cet appareil et partira au retour du réseau.
          </p>
        </Message>
      )}
      {s.etat === 'conflit' && (
        <ConflitVersion
          conflit={s.conflit}
          onGarderServeur={s.garderServeur}
          onGarderLocal={s.garderLocal}
        />
      )}
      {s.etat === 'reprise' && (
        <Message
          ton="erreur"
          titre="Cette consultation n’est plus entre vos mains"
          action={<Button onClick={onRecharger}>Afficher la consultation</Button>}
        >
          <p>{s.erreur}</p>
          <p>Votre dernière saisie, non envoyée, reste sur cet appareil.</p>
        </Message>
      )}
      {declarations.length > 0 && (
        <Message
          ton="erreur"
          titre={`Maladie à déclaration immédiate : ${declarations.join(', ')}`}
        >
          <p>Validez la consultation pour déclencher l’alerte.</p>
        </Message>
      )}

      <MiseEnPageConsultation panneau={panneau?.(sensible)}>
        <SectionConsultation
          titre="Motif et histoire de la maladie"
          resume={c.reason ? `Motif : ${c.reason}` : 'Motif à saisir'}
          alerte={Boolean(erreurs.reason)}
        >
          {champTexte('reason', 'Motif de consultation', 2, true)}
          {champTexte('history', 'Histoire de la maladie', 4)}
        </SectionConsultation>

        <SectionConsultation
          titre="Constantes du passage"
          resume={
            consultation.vitals?.length ? pluriel(consultation.vitals.length, 'mesure') : 'Aucune'
          }
        >
          <ConstantesPassage
            mesures={consultation.vitals}
            avecPassage={Boolean(consultation.visit_id)}
          />
        </SectionConsultation>

        {estCpn && (
          <SectionCpn
            consultation={consultation}
            patient={patient}
            orgId={orgId}
            valeur={c.maternite}
            erreurs={erreurs.maternite}
            desactive={bloque}
            onChange={(v) => maj('maternite', v)}
          />
        )}

        <SectionConsultation titre="Examen clinique" resume={c.examination ? 'Saisi' : 'À saisir'}>
          {champTexte('examination', 'Examen clinique', 4)}
        </SectionConsultation>

        <SectionConsultation
          titre="Examens rapides"
          resume={c.tests.length ? pluriel(c.tests.length, 'examen') : 'Aucun'}
          alerte={Boolean(erreurs.tests)}
        >
          <ExamensRapides
            examens={examens}
            valeur={c.tests}
            erreurs={erreurs.tests}
            desactive={bloque}
            onChange={(v) => maj('tests', v)}
          />
        </SectionConsultation>

        <SectionConsultation
          titre="Diagnostics"
          resume={c.diagnoses.length ? pluriel(c.diagnoses.length, 'diagnostic') : 'Aucun'}
          alerte={Boolean(erreurs.diagnoses) || declarations.length > 0}
        >
          <Diagnostics
            orgId={orgId}
            valeur={c.diagnoses}
            erreur={erreurs.diagnoses}
            desactive={bloque}
            onChange={(v) => maj('diagnoses', v)}
          />
        </SectionConsultation>

        <SectionConsultation titre="Conduite à tenir" resume={c.plan ? 'Saisie' : 'À saisir'}>
          {champTexte('plan', 'Conduite à tenir', 4)}
          <Checkbox
            label="Consultation sensible"
            description={
              sensibleAuto
                ? 'Sensible d’office (type, diagnostic ou examen sensible) : elle le restera.'
                : 'Réservée aux soignants habilités ; chaque lecture est enregistrée. Une consultation sensible le reste.'
            }
            checked={sensible}
            disabled={bloque || sensibleAuto}
            onChange={(e) => maj('is_sensitive', e.target.checked)}
          />
        </SectionConsultation>

        <SectionConsultation
          titre="Ordonnance"
          resume={medicaments ? pluriel(medicaments, 'médicament') : 'Aucune'}
          alerte={Boolean(erreurs.prescription)}
        >
          <Ordonnance
            orgId={orgId}
            valeur={c.prescription}
            erreurs={erreurs.prescription}
            desactive={bloque}
            onChange={(v) => maj('prescription', v)}
          />
        </SectionConsultation>

        <DocumentsConsultation
          consultation={consultation}
          contenu={contenuConsultation(consultation, c, examens)}
          patient={patient}
          sensible={sensible}
          references={references}
        />

        <div className="saisie-consultation__pied">
          {Object.keys(erreurs).some((k) => erreurs[k]) && (
            <Message ton="erreur">
              <p>Corrigez les cases signalées avant de valider.</p>
            </Message>
          )}
          <Button onClick={demanderValidation} disabled={bloque}>
            Valider la consultation
          </Button>
        </div>
      </MiseEnPageConsultation>

      <ModaleValidation
        ouvert={validation}
        onFermer={() => setValidation(false)}
        declarations={declarations}
        avertissements={validation ? avertissementsOrdonnance(c.prescription) : []}
        enLigne={enLigne}
        onValider={async () => {
          try {
            await s.valider()
          } catch (e) {
            // Refus de la base sur une mesure de la CPN : aussi sous sa case.
            const champ = estCpn ? caseCpnDuMessage(e.message) : null
            if (champ)
              setErreurs((x) => ({ ...x, maternite: { ...x.maternite, [champ]: e.message } }))
            throw e
          }
          setValidation(false)
          onValidee()
        }}
      />
    </div>
  )
}
