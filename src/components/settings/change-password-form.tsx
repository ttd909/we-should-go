'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setPassword('')
      setConfirmPassword('')
      setMessage('Password updated. You can use it the next time you sign in.')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3 pt-2">
      <div className="space-y-2">
        <Label htmlFor="settings-password">New password</Label>
        <Input
          id="settings-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-confirm-password">Confirm new password</Label>
        <Input
          id="settings-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  )
}
