'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItineraryBlock, ItineraryBlockType } from '@/lib/types'
import type { NewBlockInput } from '@/lib/itinerary/schemas'

const BLOCK_TYPES: Array<{ value: ItineraryBlockType; label: string }> = [
  { value: 'place', label: 'Place' }, { value: 'meal', label: 'Meal' },
  { value: 'event', label: 'Event' }, { value: 'hotel', label: 'Hotel' },
  { value: 'flight', label: 'Flight' }, { value: 'transit', label: 'Transit' },
  { value: 'note', label: 'Note' },
]

export function BlockEditor({
  block,
  defaultDate,
  busy,
  onCancel,
  onSave,
}: {
  block: ItineraryBlock | null
  defaultDate: string
  busy: boolean
  onCancel: () => void
  onSave: (block: NewBlockInput) => Promise<void>
}) {
  const [title, setTitle] = useState(block?.title ?? '')
  const [type, setType] = useState<ItineraryBlockType>(block?.type ?? 'place')
  const [dayDate, setDayDate] = useState(block?.day_date ?? defaultDate)
  const [startTime, setStartTime] = useState(block?.start_time?.slice(0, 5) ?? '')
  const [duration, setDuration] = useState(block?.duration_min?.toString() ?? '60')
  const [notes, setNotes] = useState(block?.notes ?? '')
  const [locked, setLocked] = useState(block?.is_locked ?? false)
  const [confirmation, setConfirmation] = useState(block?.confirmation_ref ?? '')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await onSave({
      title,
      type,
      day_date: dayDate,
      start_time: startTime || null,
      duration_min: duration ? Number(duration) : null,
      sort_order: block?.sort_order ?? 0,
      time_source: block?.time_source ?? 'estimated',
      notes: notes || null,
      is_locked: locked,
      confirmation_ref: confirmation || null,
      confidence: block?.confidence ?? null,
      timezone: block?.timezone ?? null,
      end_date: block?.end_date ?? null,
      end_time: block?.end_time?.slice(0, 5) ?? null,
      end_timezone: block?.end_timezone ?? null,
      reel_submission_id: block?.reel_submission_id ?? null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{block ? 'Edit itinerary item' : 'Add itinerary item'}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Close"><X /></Button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="block-title">Title</Label>
            <Input id="block-title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus maxLength={240} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-type">Type</Label>
            <select id="block-type" value={type} onChange={(event) => setType(event.target.value as ItineraryBlockType)} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
              {BLOCK_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="block-date">Date</Label>
              <Input id="block-date" type="date" value={dayDate} onChange={(event) => setDayDate(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-time">Start time</Label>
              <Input id="block-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <p className="text-[11px] text-muted-foreground">Leave empty for flexible timing.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-duration">Duration (minutes)</Label>
            <Input id="block-duration" type="number" min="1" max="10080" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-notes">Notes</Label>
            <textarea id="block-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={3} className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50" />
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} className="mt-0.5" />
            <span><span className="font-medium">Confirmed booking</span><br /><span className="text-xs text-muted-foreground">Protect this item from accidental changes.</span></span>
          </label>
          {locked && (
            <div className="space-y-1.5">
              <Label htmlFor="block-confirmation">Confirmation reference</Label>
              <Input id="block-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} maxLength={500} />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</Button>
        </div>
      </form>
    </div>
  )
}
