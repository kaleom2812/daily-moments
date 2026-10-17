import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadDay, type Photo } from '../lib/photos'
import { localDate, minutesUntil } from '../lib/time'
import Camera from '../components/Camera'
import Gallery from '../components/Gallery'
import NotificationsCard from '../components/NotificationsCard'
import { replanReminders } from '../lib/push'
import { Link } from 'react-router-dom'
import { generate, listDrafts, statusLabel, type Draft } from '../lib/drafts'
import { Button, Notice } from '../components/ui'

type Settings = { daily_target: number; timezone: string; review_time: string }
type Item = Photo & { url: string }

function untilText(min: number | null) {
  if (min === null) return 'Review time has passed'
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m until review` : `${min}m until review`
}

export default function Dashboard({ name }: { name: string }) {
  const nav = useNavigate()
  const [s, setS] = useState<Settings | null>(null)
  const [photos, setPhotos] = useState<Item[]>([])
  const [camera, setCamera] = useState(false)
  const [error, setError] = useState('')
  const [next, setNext] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [making, setMaking] = useState(false)

  // Tapping a push opens /app?reminder=<id>: record that it was opened, then tidy the URL.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('reminder')
    if (!id) return
    supabase.from('reminder_schedules').update({ opened_at: new Date().toISOString() }).eq('id', id).is('opened_at', null).then(() => {})
    history.replaceState(null, '', '/app')
  }, [])

  useEffect(() => {
    supabase.from('reminder_schedules').select('scheduled_for').eq('status', 'scheduled')
      .gt('scheduled_for', new Date().toISOString()).order('scheduled_for').limit(1)
      .then(({ data }) => setNext(data?.[0]?.scheduled_for ?? null))
  }, [photos])

  useEffect(() => {
    supabase.from('user_settings').select('daily_target, timezone, review_time').single()
      .then(({ data, error }) => (error ? setError(error.message) : setS(data)))
  }, [])

  const refresh = useCallback(async () => {
    if (!s) return
    try {
      setPhotos(await loadDay(localDate(s.timezone)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [s])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { listDrafts().then(setDrafts).catch((e) => setError(e.message)) }, [])

  async function makeDraft() {
    setMaking(true)
    setError('')
    try {
      const r = await generate('all')
      if (r.status === 'insufficient') setError('Capture at least one photo first.')
      else if (r.status === 'failed') setError(`Draft failed: ${r.error}. Your photos are safe; try again.`)
      else if (r.draftId) nav(`/review/${r.draftId}`)
      setDrafts(await listDrafts())
    } catch (e) {
      setError((e as Error).message)
    }
    setMaking(false)
  }

  if (!s) return <main className="p-8">{error ? <Notice kind="error">{error}</Notice> : 'Loading…'}</main>

  // Only confirmed uploads are loaded, so this is exactly what counts toward the target.
  const count = photos.length
  const pct = Math.min(100, Math.round((count / s.daily_target) * 100))
  const today = new Date().toLocaleDateString([], { timeZone: s.timezone, weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{today}</p>
          <h1 className="font-serif text-4xl">Hello{name ? `, ${name}` : ''}</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="min-h-11 text-sm underline">Sign out</button>
      </header>

      {error && <Notice kind="error">{error}</Notice>}

      <section aria-label="Daily progress" className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-end justify-between">
          <p className="font-serif text-5xl">{count}<span className="text-2xl text-muted"> / {s.daily_target}</span></p>
          <p className="text-sm text-muted">{untilText(minutesUntil(s.review_time, s.timezone))}</p>
        </div>
        <div role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={s.daily_target} aria-label="Photos captured today"
          className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {count >= s.daily_target
            ? 'Target reached. Anything extra is a bonus.'
            : next
              ? `Next reminder around ${new Date(next).toLocaleTimeString([], { timeZone: s.timezone, hour: 'numeric', minute: '2-digit' })}`
              : 'No more reminders scheduled today. Capture whenever a moment strikes.'}
        </p>
        <Button onClick={() => setCamera(true)} className="mt-5 w-full sm:w-auto">Capture a photo</Button>
      </section>

      <NotificationsCard />

      <section aria-labelledby="gal">
        <h2 id="gal" className="mb-3 font-serif text-2xl">Today</h2>
        <Gallery photos={photos} tz={s.timezone} onChanged={refresh} />
      </section>

      <section aria-labelledby="posts">
        <h2 id="posts" className="mb-3 font-serif text-2xl">Recent posts</h2>
        {drafts.length === 0 && <p className="text-muted">No posts yet. A draft is created automatically at your review time, or make one now.</p>}
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link to={`/review/${d.id}`} className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
                <span>{new Date(d.local_date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                <span className="text-sm text-muted">{statusLabel[d.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
        {count > 0 && !drafts.some((d) => d.local_date === localDate(s.timezone)) && (
          <Button onClick={makeDraft} disabled={making} className="mt-3">{making ? 'Creating…' : "Create today's draft"}</Button>
        )}
      </section>

      {camera && <Camera onClose={() => setCamera(false)} onUploaded={() => { refresh(); replanReminders() }} />}
    </main>
  )
}
