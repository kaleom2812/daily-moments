// AI provider abstraction. Pure TypeScript so it can be tested with `node --test`.
// Real providers plug in by implementing AiProvider; until one is configured the stub is used,
// and it never pretends to look at the images.

export type PhotoMeta = { id: string; capturedAt: string; note: string | null }

export type DraftInput = {
  photos: PhotoMeta[] // eligible photos for the user's local date, oldest first
  max: number // carousel size
  tz: string
  mode: 'all' | 'caption' | 'selection'
  currentSelection?: string[] // kept when mode === 'caption'
}

export type DraftResult = { selectedIds: string[]; caption: string; hashtags: string[] }

export interface AiProvider {
  name: string
  generate(input: DraftInput): Promise<DraftResult>
}

// n evenly spread items, always keeping chronological order.
export function pickEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1 || 1))])
}

function pickRandom<T>(items: T[], n: number, rng: () => number): T[] {
  if (items.length <= n) return items
  const idx = items.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, n).sort((a, b) => a - b).map((i) => items[i])
}

const fmt = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })

export function makeStubProvider(rng: () => number = Math.random): AiProvider {
  return {
    name: 'stub',
    async generate(i) {
      const selected =
        i.mode === 'caption' && i.currentSelection?.length
          ? i.photos.filter((p) => i.currentSelection!.includes(p.id))
          : i.mode === 'selection'
            ? pickRandom(i.photos, i.max, rng)
            : pickEvenly(i.photos, i.max)
      // Only states facts we actually know: counts, times and the user's own notes. No invented scenes.
      const notes = selected.map((p) => p.note).filter((n): n is string => !!n).slice(0, 3)
      const span = selected.length > 1
        ? `From ${fmt(selected[0].capturedAt, i.tz)} to ${fmt(selected[selected.length - 1].capturedAt, i.tz)}.`
        : `At ${fmt(selected[0].capturedAt, i.tz)}.`
      const caption = [`${selected.length} moment${selected.length === 1 ? '' : 's'} from today. ${span}`, ...notes].join('\n')
      return { selectedIds: selected.map((p) => p.id), caption, hashtags: ['#dailymoments', '#photojournal'] }
    },
  }
}

export function getProvider(name: string): AiProvider {
  if (name === 'stub') return makeStubProvider()
  // Add real providers here (e.g. 'anthropic', 'openai') once one is chosen and its key is set.
  throw new Error(`AI provider "${name}" is not configured`)
}
