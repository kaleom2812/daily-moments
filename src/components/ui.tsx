import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50 ${className}`}
    />
  )
}

export function Field({ label, hint, id, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input id={id} {...p} className="min-h-11 w-full rounded-xl border border-line bg-white px-4 text-base" />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-sm ${kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
    >
      {children}
    </p>
  )
}
