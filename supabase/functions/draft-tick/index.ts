// Cron (every 5 min): once a user's local review time has passed, create their draft if none exists.
// Auth: shared secret header. Each user is handled independently; one failure never blocks the rest.
import { admin, localDate, log } from '../_shared/plan.ts'
import { generateDraft } from '../_shared/draft.ts'

const enc = new TextEncoder()
function safeEqual(a: string, b: string) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

function minutesNow(tz: string, now: Date) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  return +p.find((x) => x.type === 'hour')!.value * 60 + +p.find((x) => x.type === 'minute')!.value
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 })

  const db = admin()
  const now = new Date()
  const stats = { checked: 0, created: 0, insufficient: 0, failed: 0 }
  try {
    // ponytail: scans all onboarded users each tick; filter by timezone or page when users grow.
    const { data: users, error } = await db.from('user_settings')
      .select('user_id, timezone, daily_target, carousel_size, review_time').not('onboarded_at', 'is', null).limit(500)
    if (error) throw error
    let budget = 25 // bounded work per invocation
    for (const s of users) {
      const [h, m] = String(s.review_time).split(':').map(Number)
      if (minutesNow(s.timezone, now) < h * 60 + m) continue
      stats.checked++
      const { count } = await db.from('daily_post_drafts').select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id).eq('local_date', localDate(s.timezone, now))
      if (count) continue
      if (budget-- <= 0) break
      try {
        const r = await generateDraft(db, s, 'auto', now)
        if (r.status === 'ok') stats.created++
        else if (r.status === 'insufficient') stats.insufficient++
        else if (r.status === 'failed') stats.failed++
      } catch (e) {
        stats.failed++
        log('draft_tick_user_error', { message: (e as Error).message })
      }
    }
    log('draft_tick', stats)
    return Response.json(stats)
  } catch (e) {
    log('draft_tick_error', { message: (e as Error).message })
    return new Response('internal error', { status: 500 })
  }
})
