// Run: node --test supabase/functions/_shared/planner.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planReminders, zonedToUtc } from './planner.ts'

const base = { localDate: '2026-06-10', tz: 'UTC', start: '09:00', end: '21:00', target: 7, uploaded: 0, minGapMin: 45 }
const at = (iso: string) => Date.parse(iso)

test('reminders stay inside the window, spaced by the minimum gap, count = target', () => {
  for (let r = 0; r < 200; r++) {
    const ts = planReminders({ ...base, now: at('2026-06-10T06:00:00Z') })
    assert.equal(ts.length, 7)
    assert.ok(ts[0] >= at('2026-06-10T09:00:00Z') && ts[6] <= at('2026-06-10T21:00:00Z'))
    for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= 45 * 60_000)
  }
})

test('uploads reduce remaining reminders; none when target reached', () => {
  const now = at('2026-06-10T10:00:00Z')
  assert.equal(planReminders({ ...base, uploaded: 5, now }).length, 2)
  assert.equal(planReminders({ ...base, uploaded: 7, now }).length, 0)
  assert.equal(planReminders({ ...base, uploaded: 9, now }).length, 0)
})

test('nothing is planned in the past or after the window closes; short window caps the count', () => {
  assert.equal(planReminders({ ...base, now: at('2026-06-10T21:30:00Z') }).length, 0)
  const ts = planReminders({ ...base, now: at('2026-06-10T19:00:00Z') }) // ~1h left, gap 45m
  assert.ok(ts.length <= 2 && ts.every((t) => t > at('2026-06-10T19:00:00Z')))
})

test('timezone and DST: wall time maps to the right UTC instant', () => {
  assert.equal(zonedToUtc('2026-06-10', '09:00', 'Asia/Kolkata'), at('2026-06-10T03:30:00Z'))
  // New York spring-forward day (2026-03-08): 01:00 EST = 06:00Z, 05:00 EDT = 09:00Z -> 3 real hours.
  const w = zonedToUtc('2026-03-08', '05:00', 'America/New_York') - zonedToUtc('2026-03-08', '01:00', 'America/New_York')
  assert.equal(w, 3 * 3600_000)
})

test('deterministic with an injected rng (no duplicates at the same instant)', () => {
  const ts = planReminders({ ...base, now: at('2026-06-10T06:00:00Z'), rng: () => 0.5 })
  assert.equal(new Set(ts).size, ts.length)
})
