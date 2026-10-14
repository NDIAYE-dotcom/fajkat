import './CompteurPlaces.css'

// « 4 utilisateurs actifs sur 10 · 1 invitation en attente ». max_users null = illimité.
export default function CompteurPlaces({ places }) {
  if (!places) return null
  const { max_users: max, active_members: actifs, valid_invitations: invitations } = places
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
  const plein = max != null && actifs + invitations >= max

  return (
    <p className={`compteur-places ${plein ? 'compteur-places--plein' : ''}`.trim()}>
      <span className="compteur-places__chiffre">{actifs}</span>
      {max != null ? (
        <>
          {' '}
          sur <span className="compteur-places__chiffre">{max}</span> utilisateurs actifs
        </>
      ) : (
        ` ${actifs > 1 ? 'utilisateurs actifs' : 'utilisateur actif'} (offre sans limite)`
      )}
      {invitations > 0 && ` · ${pluriel(invitations, 'invitation')} en attente`}
      {plein && ' · offre complète : désactivez un membre ou annulez une invitation'}
    </p>
  )
}
