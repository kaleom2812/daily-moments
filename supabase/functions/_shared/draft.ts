import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { getProvider, type PhotoMeta } from './ai.ts'
import { localDate, log } from './plan.ts'

export type DraftMode = 'auto' | 'all' | 'caption' | 'selection'
export type DraftOutcome =
  | { status: 'insufficient' } // no photos: nothing is fabricated
  | { status: 'busy' | 'locked' | 'exists'; draftId: string }
  | { status: 'ok' | 'failed'; draftId: string; error?: string }

type S = { user_id: string; timezone: string; daily_target: number; carousel_size: number }
const AI_TIMEOUT_MS = 25_000

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('AI request timed out')), AI_TIMEOUT_MS))])

// Idempotent per (user, local date): safe to call from cron and from the user, concurrently.
export async function generateDraft(db: SupabaseClient, s: S, mode: DraftMode, now = new Date()): Promise<DraftOutcome> {
  const day = localDate(s.timezone, now)
  const { data: photos, error: pErr } = await db.from('photos').select('id, captured_at, caption')
    .eq('user_id', s.user_id).eq('local_date', day).eq('status', 'uploaded').order('captured_at')
  if (pErr) throw pErr
  if (!photos.length) return { status: 'insufficient' }

  const { data: existing } = await db.from('daily_post_drafts').select('id, status, updated_at')
    .eq('user_id', s.user_id).eq('local_date', day).maybeSingle()

  if (existing) {
    if (['approved', 'publishing', 'published'].includes(existing.status)) return { status: 'locked', draftId: existing.id }
    // Another worker is mid-generation: do not start a second one.
    if (existing.status === 'processing' && Date.now() - Date.parse(existing.updated_at) < 2 * 60_000) {
      return { status: 'busy', draftId: existing.id }
    }
    if (mode === 'auto' && existing.status !== 'processing') return { status: 'exists', draftId: existing.id }
  }

  const ins = await db.from('daily_post_drafts').upsert(
    { user_id: s.user_id, local_date: day, partial: photos.length < s.daily_target },
    { onConflict: 'user_id,local_date', ignoreDuplicates: true },
  )
  if (ins.error) throw ins.error
  const { data: draft, error: dErr } = await db.from('daily_post_drafts').select('id, status')
    .eq('user_id', s.user_id).eq('local_date', day).single()
  if (dErr) throw dErr
  const isNew = !existing
  await db.from('daily_post_drafts').update({ status: 'processing', error: null, partial: photos.length < s.daily_target }).eq('id', draft.id)

  const providerName = Deno.env.get('AI_PROVIDER') ?? 'stub'
  try {
    let current: string[] | undefined
    if (mode === 'caption') {
      const { data: items } = await db.from('daily_post_items').select('photo_id').eq('draft_id', draft.id).order('position')
      current = items?.map((i) => i.photo_id)
    }
    const metas: PhotoMeta[] = photos.map((p) => ({ id: p.id, capturedAt: p.captured_at, note: p.caption }))
    const r = await withTimeout(getProvider(providerName).generate({
      photos: metas, max: s.carousel_size, tz: s.timezone, mode: mode === 'auto' ? 'all' : mode, currentSelection: current,
    }))
    const valid = new Set(photos.map((p) => p.id))
    const ids = r.selectedIds.filter((id) => valid.has(id)).slice(0, 10) // never trust provider output
    if (!ids.length) throw new Error('AI returned no usable photos')

    await db.from('daily_post_items').delete().eq('draft_id', draft.id)
    const itemsIns = await db.from('daily_post_items').insert(ids.map((photo_id, position) => ({ draft_id: draft.id, photo_id, position })))
    if (itemsIns.error) throw itemsIns.error
    await db.from('daily_post_drafts').update({
      status: 'awaiting_review', caption: r.caption.slice(0, 2200), hashtags: r.hashtags.slice(0, 30), ai_provider: providerName, error: null,
    }).eq('id', draft.id)
    if (isNew || mode === 'auto') {
      await db.from('notification_events').insert({
        user_id: s.user_id, channel: 'in_app', kind: 'draft_ready', title: 'Your daily post is ready to review',
        body: 'Nothing is posted until you approve it.', status: 'sent',
      })
    }
    log('draft_ok', { mode, provider: providerName, photos: ids.length })
    return { status: 'ok', draftId: draft.id }
  } catch (e) {
    // Photos are never touched; the user can retry from the review screen.
    const msg = (e as Error).message.slice(0, 300)
    await db.from('daily_post_drafts').update({ status: 'failed', error: msg }).eq('id', draft.id)
    log('draft_failed', { mode, provider: providerName, message: msg })
    return { status: 'failed', draftId: draft.id, error: msg }
  }
}
