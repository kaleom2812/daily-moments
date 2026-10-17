import { supabase } from './supabase'

export type Draft = {
  id: string
  local_date: string
  status: 'processing' | 'awaiting_review' | 'approved' | 'rejected' | 'failed' | 'publishing' | 'published'
  caption: string
  hashtags: string[]
  ai_provider: string | null
  partial: boolean
  error: string | null
}
export type DraftPhoto = { id: string; url: string; captured_at: string; note: string | null }
export type DraftMode = 'all' | 'caption' | 'selection'

export const statusLabel: Record<Draft['status'], string> = {
  processing: 'Generating…',
  awaiting_review: 'Ready to review',
  approved: 'Approved',
  rejected: 'Discarded',
  failed: 'Generation failed',
  publishing: 'Publishing…',
  published: 'Published',
}

const COLS = 'id, local_date, status, caption, hashtags, ai_provider, partial, error'
const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export async function listDrafts(limit = 5): Promise<Draft[]> {
  return must(await supabase.from('daily_post_drafts').select(COLS).order('local_date', { ascending: false }).limit(limit))
}

export async function loadDraft(id: string): Promise<{ draft: Draft; selected: DraftPhoto[]; pool: DraftPhoto[] }> {
  const draft = must(await supabase.from('daily_post_drafts').select(COLS).eq('id', id).single()) as Draft
  const items = must(await supabase.from('daily_post_items').select('photo_id, position').eq('draft_id', id).order('position'))
  const photos = must(await supabase.from('photos').select('id, storage_path, captured_at, caption')
    .eq('local_date', draft.local_date).eq('status', 'uploaded').order('captured_at'))
  const signed = photos.length ? must(await supabase.storage.from('photos').createSignedUrls(photos.map((p) => p.storage_path), 3600)) : []
  const byId = new Map<string, DraftPhoto>(photos.map((p, i) => [p.id, {
    id: p.id, url: signed[i]?.signedUrl ?? '', captured_at: p.captured_at, note: p.caption,
  }]))
  const selected = items.map((i) => byId.get(i.photo_id)).filter((p): p is DraftPhoto => !!p)
  const chosen = new Set(selected.map((p) => p.id))
  return { draft, selected, pool: [...byId.values()].filter((p) => !chosen.has(p.id)) }
}

export async function generate(mode: DraftMode): Promise<{ status: string; draftId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('generate-draft', { body: { mode } })
  if (error) throw new Error('Could not reach the draft generator. Try again.')
  return data
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
}
export const saveDraft = (id: string, caption: string, hashtags: string[], photoIds: string[]) =>
  rpc('save_draft', { p_draft_id: id, p_caption: caption, p_hashtags: hashtags, p_photo_ids: photoIds })
export const approveDraft = (id: string) => rpc('approve_draft', { p_draft_id: id })
export const reopenDraft = (id: string) => rpc('reopen_draft', { p_draft_id: id })
export const rejectDraft = (id: string) => rpc('reject_draft', { p_draft_id: id })

export const HASHTAG_RE = /^#[A-Za-z0-9_]{1,100}$/
export function parseHashtags(text: string): { tags: string[]; invalid: string[] } {
  const parts = text.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`))
  const uniq = [...new Set(parts)]
  return { tags: uniq.filter((t) => HASHTAG_RE.test(t)), invalid: uniq.filter((t) => !HASHTAG_RE.test(t)) }
}
