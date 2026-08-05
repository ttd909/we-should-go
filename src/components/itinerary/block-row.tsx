'use client'

import { Clock3, GripVertical, LockKeyhole, MapPin, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ItineraryBlock } from '@/lib/types'

const TYPE_LABEL: Record<ItineraryBlock['type'], string> = {
  place: 'Place', meal: 'Meal', transit: 'Transit', flight: 'Flight', hotel: 'Hotel',
  event: 'Event', note: 'Note',
}

export function BlockRow({
  block,
  onEdit,
  onDelete,
  busy,
  onDragStart,
  onDrop,
}: {
  block: ItineraryBlock
  onEdit: (block: ItineraryBlock) => void
  onDelete: (block: ItineraryBlock) => void
  busy: boolean
  onDragStart?: () => void
  onDrop?: () => void
}) {
  return (
    <article draggable={!busy} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="group rounded-xl border border-border/80 bg-card p-3 shadow-sm transition-colors hover:border-sky-300">
      <div className="flex items-start gap-3">
        <GripVertical className="mt-1 hidden size-4 cursor-grab text-muted-foreground sm:block print:hidden" aria-label="Drag to reorder" />
        <div className="w-14 shrink-0 pt-0.5 text-sm font-semibold text-sky-700">
          {block.start_time?.slice(0, 5) ?? 'Anytime'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-medium leading-5">{block.title}</h3>
            {block.is_locked && <LockKeyhole className="size-3.5 text-amber-600" aria-label="Confirmed" />}
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              {TYPE_LABEL[block.type]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {block.duration_min && (
              <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{block.duration_min} min</span>
            )}
            {block.address && (
              <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" />{block.address}</span>
            )}
            {block.confirmation_ref && <span>Ref: {block.confirmation_ref}</span>}
            {block.end_date && block.end_time && (
              <span>Arrives {block.end_date} at {block.end_time.slice(0, 5)}{block.end_timezone ? ` (${block.end_timezone})` : ''}</span>
            )}
            {block.timezone && <span>{block.timezone}</span>}
          </div>
          {block.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{block.notes}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => onEdit(block)} disabled={busy} aria-label={`Edit ${block.title}`}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onDelete(block)} disabled={busy} aria-label={`Delete ${block.title}`}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>
    </article>
  )
}
