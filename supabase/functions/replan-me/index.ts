// Called by the signed-in user after an upload or settings change. Auth: user JWT, verified here.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, log, replanUser, SETTINGS_COLS, type Settings } from '../_shared/plan.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  try {
    const db = admin()
    // The user id comes from the verified token, never from the request body.
    const { data, error } = await db.from('user_settings').select(SETTINGS_COLS).eq('user_id', user.id).single()
    if (error) throw error
    const planned = await replanUser(db, data as Settings)
    log('replan', { planned })
    return json({ planned })
  } catch (e) {
    log('replan_error', { message: (e as Error).message })
    return json({ error: 'internal error' }, 500)
  }
})
