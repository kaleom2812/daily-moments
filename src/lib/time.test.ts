// Run: node --test src/lib/time.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localDate, minutesUntil } from './time.ts'

const t = new Date('2026-01-01T23:30:00Z')

test('local date follows the timezone, not UTC', () => {
  assert.equal(localDate('Pacific/Auckland', t), '2026-01-02') // UTC+13
  assert.equal(localDate('America/Los_Angeles', t), '2026-01-01') // UTC-8
})

test('minutesUntil counts in the user timezone and returns null when passed', () => {
  assert.equal(minutesUntil('09:30', 'UTC', new Date('2026-01-01T09:00:00Z')), 30)
  assert.equal(minutesUntil('09:30', 'UTC', new Date('2026-01-01T10:00:00Z')), null)
  assert.equal(minutesUntil('10:00', 'Asia/Kolkata', new Date('2026-01-01T04:00:00Z')), 30) // 09:30 IST
})
