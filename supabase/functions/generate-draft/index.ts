// User-triggered: create today's draft, or regenerate all / caption / selection.
// Auth: user JWT, verified here. The user id never comes from the request body.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, log } from '../_shared/plan.ts'
import { generateDraft, type DraftMode } from '../_shared/draft.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MODES: DraftMode[] = ['all', 'caption', 'selection']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const mode: DraftMode = MODES.includes(body?.mode) ? body.mode : 'all'

  try {
    const db = admin()
    const { data: s, error } = await db.from('user_settings')
      .select('user_id, timezone, daily_target, carousel_size').eq('user_id', user.id).single()
    if (error) throw error
    return json(await generateDraft(db, s, mode))
  } catch (e) {
    log('generate_draft_error', { message: (e as Error).message })
    return json({ error: 'internal error' }, 500)
  }
})
