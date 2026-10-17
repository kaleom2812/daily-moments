// Run: node --test supabase/functions/_shared/ai.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getProvider, makeStubProvider, pickEvenly, type PhotoMeta } from './ai.ts'

const photos: PhotoMeta[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`, capturedAt: `2026-06-10T${String(8 + i).padStart(2, '0')}:00:00Z`, note: i === 3 ? 'coffee with Sam' : null,
}))
const base = { photos, max: 7, tz: 'UTC', mode: 'all' as const }

test('picks at most max photos, in chronological order, with no duplicates', async () => {
  const r = await makeStubProvider().generate(base)
  assert.equal(r.selectedIds.length, 7)
  assert.equal(new Set(r.selectedIds).size, 7)
  assert.deepEqual(r.selectedIds, [...r.selectedIds].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
  assert.equal(r.selectedIds[0], 'p0')
  assert.equal(r.selectedIds[6], 'p11')
})

test('fewer photos than max: uses them all, no fabrication', async () => {
  const r = await makeStubProvider().generate({ ...base, photos: photos.slice(0, 3) })
  assert.equal(r.selectedIds.length, 3)
  assert.match(r.caption, /^3 moments from today\./)
})

test('caption only mentions facts it was given (times, counts, user notes)', async () => {
  const r = await makeStubProvider().generate({ ...base, photos: photos.slice(0, 5) })
  assert.match(r.caption, /coffee with Sam/)
  assert.doesNotMatch(r.caption, /beach|friends|party|lunch|sunset/i)
})

test('caption mode keeps the current selection; selection mode can change it', async () => {
  const keep = await makeStubProvider().generate({ ...base, mode: 'caption', currentSelection: ['p2', 'p5'] })
  assert.deepEqual(keep.selectedIds, ['p2', 'p5'])
  const a = await makeStubProvider(() => 0.1).generate({ ...base, mode: 'selection' })
  const b = await makeStubProvider(() => 0.9).generate({ ...base, mode: 'selection' })
  assert.notDeepEqual(a.selectedIds, b.selectedIds)
})

test('unconfigured providers fail loudly instead of pretending', () => {
  assert.throws(() => getProvider('openai'), /not configured/)
  assert.equal(getProvider('stub').name, 'stub')
  assert.deepEqual(pickEvenly([1, 2, 3], 5), [1, 2, 3])
})
