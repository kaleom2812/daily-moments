import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { planReminders } from './planner.ts'

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

export type Settings = {
  user_id: string
  daily_target: number
  reminder_start: string
  reminder_end: string
  min_interval_minutes: number
  timezone: string
  reminders_enabled: boolean
}
export const SETTINGS_COLS =
  'user_id, daily_target, reminder_start, reminder_end, min_interval_minutes, timezone, reminders_enabled'

export const localDate = (tz: string, now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: tz })

export async function uploadedToday(db: SupabaseClient, userId: string, day: string): Promise<number> {
  const { count, error } = await db
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('local_date', day)
    .eq('status', 'uploaded')
  if (error) throw error
  return count ?? 0
}

// Idempotent: drops this user's not-yet-sent reminders for today and re-plans what is still needed.
export async function replanUser(db: SupabaseClient, s: Settings, now = new Date()): Promise<number> {
  const day = localDate(s.timezone, now)
  const del = await db
    .from('reminder_schedules')
    .delete()
    .eq('user_id', s.user_id)
    .eq('local_date', day)
    .eq('status', 'scheduled')
  if (del.error) throw del.error
  if (!s.reminders_enabled) return 0

  const times = planReminders({
    localDate: day,
    tz: s.timezone,
    start: s.reminder_start.slice(0, 5),
    end: s.reminder_end.slice(0, 5),
    target: s.daily_target,
    uploaded: await uploadedToday(db, s.user_id, day),
    minGapMin: s.min_interval_minutes,
    now: now.getTime(),
  })
  if (!times.length) return 0
  const ins = await db.from('reminder_schedules').upsert(
    times.map((t) => ({ user_id: s.user_id, local_date: day, scheduled_for: new Date(t).toISOString() })),
    { onConflict: 'user_id,scheduled_for', ignoreDuplicates: true },
  )
  if (ins.error) throw ins.error
  return times.length
}

// Never log tokens, push endpoints, passwords or photo URLs.
export const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ event, ...data }))
