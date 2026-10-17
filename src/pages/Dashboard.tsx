import { supabase } from '../lib/supabase'

// Placeholder: the real dashboard (progress, gallery, camera) is the next step.
export default function Dashboard({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl">Hello, {name}</h1>
      <p className="mt-2 text-muted">You are all set. The dashboard and camera arrive next.</p>
      <button onClick={() => supabase.auth.signOut()} className="mt-8 min-h-11 underline">Sign out</button>
    </main>
  )
}
