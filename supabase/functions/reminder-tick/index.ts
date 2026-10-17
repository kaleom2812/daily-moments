// Invoked every minute by Supabase Cron. Auth: shared secret header (CRON_SECRET), not a user JWT.
// Step 1 plans today's reminders for users who have none; step 2 sends the ones that are due.
import webpush from 'npm:web-push@3'
import { admin, localDate, log, replanUser, SETTINGS_COLS, uploadedToday, type Settings } from '../_shared/plan.ts'

const MAX_ATTEMPTS = 3
const enc = new TextEncoder()
function safeEqual(a: string, b: string) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('unauthorized', { status: 401 })
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const db = admin()
  const now = new Date()
  const stats = { planned: 0, sent: 0, skipped: 0, failed: 0, retried: 0 }

  try {
    // 1) plan: users with reminders on and no reminder rows yet for their local date.
    // ponytail: scans all onboarded users each tick; page or pre-filter by timezone when users grow.
    const { data: users, error } = await db
      .from('user_settings')
      .select(SETTINGS_COLS)
      .eq('reminders_enabled', true)
      .not('onboarded_at', 'is', null)
      .limit(1000)
    if (error) throw error
    for (const s of users as Settings[]) {
      const day = localDate(s.timezone, now)
      const { count } = await db
        .from('reminder_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id)
        .eq('local_date', day)
      if (!count) stats.planned += await replanUser(db, s, now)
    }

    // 2) send: atomically claim due reminders (safe if two ticks overlap).
    const { data: due, error: claimErr } = await db.rpc('claim_due_reminders', { p_limit: 100 })
    if (claimErr) throw claimErr
    for (const r of due ?? []) {
      try {
        const { data: s } = await db.from('user_settings').select(SETTINGS_COLS).eq('user_id', r.user_id).single()
        if (!s || !s.reminders_enabled || (await uploadedToday(db, r.user_id, r.local_date)) >= s.daily_target) {
          await db.from('reminder_schedules').update({ status: 'skipped' }).eq('id', r.id)
          stats.skipped++
          continue
        }
        const title = 'Capture a moment'
        const body = 'Take a photo of what you are doing right now.'
        await db.from('notification_events').insert({
          user_id: r.user_id, reminder_id: r.id, channel: 'in_app', kind: 'reminder', title, body, status: 'sent',
        })

        const { data: subs } = await db
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', r.user_id)
        let accepted = 0
        const payload = JSON.stringify({ title, body, reminderId: r.id, url: '/app' })
        for (const sub of subs ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 1800 },
            )
            accepted++
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', sub.id) // expired
            log('push_failed', { code })
          }
        }
        if (accepted > 0 || !subs?.length) {
          // "sent" = accepted by the push service. It is not proof the phone displayed it.
          await db.from('reminder_schedules').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r.id)
          if (accepted) {
            await db.from('notification_events').insert({
              user_id: r.user_id, reminder_id: r.id, channel: 'push', kind: 'reminder', title, body, status: 'sent',
            })
          }
          stats.sent++
        } else throw new Error('all push attempts failed')
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200)
        if (r.attempts < MAX_ATTEMPTS) {
          await db.from('reminder_schedules')
            .update({ status: 'scheduled', scheduled_for: new Date(Date.now() + 2 * 60_000).toISOString(), last_error: msg })
            .eq('id', r.id)
          stats.retried++
        } else {
          await db.from('reminder_schedules').update({ status: 'failed', last_error: msg }).eq('id', r.id)
          stats.failed++
        }
      }
    }
    log('tick', stats)
    return Response.json(stats)
  } catch (e) {
    log('tick_error', { message: (e as Error).message })
    return new Response('internal error', { status: 500 })
  }
})
