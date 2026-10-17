// The user's calendar date (YYYY-MM-DD) in an IANA timezone.
export function localDate(tz: string, now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: tz })
}

// Minutes from `now` until the next HH:MM today in `tz`; null if that time has passed.
export function minutesUntil(hhmm: string, tz: string, now: Date = new Date()): number | null {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
  const nowMin = +parts.find((p) => p.type === 'hour')!.value * 60 + +parts.find((p) => p.type === 'minute')!.value
  const [h, m] = hhmm.split(':').map(Number)
  const diff = h * 60 + m - nowMin
  return diff > 0 ? diff : null
}
