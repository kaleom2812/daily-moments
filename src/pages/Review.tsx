import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  approveDraft, generate, loadDraft, parseHashtags, rejectDraft, reopenDraft, saveDraft, statusLabel,
  type Draft, type DraftMode, type DraftPhoto,
} from '../lib/drafts'
import { Button, Notice } from '../components/ui'

const MAX_PHOTOS = 10

export default function Review() {
  const { id } = useParams()
  const nav = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sel, setSel] = useState<DraftPhoto[]>([])
  const [pool, setPool] = useState<DraftPhoto[]>([])
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await loadDraft(id!)
      setDraft(r.draft)
      setSel(r.selected)
      setPool(r.pool)
      setCaption(r.draft.caption)
      setTags(r.draft.hashtags.join(' '))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const { tags: parsedTags, invalid } = parseHashtags(tags)
  const editable = draft?.status === 'awaiting_review'
  const time = (p: DraftPhoto) => new Date(p.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  async function run(label: string, fn: () => Promise<void>, ok?: string) {
    setBusy(label)
    setError('')
    setInfo('')
    try {
      await fn()
      if (ok) setInfo(ok)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy('')
  }

  const save = () => saveDraft(id!, caption, parsedTags, sel.map((p) => p.id))
  const guard = () => {
    if (invalid.length) throw new Error(`Fix invalid hashtags: ${invalid.join(' ')}`)
    if (!sel.length) throw new Error('Add at least one photo.')
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= sel.length) return
    const next = [...sel]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSel(next)
  }
  const remove = (p: DraftPhoto) => { setSel(sel.filter((x) => x.id !== p.id)); setPool([...pool, p]) }
  const add = (p: DraftPhoto) => {
    if (sel.length >= MAX_PHOTOS) return setError(`A carousel holds at most ${MAX_PHOTOS} photos.`)
    setSel([...sel, p]); setPool(pool.filter((x) => x.id !== p.id))
  }

  const regen = (mode: DraftMode, msg: string) => run('regen', async () => {
    if (mode === 'caption') { guard(); await save() } // caption regeneration works from the saved selection
    const r = await generate(mode)
    if (r.status === 'failed') throw new Error(`Generation failed: ${r.error}. Your photos are safe; try again.`)
    await load()
  }, msg)

  if (!draft) return <main className="p-8">{error ? <Notice kind="error">{error}</Notice> : 'Loading…'}</main>

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link to="/app" className="inline-block min-h-11 text-sm underline">← Back</Link>
      <header>
        <p className="text-sm text-muted">{new Date(draft.local_date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="font-serif text-4xl">Review your post</h1>
        <p className="mt-2 inline-block rounded-full bg-line px-3 py-1 text-sm" role="status">{statusLabel[draft.status]}</p>
      </header>

      {draft.partial && <Notice kind="ok">Fewer photos than your daily target, so this is a smaller post.</Notice>}
      {draft.ai_provider === 'stub' && (
        <Notice kind="ok">No AI is connected yet. This caption is a plain template built from your photo times and notes, and photos were picked evenly across the day.</Notice>
      )}
      {draft.status === 'failed' && <Notice kind="error">{draft.error ?? 'Generation failed.'} Your photos are safe.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="ok">{info}</Notice>}

      <section aria-labelledby="sel">
        <h2 id="sel" className="mb-3 font-serif text-2xl">Carousel ({sel.length}/{MAX_PHOTOS})</h2>
        <ol className="space-y-3">
          {sel.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2">
              <span className="w-6 text-center font-serif text-lg text-accent">{i + 1}</span>
              <img src={p.url} alt={p.note ?? `Photo from ${time(p)}`} className="size-20 rounded-lg object-cover" />
              <span className="flex-1 text-sm text-muted">{time(p)}{p.note ? ` · ${p.note}` : ''}</span>
              {editable && (
                <span className="flex">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} up`} className="min-h-11 min-w-11 disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === sel.length - 1} aria-label={`Move photo ${i + 1} down`} className="min-h-11 min-w-11 disabled:opacity-30">↓</button>
                  <button onClick={() => remove(p)} aria-label={`Remove photo ${i + 1}`} className="min-h-11 min-w-11 text-red-700">✕</button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {!sel.length && <p className="text-muted">No photos selected.</p>}
      </section>

      {editable && pool.length > 0 && (
        <section aria-labelledby="pool">
          <h2 id="pool" className="mb-3 font-serif text-2xl">Add from today</h2>
          <ul className="flex gap-2 overflow-x-auto pb-2">
            {pool.map((p) => (
              <li key={p.id} className="shrink-0">
                <button onClick={() => add(p)} aria-label={`Add photo from ${time(p)}`} className="block">
                  <img src={p.url} alt="" className="size-20 rounded-lg object-cover" />
                  <span className="block text-xs text-muted">{time(p)} +</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="cap" className="block text-sm font-medium">Caption</label>
          <textarea id="cap" value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!editable} maxLength={2200} rows={5}
            className="w-full rounded-xl border border-line bg-white p-4 text-base disabled:opacity-60" />
          <p className="text-xs text-muted">{caption.length}/2200</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="tags" className="block text-sm font-medium">Hashtags</label>
          <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={!editable}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-4 text-base disabled:opacity-60" />
          <p className="text-xs text-muted">Separate with spaces. Up to 30. Letters, numbers and underscores only.</p>
          {invalid.length > 0 && <Notice kind="error">Invalid hashtags: {invalid.join(' ')}</Notice>}
        </div>
      </section>

      {editable && (
        <div className="flex flex-wrap gap-3">
          <button disabled={!!busy} onClick={() => regen('caption', 'New caption generated.')} className="min-h-11 rounded-full border border-line px-5 text-sm">Regenerate caption</button>
          <button disabled={!!busy} onClick={() => confirm('Pick a new set of photos? Your current selection will be replaced.') && regen('selection', 'New selection generated.')}
            className="min-h-11 rounded-full border border-line px-5 text-sm">Regenerate selection</button>
          <button disabled={!!busy} onClick={() => run('save', async () => { guard(); await save() }, 'Draft saved.')} className="min-h-11 rounded-full border border-line px-5 text-sm">Save draft</button>
        </div>
      )}

      {draft.status === 'failed' && (
        <Button disabled={!!busy} onClick={() => regen('all', 'Draft generated.')}>Try again</Button>
      )}

      {editable && (
        <div className="space-y-3 border-t border-line pt-6">
          <Button disabled={!!busy} onClick={() => run('approve', async () => { guard(); await save(); await approveDraft(id!); await load() }, 'Approved. Nothing has been posted.')} className="w-full">
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <button disabled={!!busy} onClick={() => confirm('Discard this draft?') && run('reject', async () => { await rejectDraft(id!); nav('/app') })}
            className="min-h-11 w-full text-sm text-red-700 underline">Discard draft</button>
        </div>
      )}

      {draft.status === 'approved' && (
        <div className="space-y-3 border-t border-line pt-6">
          <button disabled title="Instagram is not connected" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-white opacity-40">
            Publish to Instagram
          </button>
          <p className="text-sm text-muted">Publishing is switched off until Instagram is connected. Approval does not post anything.</p>
          <button disabled={!!busy} onClick={() => run('reopen', async () => { await reopenDraft(id!); await load() })} className="min-h-11 text-sm underline">Reopen to edit</button>
        </div>
      )}
    </main>
  )
}
