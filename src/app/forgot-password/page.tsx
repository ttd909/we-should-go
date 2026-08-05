'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/'
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, '')
    const resetPath = `/reset-password?next=${encodeURIComponent(next)}`
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(resetPath)}`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Set or reset your password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            If you previously used magic links, use the same email address here to create your password.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm">
              If an account exists for <span className="font-medium">{email}</span>, a password reset email is on its way.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="text-sm font-medium text-sky-700 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send password reset email'}
            </Button>
            <p className="text-center">
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="text-sm text-sky-700 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
