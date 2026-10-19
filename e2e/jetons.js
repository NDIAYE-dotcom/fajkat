// Jetons de test signés avec la clé locale (HS256), vérifiés par PostgREST.
import { createHmac } from 'node:crypto'
import { SECRET_JWT } from './comptes.js'

const b64 = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url')

export function jeton(compte, role = 'authenticated') {
  const maintenant = Math.floor(Date.now() / 1000)
  const corps =
    b64({ alg: 'HS256', typ: 'JWT' }) +
    '.' +
    b64({
      sub: compte?.id,
      role,
      aud: 'authenticated',
      email: compte?.email,
      iat: maintenant,
      exp: maintenant + 8 * 3600,
    })
  return corps + '.' + createHmac('sha256', SECRET_JWT).update(corps).digest('base64url')
}

// Clé « anon » de l'application pendant les tests (VITE_SUPABASE_ANON_KEY).
export const CLE_ANON = jeton(null, 'anon')
