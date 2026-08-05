'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarDays, Plus, Printer, Undo2 } from 'lucide-react'
import { deleteItineraryBlock, reorderItineraryDay, saveItineraryBlock, undoItineraryEdit } from '@/lib/actions/itinerary'
import type { ItineraryActionResult } from '@/lib/itinerary/action-types'
import type { NewBlockInput } from '@/lib/itinerary/schemas'
import type { ItineraryBlock, Trip } from '@/lib/types'
import { datesBetween } from '@/lib/itinerary/time'
import { Button } from '@/components/ui/button'
import { BlockEditor } from './block-editor'
import { BlockRow } from './block-row'
import { TravelPreferencesForm } from './travel-preferences-form'

interface LatestEdit { id: string; summary: string | null }

function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))
}

function issueText(result: Extract<ItineraryActionResult, { ok: false }>): string {
  const issues = [...(result.conflicts ?? []), ...(result.warnings ?? [])]
  return issues.length ? issues.map((issue) => `• ${issue.message}`).join('\n') : result.message
}

export function ItineraryClient({
  trip,
  blocks,
  latestEdit,
}: {
  trip: Trip
  blocks: ItineraryBlock[]
  latestEdit: LatestEdit | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [version, setVersion] = useState(trip.version)
  const [editor, setEditor] = useState<{ block: ItineraryBlock | null; date: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const days = useMemo(() => {
    const dated = trip.start_date && trip.end_date ? datesBetween(trip.start_date, trip.end_date) : []
    const blockDays = blocks.map((block) => block.day_date)
    return [...new Set([...dated, ...blockDays])].sort()
  }, [blocks, trip.start_date, trip.end_date])
  const defaultDate = trip.start_date ?? days[0] ?? new Date().toISOString().slice(0, 10)

  async function finish(result: ItineraryActionResult) {
    if (result.ok) {
      setVersion(result.version)
      setError(null)
      setEditor(null)
      router.refresh()
      return true
    }
    if (result.code === 'stale') router.refresh()
    setError(issueText(result))
    return false
  }

  function save(block: NewBlockInput): Promise<void> {
    const requestId = crypto.randomUUID()
    return new Promise((resolve) => {
      startTransition(async () => {
        const base = {
          tripId: trip.id, blockId: editor?.block?.id ?? null, block,
          expectedVersion: version, clientRequestId: requestId,
          allowWarnings: false, allowLocked: false,
        }
        let result = await saveItineraryBlock(base)
        if (!result.ok && result.conflicts?.length && result.conflicts.every((issue) => issue.type === 'locked_conflict')) {
          if (window.confirm(`${issueText(result)}\n\nChange this confirmed booking?`)) {
            result = await saveItineraryBlock({ ...base, allowLocked: true })
          }
        }
        if (!result.ok && !result.conflicts?.length && result.warnings?.length) {
          if (window.confirm(`${issueText(result)}\n\nSave anyway?`)) {
            result = await saveItineraryBlock({ ...base, allowLocked: true, allowWarnings: true })
          }
        }
        await finish(result)
        resolve()
      })
    })
  }

  function remove(block: ItineraryBlock) {
    if (!window.confirm(`Remove “${block.title}” from the itinerary?`)) return
    const requestId = crypto.randomUUID()
    startTransition(async () => {
      const base = {
        tripId: trip.id, blockId: block.id, expectedVersion: version,
        clientRequestId: requestId, allowWarnings: false, allowLocked: false,
      }
      let result = await deleteItineraryBlock(base)
      let allowLocked = false
      if (!result.ok && result.conflicts?.every((issue) => issue.type === 'locked_conflict') && window.confirm(`${issueText(result)}\n\nRemove it anyway?`)) {
        allowLocked = true
        result = await deleteItineraryBlock({ ...base, allowLocked: true })
      }
      if (!result.ok && !result.conflicts?.length && result.warnings?.length && window.confirm(`${issueText(result)}\n\nRemove the item anyway?`)) {
        result = await deleteItineraryBlock({ ...base, allowLocked, allowWarnings: true })
      }
      await finish(result)
    })
  }

  function undo() {
    if (!latestEdit) return
    const requestId = crypto.randomUUID()
    startTransition(async () => {
      const base = {
        tripId: trip.id, editId: latestEdit.id, expectedVersion: version,
        clientRequestId: requestId, allowWarnings: false, allowLocked: false,
      }
      let result = await undoItineraryEdit(base)
      if (!result.ok && result.conflicts?.every((issue) => issue.type === 'locked_conflict') && window.confirm(`${issueText(result)}\n\nUndo this confirmed change?`)) {
        result = await undoItineraryEdit({ ...base, allowLocked: true, allowWarnings: true })
      } else if (!result.ok && !result.conflicts?.length && result.warnings?.length && window.confirm(`${issueText(result)}\n\nUndo anyway?`)) {
        result = await undoItineraryEdit({ ...base, allowWarnings: true })
      }
      await finish(result)
    })
  }

  function reorder(day: string, ordered: ItineraryBlock[], targetId: string) {
    if (!draggedId || draggedId === targetId) return
    const ids = ordered.map((block) => block.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    const requestId = crypto.randomUUID()
    startTransition(async () => {
      const result = await reorderItineraryDay({
        tripId: trip.id, expectedVersion: version, clientRequestId: requestId,
        dayDate: day, blockIds: ids, allowWarnings: true, allowLocked: false,
      })
      setDraggedId(null)
      await finish(result)
    })
  }

  return (
    <div className="space-y-6">
      <TravelPreferencesForm tripId={trip.id} initial={trip.travel_preferences ?? {}} />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-line">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Your itinerary</h2>
          <p className="text-xs text-muted-foreground">Flexible items can be scheduled later.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden"><Printer />Print</Button>
          {latestEdit && (
            <Button variant="outline" size="sm" onClick={undo} disabled={pending} title={latestEdit.summary ?? 'Undo latest change'}><Undo2 />Undo</Button>
          )}
          <Button size="sm" onClick={() => setEditor({ block: null, date: defaultDate })} disabled={pending}><Plus />Add item</Button>
        </div>
      </div>

      {days.length > 1 && (
        <nav className="sticky top-12 z-20 -mx-2 flex gap-1 overflow-x-auto border-y border-sky-100 bg-background/95 px-2 py-2 backdrop-blur xl:hidden print:hidden" aria-label="Trip days">
          {days.map((day, index) => <a key={day} href={`#day-${day}`} className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">Day {index + 1}</a>)}
        </nav>
      )}

      {days.length === 0 && blocks.length === 0 ? (
        <button type="button" onClick={() => setEditor({ block: null, date: defaultDate })} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 px-5 py-12 text-center">
          <CalendarDays className="mb-3 size-8 text-sky-600" />
          <span className="font-medium">Start planning this trip</span>
          <span className="mt-1 text-sm text-muted-foreground">Add a place, meal, booking, flight or note.</span>
        </button>
      ) : (
        <div className="space-y-8">
          {days.map((day) => {
            const dayBlocks = blocks.filter((block) => block.day_date === day)
              .sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.sort_order - b.sort_order)
            return (
              <section key={day} id={`day-${day}`} className="scroll-mt-16 space-y-3 break-inside-avoid">
                <div className="flex items-center justify-between border-b border-sky-200 pb-2">
                  <div><h3 className="font-semibold text-slate-800">{formatDay(day)}</h3><p className="text-xs text-muted-foreground">{day}</p></div>
                  <Button variant="ghost" size="sm" onClick={() => setEditor({ block: null, date: day })}><Plus />Add</Button>
                </div>
                {dayBlocks.length ? (
                  <div className="space-y-2">{dayBlocks.map((block) => <BlockRow key={block.id} block={block} busy={pending} onEdit={(value) => setEditor({ block: value, date: value.day_date })} onDelete={remove} onDragStart={() => setDraggedId(block.id)} onDrop={() => reorder(day, dayBlocks, block.id)} />)}</div>
                ) : <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nothing planned yet.</p>}
              </section>
            )
          })}
        </div>
      )}

      {editor && <BlockEditor key={editor.block?.id ?? `new-${editor.date}`} block={editor.block} defaultDate={editor.date} busy={pending} onCancel={() => setEditor(null)} onSave={save} />}
    </div>
  )
}
