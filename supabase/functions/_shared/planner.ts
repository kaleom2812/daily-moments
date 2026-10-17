// Pure scheduling logic (no Deno/Node APIs) so it can be tested with `node --test`.

function tzOffsetMs(utcMs: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

// Wall-clock time in `tz` -> UTC instant. Second pass corrects across DST transitions.
export function zonedToUtc(localDate: string, hhmm: string, tz: string): number {
  const [y, mo, d] = localDate.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - tzOffsetMs(guess, tz)
  return guess - tzOffsetMs(first, tz)
}

export type PlanInput = {
  localDate: string
  tz: string
  start: string // HH:MM
  end: string // HH:MM
  target: number
  uploaded: number // confirmed uploads so far today
  minGapMin: number
  now: number // epoch ms
  rng?: () => number
}

// Random reminder instants for the rest of the day: inside the window, >= minGap apart,
// never more than still needed to hit the target.
export function planReminders(i: PlanInput): number[] {
  const rng = i.rng ?? Math.random
  const gap = i.minGapMin * 60_000
  const windowEnd = zonedToUtc(i.localDate, i.end, i.tz)
  // Don't nag right after a capture or right after planning: earliest slot is now + gap.
  const windowStart = Math.max(zonedToUtc(i.localDate, i.start, i.tz), i.now + gap)
  const len = windowEnd - windowStart
  let n = Math.max(0, i.target - i.uploaded)
  if (len <= 0) return []
  while (n > 0 && (n - 1) * gap > len) n-- // window too short for n reminders at this spacing
  if (n === 0) return []
  const slack = len - (n - 1) * gap
  const xs = Array.from({ length: n }, () => rng() * slack).sort((a, b) => a - b)
  return xs.map((x, k) => Math.round(windowStart + x + k * gap))
}
