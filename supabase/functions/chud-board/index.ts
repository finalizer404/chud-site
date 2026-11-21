// /chud/ live board: the only way to write a post. Anonymous, no accounts.
//   POST { action: "post", thread?, subject?, name?, body, ts, nonce, hp }   -> { post }
//   POST { action: "delete", admin, id }                                      -> { ok }      (hides one post)
//   POST { action: "ban",    admin, id, reason? }                             -> { ok, hidden } (bans its poster, hides their posts)
// Protections: a per-IP rate limit, a cap on new threads, a duplicate check, a ban list, a small proof-of-work the
// browser solves before each post (bots must pay CPU for every post), a honeypot field, and length limits.
// Secrets (supabase secrets set ...): CHUD_SALT (any long random text), CHUD_ADMIN_KEY (the moderators' password),
// CHUD_ORIGINS (optional, comma list of allowed sites, e.g. https://chudworldorder.com).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SALT = Deno.env.get('CHUD_SALT') ?? ''
const ADMIN = Deno.env.get('CHUD_ADMIN_KEY') ?? ''
const ORIGINS = (Deno.env.get('CHUD_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const POW_BITS = 16            // the browser needs about 65,000 hashes per post (1-3 s)
const REPLY_GAP_S = 30         // one post per 30 s per IP
const THREADS_PER_HOUR = 3     // new threads per IP per hour
const POSTS_PER_DAY = 200      // per IP

function cors(req: Request) {
  const o = req.headers.get('origin') ?? ''
  const allow = !ORIGINS.length ? '*' : ORIGINS.includes(o) ? o : ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
function leadingZeroBits(h: string) { let n = 0; for (const c of h) { const v = parseInt(c, 16); if (v === 0) { n += 4; continue } n += Math.clz32(v) - 28; break } return n }
function same(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return out({ error: 'POST only' }, 405)
  if (!SALT) return out({ error: 'the board is not set up yet (CHUD_SALT)' }, 503)
  let b: Record<string, unknown>
  try { const t = await req.text(); if (t.length > 8000) return out({ error: 'too long' }, 413); b = JSON.parse(t) } catch { return out({ error: 'bad request' }, 400) }

  // ── moderators ──
  if (b.action === 'delete' || b.action === 'ban') {
    if (!ADMIN || !same(String(b.admin ?? ''), ADMIN)) return out({ error: 'wrong key' }, 403)
    const id = Number(b.id); if (!Number.isInteger(id)) return out({ error: 'no post' }, 400)
    const { data: p } = await db.from('chud_posts').select('id, ip_hash, thread').eq('id', id).maybeSingle()
    if (!p) return out({ error: 'no such post' }, 404)
    if (b.action === 'delete') {
      await db.from('chud_posts').update({ hidden: true }).eq('id', id)
      if (p.thread === null) await db.from('chud_posts').update({ hidden: true }).eq('thread', 'u' + id)   // a thread goes with its replies
      return out({ ok: true })
    }
    await db.from('chud_bans').upsert({ ip_hash: p.ip_hash, reason: clean(b.reason, 200) || null })
    const { count } = await db.from('chud_posts').update({ hidden: true }, { count: 'exact' }).eq('ip_hash', p.ip_hash).eq('hidden', false)
    return out({ ok: true, hidden: count ?? 0 })
  }
  if (b.action !== 'post') return out({ error: 'unknown action' }, 400)

  // ── a post ──
  if (clean(b.hp, 10)) return out({ error: 'no' }, 400)                                    // the honeypot field must stay empty
  const body = clean(b.body, 2000), name = clean(b.name, 40) || 'Anonymous'
  const thread = b.thread === undefined || b.thread === null || b.thread === '' ? null : String(b.thread)
  const subject = thread === null ? clean(b.subject, 100) : ''
  if (!body) return out({ error: 'write something' }, 400)
  if (thread === null && subject.length < 3) return out({ error: 'a new thread needs a subject' }, 400)
  if (thread !== null && !/^[a-z0-9_-]{1,40}$/i.test(thread)) return out({ error: 'bad thread' }, 400)

  // proof of work: sha256(ts:body:nonce) must start with POW_BITS zero bits, and ts must be fresh
  const ts = Number(b.ts)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 3 * 60_000) return out({ error: 'your clock is off, or the form is stale: reload' }, 400)
  if (leadingZeroBits(await sha(`${ts}:${body}:${String(b.nonce ?? '')}`)) < POW_BITS) return out({ error: 'post check failed: reload and try again' }, 400)

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const ip_hash = await sha(`${SALT}:${ip}`)
  const { data: ban } = await db.from('chud_bans').select('ip_hash').eq('ip_hash', ip_hash).maybeSingle()
  if (ban) return out({ error: 'you are banned from posting' }, 403)

  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const { data: recent } = await db.from('chud_posts').select('id, body, thread, created_at').eq('ip_hash', ip_hash).gte('created_at', since(24 * 3600_000)).order('id', { ascending: false }).limit(POSTS_PER_DAY)
  const mine = recent ?? []
  if (mine.length >= POSTS_PER_DAY) return out({ error: 'daily limit reached' }, 429)
  if (mine[0] && Date.now() - Date.parse(mine[0].created_at) < REPLY_GAP_S * 1000) return out({ error: `slow down anon. ${REPLY_GAP_S}s between posts.` }, 429)
  if (mine.some((m) => m.body === body && Date.now() - Date.parse(m.created_at) < 10 * 60_000)) return out({ error: 'you already posted that' }, 409)
  if (thread === null && mine.filter((m) => m.thread === null && Date.now() - Date.parse(m.created_at) < 3600_000).length >= THREADS_PER_HOUR)
    return out({ error: `${THREADS_PER_HOUR} new threads an hour, anon` }, 429)

  if (thread !== null && /^u\d+$/.test(thread)) {       // a reply to a user thread: it must exist and be visible
    const { data: op } = await db.from('chud_posts').select('id').eq('id', Number(thread.slice(1))).is('thread', null).eq('hidden', false).maybeSingle()
    if (!op) return out({ error: 'that thread is gone' }, 404)
  }
  const { data: post, error } = await db.from('chud_posts').insert({ thread, subject: subject || null, name, body, ip_hash })
    .select('id, thread, subject, name, body, created_at, bumped_at').single()
  if (error) return out({ error: 'post failed' }, 500)
  if (thread !== null && /^u\d+$/.test(thread)) await db.from('chud_posts').update({ bumped_at: new Date().toISOString() }).eq('id', Number(thread.slice(1)))
  return out({ post })
})
