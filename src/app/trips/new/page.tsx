'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TripStatus } from '@/lib/types'

interface FormState {
  name: string
  destination_country: string
  destination_city: string
  destination_region: string
  start_date: string
  end_date: string
}

function NewTripForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillCountry = searchParams.get('destination_country') ?? ''
  const dreamlistId = searchParams.get('dreamlist')

  const [form, setForm] = useState<FormState>({
    name: '',
    destination_country: prefillCountry,
    destination_city: '',
    destination_region: '',
    start_date: '',
    end_date: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email ?? null },
        { onConflict: 'id' }
      )

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    // A trip without dates starts as 'idea'; add dates and it becomes 'planning'
    const status: TripStatus = form.start_date ? 'planning' : 'idea'

    if (!dreamlistId) {
      setError('Choose a Dreamlist before creating a trip.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('trips').insert({
      dreamlist_id: dreamlistId,
      name: form.name,
      destination_city: form.destination_city || null,
      destination_country: form.destination_country || null,
      destination_region: form.destination_region || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status,
      created_by_user_id: user.id,
    }).select('id').single()

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(`/trips?dreamlist=${dreamlistId}`)
      router.refresh()
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">New trip</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Trip name *</Label>
          <Input
            id="name"
            placeholder="Japan 2027"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destination_country">Country</Label>
          <Input
            id="destination_country"
            placeholder="Japan"
            value={form.destination_country}
            onChange={(e) => set('destination_country', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destination_city">City</Label>
          <Input
            id="destination_city"
            placeholder="Tokyo"
            value={form.destination_city}
            onChange={(e) => set('destination_city', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destination_region">Region</Label>
          <Input
            id="destination_region"
            placeholder="Southeast Asia"
            value={form.destination_region}
            onChange={(e) => set('destination_region', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start_date">Start date</Label>
            <Input
              id="start_date"
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">End date</Label>
            <Input
              id="end_date"
              type="date"
              value={form.end_date}
              onChange={(e) => set('end_date', e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Dates are optional - a trip without dates is saved as a future idea.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create trip'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </main>
  )
}

export default function NewTripPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-lg mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-6">New trip</h1>
        </main>
      }
    >
      <NewTripForm />
    </Suspense>
  )
}
