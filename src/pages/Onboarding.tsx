import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { replanReminders } from '../lib/push'
import { Button, Field, Notice } from '../components/ui'

const zones: string[] = Intl.supportedValuesOf('timeZone')
const detected = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function Onboarding() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [target, setTarget] = useState(7)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('21:00')
  const [tz, setTz] = useState(zones.includes(detected) ? detected : 'UTC')
  const [review, setReview] = useState('21:30')
  const [inApp, setInApp] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end <= start) return setError('Reminders must end after they start.')
    setBusy(true)
    setError('')
    const uid = session!.user.id
    const p = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', uid)
    const s = await supabase.from('user_settings').update({
      daily_target: target,
      reminder_start: start,
      reminder_end: end,
      timezone: tz,
      review_time: review,
      notify_in_app: inApp,
      onboarded_at: new Date().toISOString(),
    }).eq('user_id', uid)
    const err = p.error ?? s.error
    if (err) {
      setError(err.message)
      setBusy(false)
    } else {
      replanReminders() // best effort; the server also plans on its own schedule
      nav('/app', { replace: true })
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-serif text-4xl">Set up your day</h1>
      <p className="mt-2 text-muted">You can change all of this later in Settings.</p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <Field id="name" label="Display name" required maxLength={80} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="space-y-1.5">
          <label htmlFor="target" className="block text-sm font-medium">
            Photos per day: <output className="font-semibold text-accent">{target}</output>
          </label>
          <input id="target" type="range" min={5} max={10} step={1} value={target} onChange={(e) => setTarget(+e.target.value)} className="w-full accent-accent" />
          <p className="text-xs text-muted">Between 5 and 10.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="start" label="Reminders start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          <Field id="end" label="Reminders end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tz" className="block text-sm font-medium">Timezone</label>
          <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-white px-4 text-base">
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>

        <Field id="review" label="Daily review time" type="time" required value={review} onChange={(e) => setReview(e.target.value)} hint="When your day’s draft should be ready for you." />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Notifications</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} className="size-5 accent-accent" />
            In-app reminders
          </label>
          <p className="text-xs text-muted">Browser push and email come later. Browsers cannot guarantee delivery while closed.</p>
        </fieldset>

        <div className="rounded-xl border border-line p-4 text-sm text-muted">
          <strong className="text-ink">Instagram</strong> is optional. Connect it later from Settings; photo journaling works without it.
        </div>

        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Start journaling'}</Button>
      </form>
    </main>
  )
}
