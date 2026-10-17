import { Link } from 'react-router-dom'

const steps = [
  ['A nudge at a random moment', 'Reminders land at unpredictable times within your waking hours, so you catch life as it actually is.'],
  ['A photo, no staging', 'Snap what is in front of you. Five to ten small moments a day, stored privately.'],
  ['One carousel, your words', 'At the end of the day, AI drafts an Instagram carousel and caption. You edit it, and nothing posts until you approve.'],
]

export default function Landing() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <span className="font-serif text-xl font-semibold">Daily Moments</span>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link to="/signin" className="rounded-full bg-ink px-5 py-2.5 text-paper">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="py-16 sm:py-28">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">A journal made of photos</p>
          <h1 className="max-w-3xl font-serif text-5xl leading-[1.05] sm:text-7xl">
            Your ordinary day, turned into a memory worth posting.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Take a handful of unplanned photos. We gather them at the end of the day into a ready-to-review Instagram carousel.
          </p>
          <Link
            to="/signin"
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-accent px-8 font-semibold text-white hover:bg-accent-dark"
          >
            Open your journal
          </Link>
        </section>

        <section aria-labelledby="how" className="border-t border-line py-14">
          <h2 id="how" className="font-serif text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map(([t, d], i) => (
              <li key={t}>
                <span className="font-serif text-4xl text-accent">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="font-serif text-3xl">Private by default</h2>
          <p className="mt-4 max-w-2xl text-muted">
            Photos live in a private bucket only you can read. Instagram is optional, and a post is published only after you press approve.
          </p>
        </section>
      </main>
      <footer className="border-t border-line py-8 text-sm text-muted">© Daily Moments</footer>
    </div>
  )
}
