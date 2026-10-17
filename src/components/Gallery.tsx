import { useState } from 'react'
import { deletePhoto, type Photo } from '../lib/photos'
import { Notice } from './ui'

type Item = Photo & { url: string }

export default function Gallery({ photos, tz, onChanged }: { photos: Item[]; tz: string; onChanged: () => void }) {
  const [open, setOpen] = useState<Item | null>(null)
  const [error, setError] = useState('')
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' })

  async function remove(p: Item) {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    try {
      await deletePhoto(p)
      setOpen(null)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!photos.length) return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No photos yet today. Capture your first moment.</p>

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id}>
            <button onClick={() => setOpen(p)} className="block w-full text-left">
              <img src={p.url} alt={p.caption ?? `Photo taken at ${time(p.captured_at)}`} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
              <span className="mt-1 block text-xs text-muted">{time(p.captured_at)}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Photo preview" className="fixed inset-0 z-40 flex flex-col bg-black/90 p-4 text-white">
          <div className="flex justify-between">
            <button onClick={() => setOpen(null)} className="min-h-11 px-2">Close</button>
            <button onClick={() => remove(open)} className="min-h-11 px-2 text-red-300">Delete</button>
          </div>
          <img src={open.url} alt={open.caption ?? 'Photo'} className="min-h-0 flex-1 object-contain" />
          <p className="pt-3 text-sm">{time(open.captured_at)}{open.caption ? ` · ${open.caption}` : ''}</p>
        </div>
      )}
    </>
  )
}
