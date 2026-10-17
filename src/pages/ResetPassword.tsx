import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Field, Notice } from '../components/ui'

// Reached from the email link; supabase-js turns the link into a recovery session.
export default function ResetPassword() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else nav('/app', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-serif text-3xl">Choose a new password</h1>
      {!loading && !session ? (
        <div className="mt-6 space-y-4">
          <Notice kind="error">This reset link is invalid or has expired.</Notice>
          <Link className="underline" to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field id="pw" label="New password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Update password'}</Button>
        </form>
      )}
    </main>
  )
}
