'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, EyeOff, Globe2, RefreshCw } from 'lucide-react'
import { publishItinerary, unpublishItinerary } from '@/lib/actions/publish-itinerary'
import type { ItineraryPublicationStatus } from '@/lib/itinerary/publication'
import { Button, buttonVariants } from '@/components/ui/button'

function publishedLabel(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function PublicationControls({
  tripId,
  tripVersion,
  initialPublication,
}: {
  tripId: string
  tripVersion: number
  initialPublication: ItineraryPublicationStatus | null
}) {
  const [publication, setPublication] = useState(initialPublication)
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = Boolean(publication?.is_active)
  const hasUnpublishedChanges = active && publication!.source_version !== tripVersion
  const path = publication ? `/itinerary/${publication.share_slug}` : null

  function publish() {
    if (!active && !window.confirm(
      'Create a public itinerary link? Anyone with the link can view the published snapshot without signing in. Known booking references are hidden, but your itinerary notes are included.',
    )) return

    startTransition(async () => {
      setError(null)
      const result = await publishItinerary({ tripId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPublication({
        share_slug: result.shareSlug,
        source_version: result.sourceVersion,
        published_at: result.publishedAt,
        is_active: true,
      })
    })
  }

  function copyLink() {
    if (!path) return
    const url = `${window.location.origin}${path}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }).catch(() => setError('Could not copy automatically. Open the page and copy its address.'))
  }

  function unpublish() {
    if (!window.confirm('Disable this public link? Anyone currently using it will see that the itinerary is unavailable.')) return
    startTransition(async () => {
      setError(null)
      const result = await unpublishItinerary({ tripId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPublication((value) => value ? { ...value, is_active: false } : value)
    })
  }

  return (
    <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/75 p-3.5 shadow-sm print:hidden sm:p-4" aria-label="Public itinerary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-emerald-950">Public mobile itinerary</h2>
            {active && !hasUnpublishedChanges && <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">Up to date</span>}
            {hasUnpublishedChanges && <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">Changes not published</span>}
          </div>
          <p className="mt-1 text-xs text-emerald-900/75">
            {active && publication
              ? `Anyone with the link sees the snapshot published ${publishedLabel(publication.published_at)}.`
              : 'Create a read-only link that works without an account. It changes only when you publish.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && path && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={copyLink} disabled={pending} className="bg-white/80">
                {copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy link'}
              </Button>
              <Link href={path} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'bg-white/80' })}><ExternalLink />Open</Link>
            </>
          )}
          <Button type="button" size="sm" onClick={publish} disabled={pending}>
            {active ? <RefreshCw /> : <Globe2 />}
            {pending ? 'Publishing…' : active ? 'Publish update' : publication ? 'Restore public link' : 'Publish itinerary'}
          </Button>
          {active && (
            <Button type="button" variant="ghost" size="sm" onClick={unpublish} disabled={pending} className="text-emerald-950/70 hover:text-destructive">
              <EyeOff />Disable link
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-destructive" role="alert">{error}</p>}
    </section>
  )
}
