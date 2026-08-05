'use client'

import { useState } from 'react'
import { AlertTriangle, Check, LockKeyhole, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ItineraryIssue } from '@/lib/itinerary/validate'

export interface PendingEditView {
  id: string
  summary: string | null
  hard_conflicts: ItineraryIssue[]
  warnings: ItineraryIssue[]
  patches?: Array<{
    op: string
    id?: string
    block?: { title?: string; day_date?: string; start_time?: string | null; duration_min?: number | null; type?: string; confidence?: number | null; confirmation_ref?: string | null; is_locked?: boolean }
  }>
  source_image_url?: string | null
}

export type Resolution = 'apply_reviewed' | 'allow_warnings' | 'allow_overlap' | 'allow_locked' | 'allow_all_reviewed' | 'discard'

function maskReference(value: string): string {
  if (value.length <= 4) return '••••'
  return `${value.slice(0, 2)}${'•'.repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`
}

export function PendingEditCard({ edit, busy, onResolve }: {
  edit: PendingEditView
  busy: boolean
  onResolve: (editId: string, resolution: Resolution, selectedBlockIds?: string[]) => void
}) {
  const conflicts = edit.hard_conflicts ?? []
  const warnings = edit.warnings ?? []
  const hasOverlap = conflicts.some((issue) => issue.type === 'overlap')
  const hasLocked = conflicts.some((issue) => issue.type === 'locked_conflict')
  const extracted = (edit.patches ?? []).filter((patch) => patch.op === 'add_block' && patch.block)
  const [selected, setSelected] = useState(() => new Set(extracted.flatMap((patch) => patch.id ? [patch.id] : [])))
  return (
    <article className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Needs your decision</p>
          <p className="mt-1 text-sm">{edit.summary}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URL */}
          {edit.source_image_url && <img src={edit.source_image_url} alt="Source booking or travel image" className="mt-2 max-h-40 w-full rounded-lg object-cover" />}
          {extracted.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {extracted.map((patch, index) => <label key={patch.id ?? index} className="flex gap-2 rounded-lg border border-amber-200 bg-white/70 p-2 text-xs"><input type="checkbox" checked={patch.id ? selected.has(patch.id) : true} disabled={!patch.id || busy} onChange={(event) => { if (!patch.id) return; setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(patch.id!); else next.delete(patch.id!); return next }) }} className="mt-0.5" /><span><span className="font-medium">{patch.block?.title}</span><br />{[patch.block?.day_date, patch.block?.start_time, patch.block?.duration_min ? `${patch.block.duration_min} min` : null].filter(Boolean).join(' · ')}{patch.block?.confirmation_ref && <><br />Reference: {maskReference(patch.block.confirmation_ref)}</>}{patch.block?.confidence != null && <><br />Confidence: {Math.round(patch.block.confidence * 100)}%</>}</span></label>)}
            </div>
          )}
          <ul className="mt-2 space-y-1 text-xs">
            {[...conflicts, ...warnings].map((issue, index) => <li key={`${issue.type}-${index}`}>• {issue.message}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!conflicts.length && !warnings.length && <Button size="xs" onClick={() => onResolve(edit.id, 'apply_reviewed')} disabled={busy}><Check />Add to itinerary</Button>}
            {!conflicts.length && !warnings.length && extracted.length > 1 && selected.size < extracted.length && <Button size="xs" variant="outline" onClick={() => onResolve(edit.id, 'apply_reviewed', [...selected])} disabled={busy || selected.size === 0}><Check />Add selected ({selected.size})</Button>}
            {!conflicts.length && warnings.length > 0 && <Button size="xs" onClick={() => onResolve(edit.id, 'allow_warnings')} disabled={busy}><Check />Save anyway</Button>}
            {hasOverlap && <Button size="xs" onClick={() => onResolve(edit.id, 'allow_overlap')} disabled={busy}><Check />Allow overlap</Button>}
            {hasLocked && <Button size="xs" onClick={() => onResolve(edit.id, 'allow_locked')} disabled={busy}><LockKeyhole />Change booking</Button>}
            {hasOverlap && hasLocked && <Button size="xs" onClick={() => onResolve(edit.id, 'allow_all_reviewed')} disabled={busy}><Check />Apply both decisions</Button>}
            <Button size="xs" variant="outline" onClick={() => onResolve(edit.id, 'discard')} disabled={busy}><X />Discard</Button>
          </div>
        </div>
      </div>
    </article>
  )
}
