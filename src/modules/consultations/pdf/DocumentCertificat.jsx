// Certificat imprimé, A5, en PDF, chargé à la demande. Mise en page provisoire : définitive
// à l'étape 21, signature et QR de vérification à l'étape 22.
// Le texte imprimé est celui relu et émis par le soignant, tel quel : jamais de diagnostic
// ajouté, jamais le type de consultation ni le service.

import { Document, Page, Text, View } from '@react-pdf/renderer'
import EnTetePdf from './EnTetePdf.jsx'

const FORMAT = { size: 'A5' }

export default function DocumentCertificat({ d, s }) {
  const c = d.certificat
  const paragraphes = c.body.split(/\n\s*\n/).filter((p) => p.trim())
  return (
    <Document title={c.title} author={d.structure.name} creator="Fajkat" producer="Fajkat">
      <Page {...FORMAT} style={s.page}>
        <EnTetePdf structure={d.structure} date={d.date} s={s} />
        <Text style={s.titre}>{c.title.toLocaleUpperCase('fr')}</Text>
        {/* Chiffres en IBM Plex Mono ; les lettres restent en Atkinson (la police mono
            embarquée ne sert qu'aux chiffres). */}
        <Text style={s.numero}>
          {`N° ${c.number.replace(/\d[\d-]*$/, '')}`}
          <Text style={s.chiffres}>{c.number.match(/\d[\d-]*$/)?.[0] ?? ''}</Text>
        </Text>
        <View style={s.corps}>
          {paragraphes.map((p, i) => (
            <Text key={i} style={s.paragraphe}>
              {p.trim()}
            </Text>
          ))}
        </View>
        <View style={s.signature} wrap={false}>
          <Text style={s.petit}>{`Fait le ${d.date}`}</Text>
          <Text style={s.petit}>Signature et cachet</Text>
          <Text style={s.petit}>{c.issuer_name}</Text>
          {c.issuer_title ? <Text style={s.petit}>{c.issuer_title}</Text> : null}
        </View>
        <Text
          style={s.pied}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Certificat n° ${c.number}${totalPages > 1 ? ` · page ${pageNumber} / ${totalPages}` : ''}`
          }
        />
      </Page>
    </Document>
  )
}
