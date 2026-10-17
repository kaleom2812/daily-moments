import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Field, Notice } from '../components/ui'

// Single-user app: sign-in only. The one account is created in the Supabase dashboard.
export default function Auth() {
  const { session } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-8 font-serif text-xl font-semibold">Daily Moments</Link>
      <h1 className="font-serif text-3xl">Welcome back</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Please wait…' : 'Sign in'}</Button>
      </form>
    </main>
  )
}
