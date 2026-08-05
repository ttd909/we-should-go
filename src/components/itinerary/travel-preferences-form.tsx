'use client'

import { useState, useTransition } from 'react'
import { saveDreamlistTravelPreferences, saveTravelPreferences } from '@/lib/actions/travel-preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TravelPreferences } from '@/lib/types'

function csv(value: string): string[] | undefined {
  const values = value.split(',').map((item) => item.trim()).filter(Boolean)
  return values.length ? values : undefined
}

export function TravelPreferencesForm({ tripId, dreamlistId, initial }: { tripId?: string; dreamlistId?: string; initial: TravelPreferences }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [homeAirport, setHomeAirport] = useState(initial.home_airport ?? '')
  const [pace, setPace] = useState(initial.preferred_pace ?? 'balanced')
  const [dietary, setDietary] = useState(initial.dietary_needs?.join(', ') ?? '')
  const [interests, setInterests] = useState(initial.interests?.join(', ') ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')

  function save(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const preferences = {
          ...initial,
          home_airport: homeAirport || undefined,
          preferred_pace: pace as 'slow' | 'balanced' | 'busy',
          dietary_needs: csv(dietary),
          interests: csv(interests),
          notes: notes || undefined,
        }
      const result = tripId
        ? await saveTravelPreferences({ tripId, preferences })
        : await saveDreamlistTravelPreferences({ dreamlistId, preferences })
      setMessage(result.ok ? 'Preferences saved.' : result.message)
    })
  }

  return (
    <section className="rounded-xl border border-border/80 bg-card">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between p-4 text-left">
        <span><span className="block text-sm font-medium">{tripId ? 'Trip preferences' : 'Family travel preferences'}</span><span className="block text-xs text-muted-foreground">Used for itinerary suggestions and warnings.</span></span>
        <span className="text-sm text-sky-700">{open ? 'Close' : 'Edit'}</span>
      </button>
      {open && (
        <form onSubmit={save} className="space-y-4 border-t p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="home-airport">Home airport</Label><Input id="home-airport" value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} placeholder="SYD" /></div>
            <div className="space-y-1.5"><Label htmlFor="pace">Preferred pace</Label><select id="pace" value={pace} onChange={(e) => setPace(e.target.value as 'slow' | 'balanced' | 'busy')} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"><option value="slow">Slow</option><option value="balanced">Balanced</option><option value="busy">Busy</option></select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dietary">Dietary needs</Label><Input id="dietary" value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="Vegetarian, nut allergy" /><p className="text-[11px] text-muted-foreground">Separate items with commas.</p></div>
          <div className="space-y-1.5"><Label htmlFor="interests">Interests</Label><Input id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Cafes, markets, architecture" /></div>
          <div className="space-y-1.5"><Label htmlFor="preference-notes">Other notes</Label><textarea id="preference-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm" /></div>
          <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save preferences'}</Button>{message && <p className="text-xs text-muted-foreground">{message}</p>}</div>
        </form>
      )}
    </section>
  )
}
