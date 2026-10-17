import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import { Button, Notice } from './ui'

const hints: Partial<Record<PushState, string>> = {
  unsupported: 'This browser does not support push notifications. Reminders will still appear inside the app.',
  'ios-needs-install': 'On iPhone, notifications only work after you add this site to your Home Screen: tap Share, then Add to Home Screen, then open Daily Moments from the new icon and enable notifications there. Needs iOS 16.4 or later.',
  denied: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.',
}

export default function NotificationsCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { pushState().then(setState) }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (state === 'on') await disablePush()
      else await enablePush()
      setState(await pushState())
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  if (!state) return null
  const usable = state === 'on' || state === 'off'
  return (
    <section aria-label="Notifications" className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-serif text-xl">Phone notifications</h2>
      <p className="mt-1 text-sm text-muted">
        {usable
          ? 'Get a nudge at random moments. Delivery is best-effort: your phone or browser may delay or drop a notification.'
          : hints[state]}
      </p>
      {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
      {usable && (
        <Button onClick={toggle} disabled={busy} className="mt-4">
          {busy ? 'Working…' : state === 'on' ? 'Turn off notifications' : 'Turn on notifications'}
        </Button>
      )}
    </section>
  )
}
