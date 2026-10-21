import { Image, Text, View } from '@react-pdf/renderer'
import { formatTelephone } from '../../../lib/format.js'

// En-tête de la structure sur un document imprimé : logo, nom, adresse et téléphone,
// numéro d'autorisation, date à droite.
export default function EnTetePdf({ structure, date, s }) {
  const adresse = [structure.address, formatTelephone(structure.phone)].filter(Boolean).join(' · ')
  return (
    <View style={s.entete}>
      {structure.logo ? <Image src={structure.logo} style={s.logo} /> : null}
      <View style={s.structure}>
        <Text style={s.nomStructure}>{structure.name}</Text>
        {adresse ? <Text style={s.petit}>{adresse}</Text> : null}
        {structure.authorization_number ? (
          <Text style={s.petit}>{`Autorisation n° ${structure.authorization_number}`}</Text>
        ) : null}
      </View>
      {date ? <Text style={s.date}>{`Le ${date}`}</Text> : null}
    </View>
  )
}
