import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Field, Notice } from '../components/ui'

type Mode = 'signin' | 'signup' | 'forgot'
const titles: Record<Mode, string> = { signin: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password' }

export default function Auth({ mode }: { mode: Mode }) {
  const { session } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    const origin = window.location.origin
    let err
    if (mode === 'signin') {
      err = (await supabase.auth.signInWithPassword({ email, password })).error
    } else if (mode === 'signup') {
      const r = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/app` } })
      err = r.error
      // With email confirmation on, there is no session yet.
      if (!err && !r.data.session) setInfo('Check your inbox to confirm your email, then sign in.')
    } else {
      err = (await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` })).error
      if (!err) setInfo('If that email has an account, a reset link is on its way.')
    }
    if (err) setError(err.message)
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-8 font-serif text-xl font-semibold">Daily Moments</Link>
      <h1 className="font-serif text-3xl">{titles[mode]}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== 'forgot' && (
          <Field
            id="password"
            label="Password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {info && <Notice kind="ok">{info}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-6 space-x-4 text-sm text-muted">
        {mode !== 'signin' && <Link className="underline" to="/signin">Sign in</Link>}
        {mode !== 'signup' && <Link className="underline" to="/signup">Create account</Link>}
        {mode === 'signin' && <Link className="underline" to="/forgot-password">Forgot password?</Link>}
      </p>
    </main>
  )
}
