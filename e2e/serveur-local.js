// Serveur local des tests de bout en bout, à l'adresse que l'application prend pour
// Supabase (VITE_SUPABASE_URL = http://localhost:54321) :
//   /rest/v1/*     -> PostgREST (binaire indiqué par E2E_POSTGREST), sur la base fajkat_e2e ;
//   /auth/v1/*     -> connexion simulée : comptes de e2e/comptes.js, jetons signés avec la
//                     clé locale SECRET_JWT (PostgREST la vérifie) ;
//   /realtime/v1/* -> WebSocket minimal qui accepte les abonnements ; il diffuse seulement
//                     les nouvelles notifications (postgres_changes, INSERT) à leur
//                     destinataire, lues dans la base toutes les 700 ms.
// Local seulement : jamais fajkat-dev ni la production.
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { COMPTES, MOT_DE_PASSE, PORTS, SECRET_JWT } from './comptes.js'
import { jeton } from './jetons.js'

function utilisateur(compte) {
  return {
    id: compte.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: compte.email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: compte.nom },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function session(compte) {
  return {
    access_token: jeton(compte),
    token_type: 'bearer',
    expires_in: 8 * 3600,
    expires_at: Math.floor(Date.now() / 1000) + 8 * 3600,
    refresh_token: `r.${compte.id}`,
    user: utilisateur(compte),
  }
}

const parId = (id) => Object.values(COMPTES).find((c) => c.id === id)
const parEmail = (email) => Object.values(COMPTES).find((c) => c.email === email)
function depuisJeton(entete) {
  try {
    const charge = JSON.parse(Buffer.from((entete ?? '').split('.')[1], 'base64url').toString())
    return parId(charge.sub)
  } catch {
    return null
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
  'access-control-expose-headers': 'content-range, content-profile, x-client-info',
}

function json(res, statut, corps) {
  res.writeHead(statut, { ...CORS, 'content-type': 'application/json' })
  res.end(corps === undefined ? '' : JSON.stringify(corps))
}

const lireCorps = (req) =>
  new Promise((ok) => {
    const morceaux = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => ok(Buffer.concat(morceaux)))
  })

async function auth(req, res, url) {
  const corps = await lireCorps(req)
  const chemin = url.pathname.replace('/auth/v1', '')
  if (chemin === '/token') {
    const donnees = corps.length ? JSON.parse(corps) : {}
    const compte =
      url.searchParams.get('grant_type') === 'refresh_token'
        ? parId(String(donnees.refresh_token ?? '').slice(2))
        : donnees.password === MOT_DE_PASSE && parEmail(donnees.email)
    if (!compte) {
      return json(res, 400, {
        code: 'invalid_credentials',
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials',
      })
    }
    return json(res, 200, session(compte))
  }
  if (chemin === '/user') {
    const compte = depuisJeton(req.headers.authorization?.replace(/^Bearer /i, ''))
    return compte ? json(res, 200, utilisateur(compte)) : json(res, 401, { msg: 'Jeton invalide' })
  }
  if (chemin === '/logout') return json(res, 204)
  return json(res, 404, { msg: `Point d'accès simulé absent : ${chemin}` })
}

function rest(req, res, url) {
  const entetes = { ...req.headers, host: `localhost:${PORTS.postgrest}` }
  delete entetes.origin
  const amont = http.request(
    {
      host: '127.0.0.1',
      port: PORTS.postgrest,
      method: req.method,
      path: url.pathname.replace('/rest/v1', '') + url.search,
      headers: entetes,
    },
    (reponse) => {
      const sortie = { ...reponse.headers, ...CORS }
      delete sortie['access-control-allow-credentials']
      res.writeHead(reponse.statusCode, sortie)
      reponse.pipe(res)
    },
  )
  amont.on('error', (e) => json(res, 502, { message: `PostgREST injoignable : ${e.message}` }))
  req.pipe(amont)
}

// --- WebSocket minimal (protocole Phoenix de Realtime) ----------------------------------
function trame(texte) {
  const donnees = Buffer.from(texte)
  const tete =
    donnees.length < 126
      ? Buffer.from([0x81, donnees.length])
      : Buffer.from([0x81, 126, donnees.length >> 8, donnees.length & 255])
  return Buffer.concat([tete, donnees])
}

function lireTrames(tampon) {
  const messages = []
  let i = 0
  while (tampon.length - i >= 2) {
    const code = tampon[i] & 0x0f
    let long = tampon[i + 1] & 0x7f
    let pos = i + 2
    if (long === 126) {
      long = tampon.readUInt16BE(pos)
      pos += 2
    } else if (long === 127) {
      long = Number(tampon.readBigUInt64BE(pos))
      pos += 8
    }
    const masque = tampon.subarray(pos, pos + 4)
    pos += 4
    if (tampon.length < pos + long) break
    const charge = Buffer.from(tampon.subarray(pos, pos + long)).map((o, k) => o ^ masque[k % 4])
    messages.push({ code, texte: charge.toString() })
    i = pos + long
  }
  return { messages, reste: tampon.subarray(i) }
}

function websocket(req, socket) {
  const accepte = createHash('sha1')
    .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accepte}\r\n\r\n`,
  )
  let tampon = Buffer.alloc(0)
  socket.on('data', (morceau) => {
    const { messages, reste } = lireTrames(Buffer.concat([tampon, morceau]))
    tampon = reste
    for (const { code, texte } of messages) {
      if (code === 8) return socket.end()
      if (code !== 1) continue
      const m = JSON.parse(texte)
      // realtime-js : [join_ref, ref, topic, event, payload] (v2) ou objet (v1).
      const v2 = Array.isArray(m)
      const [joinRef, ref, topic, event, payload] = v2
        ? m
        : [m.join_ref, m.ref, m.topic, m.event, m.payload]
      const changes = event === 'phx_join' ? (payload?.config?.postgres_changes ?? []) : []
      changes.forEach((c, k) => {
        const destinataire = /^recipient_user_id=eq\.(.+)$/.exec(c.filter ?? '')?.[1]
        if (c.table === 'notifications' && destinataire) {
          abonnes.push({ socket, topic, id: k + 1, destinataire, v2 })
        }
      })
      const reponse =
        event === 'phx_join'
          ? { postgres_changes: changes.map((c, k) => ({ ...c, id: k + 1 })) }
          : {}
      const retour = { status: 'ok', response: reponse }
      socket.write(
        trame(
          JSON.stringify(
            v2
              ? [joinRef, ref, topic, 'phx_reply', retour]
              : { topic, event: 'phx_reply', payload: retour, ref, join_ref: joinRef },
          ),
        ),
      )
    }
  })
  socket.on('error', () => {})
  socket.on('close', () => {
    for (let i = abonnes.length - 1; i >= 0; i -= 1)
      if (abonnes[i].socket === socket) abonnes.splice(i, 1)
  })
}

// Abonnés aux notifications : { socket, topic, id, destinataire, v2 }.
const abonnes = []
let repere = null // created_at de la dernière notification diffusée (horloge de la base)

function lireBase(sql) {
  return new Promise((ok) =>
    execFile('psql', ['-U', 'postgres', '-d', 'fajkat_e2e', '-At', '-c', sql], (e, sortie) =>
      ok(e ? null : sortie),
    ),
  )
}

// Nouvelles notifications depuis le dernier passage, envoyées à leur seul destinataire
// (le vrai Realtime applique en plus les policies RLS de la table).
async function diffuser() {
  if (repere === null) {
    repere = (await lireBase('select now()'))?.trim() ?? null
    return
  }
  const sortie = await lireBase(
    `select row_to_json(n) from public.notifications n where created_at > '${repere}' order by created_at`,
  )
  for (const ligne of (sortie ?? '').split('\n').filter(Boolean)) {
    const n = JSON.parse(ligne)
    repere = n.created_at
    for (const a of abonnes.filter((x) => x.destinataire === n.recipient_user_id)) {
      const charge = {
        ids: [a.id],
        data: {
          schema: 'public',
          table: 'notifications',
          commit_timestamp: n.created_at,
          type: 'INSERT',
          columns: [],
          record: n,
          errors: null,
        },
      }
      a.socket.write(
        trame(
          JSON.stringify(
            a.v2
              ? [null, null, a.topic, 'postgres_changes', charge]
              : { topic: a.topic, event: 'postgres_changes', payload: charge, ref: null },
          ),
        ),
      )
    }
  }
}
setInterval(diffuser, 700)

// --- Lancement ----------------------------------------------------------------------------
const binaire = process.env.E2E_POSTGREST
if (!binaire) throw new Error('Indiquez le binaire PostgREST : E2E_POSTGREST=/chemin/postgrest')
const hote = process.env.PGHOST ?? 'localhost'
const postgrest = spawn(binaire, [], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://authenticator@/fajkat_e2e?host=${encodeURIComponent(hote)}&port=${process.env.PGPORT ?? 5432}`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: SECRET_JWT,
    PGRST_SERVER_PORT: String(PORTS.postgrest),
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_LOG_LEVEL: 'error',
  },
})
process.on('exit', () => postgrest.kill())
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTS.api}`)
  if (req.method === 'OPTIONS') return json(res, 204)
  if (url.pathname.startsWith('/auth/v1')) return auth(req, res, url)
  if (url.pathname.startsWith('/rest/v1')) return rest(req, res, url)
  if (url.pathname === '/') return json(res, 200, { ok: true })
  return json(res, 404, { message: `Service non simulé : ${url.pathname}` })
})
serveur.on('upgrade', (req, socket) => websocket(req, socket))
serveur.listen(PORTS.api, () => console.log(`API locale prête sur http://localhost:${PORTS.api}`))
