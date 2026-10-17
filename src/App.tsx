import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

type Me = { name: string; onboarded: boolean }

// Gate: must be signed in; `needOnboarded` decides which side of onboarding is allowed.
function Protected({ needOnboarded, children }: { needOnboarded: boolean; children: (me: Me) => ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [me, setMe] = useState<Me | null>(null)
  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    supabase
      .from('profiles')
      .select('display_name, user_settings(onboarded_at)')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        const s = data?.user_settings as { onboarded_at: string | null } | { onboarded_at: string | null }[] | null | undefined
        const onboardedAt = Array.isArray(s) ? s[0]?.onboarded_at : s?.onboarded_at
        setMe({ name: data?.display_name ?? '', onboarded: !!onboardedAt })
      })
  }, [uid])

  if (loading) return <p className="p-8">Loading…</p>
  if (!session) return <Navigate to="/signin" state={{ from: loc.pathname }} replace />
  if (!me) return <p className="p-8">Loading…</p>
  if (needOnboarded && !me.onboarded) return <Navigate to="/onboarding" replace />
  if (!needOnboarded && me.onboarded) return <Navigate to="/app" replace />
  return <>{children(me)}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<Auth mode="signin" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/forgot-password" element={<Auth mode="forgot" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboarding" element={<Protected needOnboarded={false}>{() => <Onboarding />}</Protected>} />
          <Route path="/app" element={<Protected needOnboarded>{(me) => <Dashboard name={me.name} />}</Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
