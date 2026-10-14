import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { OFFRES, prixOffreParMois } from '../../../../lib/offres.js'
import { REGIONS_SENEGAL } from '../../../../lib/regions.js'
import { chargerPaysActifs } from '../../../../lib/structures.js'
import './EtapeStructure.css'

// Sans réseau, le Sénégal reste proposé : l'inscription n'est jamais bloquée par cette liste.
const PAYS_DE_SECOURS = [{ code: 'SN', name: 'Sénégal' }]
const OPTIONS_REGIONS = REGIONS_SENEGAL.map((region) => ({ valeur: region, libelle: region }))

// Étape 2 : la structure. Le type vient du choix fait sur la page d'accueil, modifiable.
export default function EtapeStructure({
  structure,
  erreurs,
  erreurEnvoi,
  envoi,
  libelleEnvoi,
  onChange,
  onPrecedent,
  onEnvoyer,
}) {
  const pays = useQuery({
    queryKey: ['pays-actifs'],
    queryFn: chargerPaysActifs,
    staleTime: 60 * 60 * 1000,
  })
  const optionsPays = (pays.data?.length ? pays.data : PAYS_DE_SECOURS).map((p) => ({
    valeur: p.code,
    libelle: p.name,
  }))
  const texte = (champ) => (evenement) => onChange(champ, evenement.target.value)

  function surPays(evenement) {
    onChange('country_code', evenement.target.value)
    onChange('region', '')
  }

  return (
    <form className="etape-structure" noValidate onSubmit={onEnvoyer}>
      <Field label="Type de structure" groupe requis erreur={erreurs.type}>
        <div className="etape-structure__types">
          {Object.values(OFFRES).map((offre) => (
            <Radio
              key={offre.type}
              id={`ins-type-${offre.type}`}
              name="ins-type"
              value={offre.type}
              label={`${offre.nom} — ${prixOffreParMois(offre)}`}
              description={offre.choix.description}
              checked={structure.type === offre.type}
              onChange={() => onChange('type', offre.type)}
            />
          ))}
        </div>
      </Field>

      <Field
        id="ins-name"
        label="Nom de la structure"
        aide="Par exemple : Poste de santé de Dioulacolon, Clinique Les Palmiers."
        requis
        erreur={erreurs.name}
      >
        <Input autoComplete="organization" value={structure.name} onChange={texte('name')} />
      </Field>

      <div className="etape-structure__grille">
        <Field
          id="ins-country_code"
          label="Pays"
          aide={pays.isError ? 'Liste complète indisponible pour le moment.' : undefined}
          requis
          erreur={erreurs.country_code}
        >
          <Select options={optionsPays} value={structure.country_code} onChange={surPays} />
        </Field>

        <Field id="ins-region" label="Région" requis erreur={erreurs.region}>
          {structure.country_code === 'SN' ? (
            <Select
              placeholder="Choisissez la région"
              options={OPTIONS_REGIONS}
              value={structure.region}
              onChange={texte('region')}
            />
          ) : (
            <Input value={structure.region} onChange={texte('region')} />
          )}
        </Field>

        <Field
          id="ins-health_district"
          label="District sanitaire"
          aide="Par exemple : district sanitaire de Kolda."
          facultatif
        >
          <Input value={structure.health_district} onChange={texte('health_district')} />
        </Field>

        <Field id="ins-commune" label="Commune" facultatif>
          <Input value={structure.commune} onChange={texte('commune')} />
        </Field>
      </div>

      {erreurEnvoi && (
        <Message ton="erreur" titre="L’inscription n’a pas abouti">
          <p>{erreurEnvoi}</p>
        </Message>
      )}

      <div className="etape-structure__actions">
        <Button type="submit" taille="grande" chargement={envoi}>
          {libelleEnvoi}
        </Button>
        {onPrecedent && (
          <Button
            variante="discret"
            iconeDebut={<Icone icone={ArrowLeft} />}
            disabled={envoi}
            onClick={onPrecedent}
          >
            Revenir au compte
          </Button>
        )}
      </div>
    </form>
  )
}
