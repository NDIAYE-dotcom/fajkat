// Ordonnance imprimée, A5, en PDF (@react-pdf/renderer). Ce fichier n'est chargé qu'au
// moment d'imprimer (import dynamique) : la bibliothèque reste hors des pages courantes.
// Mise en page provisoire : définitive à l'étape 21, vraie signature à l'étape 22.
//
// Règles :
//   - jamais de diagnostic, de type de consultation ni de service : en-tête de la
//     structure, patient (nom, âge), date, praticien, médicaments, signature ;
//   - noir et blanc, traits pleins ou pointillés, aucun gris clair : lisible après
//     photocopie ;
//   - pour chaque médicament, les quatre prises au trait (pictogrammes.js) avec la quantité
//     en gros chiffres (IBM Plex Mono) ; durée et consignes en phrases courtes.
// Le PDF ne lit pas les feuilles de style : l'encre vient du jeton --impression-encre.

import { Circle, Document, Font, Image, Page, Path, Svg, Text, View } from '@react-pdf/renderer'
import atkinson400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff?url'
import atkinson700 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff?url'
import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff?url'
import spectral600 from '@fontsource/spectral/files/spectral-latin-600-normal.woff?url'
import { formatTelephone } from '../../../lib/format.js'
import { formatDose, phraseDuree, phraseQuantite, PRISES, resumeProduit } from '../ordonnance.js'
import { PICTOGRAMMES } from '../pictogrammes.js'

Font.register({
  family: 'Atkinson',
  fonts: [{ src: atkinson400 }, { src: atkinson700, fontWeight: 700 }],
})
Font.register({ family: 'Plex', src: plex600 })
Font.register({ family: 'Spectral', src: spectral600 })
// Aucun mot coupé en fin de ligne.
Font.registerHyphenationCallback((mot) => [mot])

// Trait des pictogrammes, passé en objet : strokeWidth est ici un attribut SVG du PDF, pas
// celui d'une icône lucide (règle ESLint des icônes).
const TRAIT = { strokeWidth: 1.75 }
// Format de la page, passé en objet pour la même raison (attribut « size »).
const FORMAT = { size: 'A5' }

function Pictogramme({ prise, encre }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      {PICTOGRAMMES[prise].map((e, i) =>
        e.cercle ? (
          <Circle key={i} {...e.cercle} {...TRAIT} stroke={encre} fill="none" />
        ) : (
          <Path
            key={i}
            d={e.d}
            {...TRAIT}
            stroke={encre}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ),
      )}
    </Svg>
  )
}

function Medicament({ l, numero, voies, libelles, s, encre }) {
  const detail = resumeProduit({ ...l, dosage: null }, voies)
  const avecPrises = PRISES.some((p) => Number(l[p.champ]))
  const phrases = [phraseDuree(l), phraseQuantite(l)].filter(Boolean).join(' ')
  return (
    <View style={s.ligne} wrap={false}>
      <Text style={s.nomMedicament}>
        {`${numero}. ${l.product_name}${l.dosage ? ` ${l.dosage}` : ''}`}
      </Text>
      {detail ? <Text style={s.petit}>{detail}</Text> : null}
      {avecPrises && (
        <View style={s.prises}>
          {PRISES.map((p) => {
            const n = Number(l[p.champ]) || 0
            return (
              <View key={p.cle} style={n ? s.prise : [s.prise, s.priseVide]}>
                <Pictogramme prise={p.cle} encre={encre} />
                <Text style={s.libellePrise}>{libelles[p.cle]}</Text>
                <Text style={s.dose}>{formatDose(n) || '0'}</Text>
                {n && l.dose_unit ? <Text style={s.unite}>{l.dose_unit}</Text> : null}
              </View>
            )
          })}
        </View>
      )}
      {phrases ? <Text style={s.phrase}>{phrases}</Text> : null}
      {l.instructions ? <Text style={s.phrase}>{l.instructions}</Text> : null}
    </View>
  )
}

export default function DocumentOrdonnance({ d, s, encre }) {
  const { structure, patient, ordonnance, voies, libelles } = d
  const adresse = [structure.address, formatTelephone(structure.phone)].filter(Boolean).join(' · ')
  return (
    <Document title="Ordonnance" author={structure.name} creator="Fajkat" producer="Fajkat">
      <Page {...FORMAT} style={s.page}>
        <View style={s.entete} fixed>
          {structure.logo ? <Image src={structure.logo} style={s.logo} /> : null}
          <View style={s.structure}>
            <Text style={s.nomStructure}>{structure.name}</Text>
            {adresse ? <Text style={s.petit}>{adresse}</Text> : null}
            {structure.authorization_number ? (
              <Text style={s.petit}>{`Autorisation n° ${structure.authorization_number}`}</Text>
            ) : null}
          </View>
          <Text style={s.date}>{`Le ${d.date}`}</Text>
        </View>

        <Text style={s.titre}>ORDONNANCE</Text>
        <View style={s.personnes}>
          <Text>
            <Text style={s.gras}>Patient : </Text>
            {[patient.nom, patient.age].filter(Boolean).join(' · ')}
          </Text>
          <Text>
            <Text style={s.gras}>Praticien : </Text>
            {ordonnance.prescriber_name}
          </Text>
        </View>

        {ordonnance.items.map((l, i) => (
          <Medicament
            key={l.id ?? i}
            l={l}
            numero={i + 1}
            voies={voies}
            libelles={libelles}
            s={s}
            encre={encre}
          />
        ))}

        {ordonnance.note ? <Text style={s.note}>{ordonnance.note}</Text> : null}

        <View style={s.signature} wrap={false}>
          <Text style={s.petit}>Signature et cachet</Text>
          <Text style={s.petit}>{ordonnance.prescriber_name}</Text>
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
