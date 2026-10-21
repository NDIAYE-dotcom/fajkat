// Lettre de référence imprimée, A4, en PDF, chargée à la demande. Mise en page provisoire :
// définitive à l'étape 21, vraie signature à l'étape 22.
//
// La lettre se plie en trois, en accordéon : la bande du haut (premier tiers) reste visible.
//   - consultation ordinaire : en-tête de la structure, titre, destination et patient ;
//   - consultation sensible : « Pli confidentiel — à remettre au soignant », destination
//     et nom du patient, rien d'autre (ni structure, ni urgence, ni motif) ; tout le reste
//     est sous le pli.
// En bas : coupon de contre-référence, à remplir par la structure d'accueil et à rapporter.
// Jamais le type de consultation ni le service.

import { Document, Page, Text, View } from '@react-pdf/renderer'
import EnTetePdf from './EnTetePdf.jsx'
import { TIERS_A4 } from './stylesDocuments.js'

const FORMAT = { size: 'A4' }

function Rubrique({ titre, texte, s }) {
  if (!texte?.trim()) return null
  return (
    <View style={s.rubrique}>
      <Text style={s.titreRubrique}>{titre}</Text>
      <Text style={s.texte}>{texte}</Text>
    </View>
  )
}

function ChampCoupon({ libelle, haut = false, moitie = false, s }) {
  return (
    <View
      style={[s.champCoupon, haut ? s.champCouponHaut : {}, moitie ? s.champMoitie : {}]}
      wrap={false}
    >
      <Text style={s.petit}>{`${libelle} :`}</Text>
    </View>
  )
}

// Repères des deux plis : trait sur toute la largeur sous la bande, petits traits dans les
// marges pour le second (il traverse le texte).
function Plis({ s }) {
  return (
    <>
      <View style={[s.pli, { top: TIERS_A4 }]} />
      <Text style={[s.mentionPli, { top: TIERS_A4 + 2 }]}>Pliez ici</Text>
      <View style={[s.pliMarge, { top: TIERS_A4 * 2, left: 0 }]} />
      <View style={[s.pliMarge, { top: TIERS_A4 * 2, right: 0 }]} />
    </>
  )
}

function EnTeteLettre({ d, s }) {
  const r = d.reference
  return (
    <>
      <EnTetePdf structure={d.structure} date={d.date} s={s} />
      <Text style={s.titre}>LETTRE DE RÉFÉRENCE</Text>
      {r.urgency === 'urgent' ? <Text style={s.urgent}>URGENT</Text> : null}
    </>
  )
}

function Adresse({ d, s }) {
  return (
    <View style={s.adresse}>
      <Text style={s.ligneAdresse}>
        <Text style={s.gras}>À : </Text>
        {d.reference.destination_name}
      </Text>
      <Text style={s.ligneAdresse}>
        <Text style={s.gras}>Patient : </Text>
        {d.patient.nom}
      </Text>
    </View>
  )
}

export default function DocumentReference({ d, s }) {
  const r = d.reference
  const destination = [r.destination_name, r.destination_address, d.destinationTelephone]
    .filter(Boolean)
    .join(' · ')
  const patient = [d.patient.nom, d.patient.age, d.patient.sexe, d.patient.numero]
    .filter(Boolean)
    .join(' · ')
  return (
    <Document
      title="Lettre de référence"
      author={d.structure.name}
      creator="Fajkat"
      producer="Fajkat"
    >
      <Page {...FORMAT} style={s.page}>
        <Plis s={s} />
        <View style={s.bande}>
          {d.sensible ? (
            <Text style={s.confidentiel}>PLI CONFIDENTIEL — À REMETTRE AU SOIGNANT</Text>
          ) : (
            <EnTeteLettre d={d} s={s} />
          )}
          <Adresse d={d} s={s} />
        </View>

        <View style={s.corps}>
          {d.sensible ? <EnTeteLettre d={d} s={s} /> : null}
          <View style={s.rubrique}>
            <Text style={s.texte}>
              <Text style={s.gras}>Patient : </Text>
              {patient}
            </Text>
            <Text style={s.texte}>
              <Text style={s.gras}>Référé vers : </Text>
              {destination}
            </Text>
            <Text style={s.texte}>
              <Text style={s.gras}>Le : </Text>
              {d.dateHeure}
            </Text>
          </View>
          <Rubrique titre="Motif de la référence" texte={r.reason} s={s} />
          <Rubrique titre="Résumé clinique" texte={r.summary} s={s} />
          <Rubrique titre="Traitements reçus" texte={r.treatments_given} s={s} />

          <View style={s.signature} wrap={false}>
            <Text style={s.petit}>Signature et cachet</Text>
            <Text style={s.petit}>{r.referrer_name}</Text>
            {r.referrer_title ? <Text style={s.petit}>{r.referrer_title}</Text> : null}
          </View>
        </View>

        <View style={s.coupon} wrap={false}>
          <Text style={s.titreCoupon}>CONTRE-RÉFÉRENCE</Text>
          <Text style={s.petit}>
            {`À remplir par la structure d’accueil et à rapporter à : ${d.structure.name}.`}
          </Text>
          <Text style={s.petit}>{`Patient : ${d.patient.nom} · référé le ${d.date}`}</Text>
          <View style={s.ligneCoupon}>
            <ChampCoupon libelle="Date" moitie s={s} />
            <ChampCoupon libelle="Structure" moitie s={s} />
          </View>
          <ChampCoupon libelle="Diagnostic retenu" haut s={s} />
          <ChampCoupon libelle="Traitement" haut s={s} />
          <ChampCoupon libelle="Conduite à tenir" haut s={s} />
          <View style={s.ligneCoupon}>
            <ChampCoupon libelle="Suivi" moitie s={s} />
            <ChampCoupon libelle="Nom, qualité et signature" moitie s={s} />
          </View>
        </View>

        <Text
          style={s.pied}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : ''
          }
        />
      </Page>
    </Document>
  )
}
