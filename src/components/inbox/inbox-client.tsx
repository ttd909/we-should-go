'use client'

import { useState, useMemo, useOptimistic, useTransition } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyIdeaToDreamlist, deleteReel, softRejectReel, unrejectReel, toggleFavourite, resolveNeedsReview } from '@/lib/actions/reels'
import { StatsStrip } from './stats-strip'
import { FilterChips, type FilterValue } from './filter-chips'
import { CountryGroup } from './country-group'
import { NeedsReviewSection } from './needs-review-section'
import { DetailDrawer } from './detail-drawer'
import { PlaceCard } from './place-card'
import type { Dreamlist, ReelSubmission, Trip } from '@/lib/types'

type OptimisticAction =
  | { type: 'reject';   id: string }
  | { type: 'unreject'; id: string }
  | { type: 'delete';   id: string }
  | { type: 'favourite'; id: string }
  | { type: 'resolve';  id: string; placeName: string }

type ViewMode = 'grouped' | 'all'

interface InboxClientProps {
  reels: ReelSubmission[]
  trips: Trip[]
  dreamlists: Dreamlist[]
  currentDreamlist: Dreamlist
}

export function InboxClient({ reels, trips, dreamlists, currentDreamlist }: InboxClientProps) {
  const [filter, setFilter]             = useState<FilterValue>('all')
  const [viewMode, setViewMode]         = useState<ViewMode>('grouped')
  const [showRejected, setShowRejected] = useState(false)
  const [activeReel, setActiveReel]     = useState<ReelSubmission | null>(null)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [copyMessage, setCopyMessage]   = useState<string | null>(null)
  const [, startTransition]             = useTransition()

  const [optimisticReels, dispatch] = useOptimistic(
    reels,
    (state: ReelSubmission[], action: OptimisticAction): ReelSubmission[] => {
      switch (action.type) {
        case 'reject':
          return state.map(r =>
            r.id === action.id ? { ...r, status: 'rejected' as const } : r,
          )
        case 'unreject':
          return state.map(r =>
            r.id === action.id ? { ...r, status: 'inbox' as const } : r,
          )
        case 'delete':
          return state.filter(r => r.id !== action.id)
        case 'favourite':
          return state.map(r =>
            r.id === action.id ? { ...r, is_favourite: !r.is_favourite } : r,
          )
        case 'resolve':
          return state.map(r =>
            r.id === action.id
              ? { ...r, status: 'inbox' as const, place_name: action.placeName }
              : r,
          )
        default:
          return state
      }
    },
  )

  // ── Derived data ──────────────────────────────────────────────────────────

  const { mainReels, needsReviewReels, rejectedReels, countryGroups, stats, submitters } =
    useMemo(() => {
      const main       = optimisticReels.filter(r => r.status !== 'needs_review' && r.status !== 'rejected')
      const needsRev   = optimisticReels.filter(r => r.status === 'needs_review')
      const rejected   = optimisticReels.filter(r => r.status === 'rejected')

      const filtered = main.filter(r => {
        if (filter === 'favourites')  return r.is_favourite
        if (filter === 'needs_review') return false
        if (filter !== 'all')         return (r.submitted_by_label ?? 'Me') === filter
        return true
      })

      // Group by country, sorted by card count desc
      const groupMap = new Map<string, ReelSubmission[]>()
      for (const r of filtered) {
        const key = r.destination_country ?? 'Unknown'
        const arr = groupMap.get(key) ?? []
        arr.push(r)
        groupMap.set(key, arr)
      }
      const groups = [...groupMap.entries()].sort((a, b) => b[1].length - a[1].length)

      // Stats (across all non-rejected reels)
      const nonRejected = optimisticReels.filter(r => r.status !== 'rejected')
      const countries   = new Set(nonRejected.map(r => r.destination_country).filter(Boolean))
      const favCount    = nonRejected.filter(r => r.is_favourite).length

      // Unique submitter labels
      const submitterSet = new Set<string>()
      for (const r of optimisticReels) {
        if (r.submitted_by_label) submitterSet.add(r.submitted_by_label)
      }

      return {
        mainReels:       filtered,
        needsReviewReels: needsRev,
        rejectedReels:   rejected,
        countryGroups:   groups,
        stats: { total: nonRejected.length, countries: countries.size, favourites: favCount },
        submitters:      [...submitterSet],
      }
    }, [optimisticReels, filter])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReject = (id: string) => {
    startTransition(async () => {
      dispatch({ type: 'reject', id })
      await softRejectReel(id)
    })
  }

  const handleUnreject = (id: string) => {
    startTransition(async () => {
      dispatch({ type: 'unreject', id })
      await unrejectReel(id)
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      dispatch({ type: 'delete', id })
      if (activeReel?.id === id) {
        setDrawerOpen(false)
        setActiveReel(null)
      }
      await deleteReel(id)
    })
  }

  const handleFavourite = (id: string) => {
    const reel = optimisticReels.find(r => r.id === id)
    if (!reel) return
    startTransition(async () => {
      dispatch({ type: 'favourite', id })
      await toggleFavourite(id, reel.is_favourite)
    })
    // Sync active drawer reel if open
    if (activeReel?.id === id) {
      setActiveReel(r => r ? { ...r, is_favourite: !r.is_favourite } : r)
    }
  }

  const handleResolve = (id: string, placeName: string) => {
    startTransition(async () => {
      dispatch({ type: 'resolve', id, placeName })
      await resolveNeedsReview(id, placeName)
    })
  }

  const handleCopyToDreamlist = (id: string, targetDreamlistId: string) => {
    const target = dreamlists.find((dreamlist) => dreamlist.id === targetDreamlistId)
    startTransition(async () => {
      await copyIdeaToDreamlist(id, targetDreamlistId)
      setCopyMessage(target ? `Copied to ${target.name}` : 'Copied to Dreamlist')
      setTimeout(() => setCopyMessage(null), 3000)
    })
  }

  const openDetail = (reel: ReelSubmission) => {
    setActiveReel(reel)
    setDrawerOpen(true)
  }

  const handleFilterSelect = (value: FilterValue) => {
    setFilter(value)
    if (value === 'needs_review') setViewMode('grouped')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = mainReels.length === 0 && needsReviewReels.length === 0

  return (
    <>
      <div className="space-y-5">
        {/* Stats strip */}
        <StatsStrip
          total={stats.total}
          countries={stats.countries}
          favourites={stats.favourites}
          onFilterClick={handleFilterSelect}
        />

        {/* Filter chips */}
        <FilterChips
          active={filter}
          submitters={submitters}
          needsReviewCount={needsReviewReels.length}
          onSelect={handleFilterSelect}
        />

        {copyMessage && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
            {copyMessage}
          </p>
        )}

        {/* View mode toggle */}
        {mainReels.length > 0 && (
          <div className="flex items-center justify-end gap-1 opacity-80">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                viewMode === 'grouped'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
              aria-label="Group by country"
              aria-pressed={viewMode === 'grouped'}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                viewMode === 'all'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
              aria-label="Show all ungrouped"
              aria-pressed={viewMode === 'all'}
            >
              <List className="size-4" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <p className="text-sm text-muted-foreground py-4">
            {filter !== 'all'
              ? 'No ideas match this filter.'
              : 'No ideas yet. Paste a TikTok or Instagram reel above to save your first one.'}
          </p>
        )}

        {/* ── Grouped view ── */}
        {viewMode === 'grouped' && mainReels.length > 0 && (
          <div className="space-y-6">
            {countryGroups.map(([country, groupReels]) => (
              <CountryGroup
                key={country}
                country={country}
                reels={groupReels}
                trips={trips}
                onReject={handleReject}
                onFavourite={(id) => handleFavourite(id)}
                onDelete={handleDelete}
                onCopy={handleCopyToDreamlist}
                copyTargets={dreamlists.filter((dreamlist) => dreamlist.id !== currentDreamlist.id)}
                currentDreamlistId={currentDreamlist.id}
                onOpen={openDetail}
              />
            ))}
          </div>
        )}

        {/* ── All (flat) view ── */}
        {viewMode === 'all' && mainReels.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mainReels.map((reel, i) => (
              <PlaceCard
                key={reel.id}
                reel={reel}
                index={i}
                onReject={() => handleReject(reel.id)}
                onFavourite={() => handleFavourite(reel.id)}
                onDelete={() => handleDelete(reel.id)}
                onCopy={(targetDreamlistId) => handleCopyToDreamlist(reel.id, targetDreamlistId)}
                copyTargets={dreamlists.filter((dreamlist) => dreamlist.id !== currentDreamlist.id)}
                onOpen={() => openDetail(reel)}
              />
            ))}
          </div>
        )}

        {/* ── Needs review section ── */}
        {needsReviewReels.length > 0 && (
          <NeedsReviewSection
            reels={needsReviewReels}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
        )}

        {/* ── Rejected section ── */}
        {rejectedReels.length > 0 && (
          <Collapsible.Root open={showRejected} onOpenChange={setShowRejected}>
            <Collapsible.Trigger
              className={cn(
                'flex items-center gap-1.5 text-xs text-muted-foreground',
                'hover:text-foreground transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:underline',
              )}
            >
              <ChevronDown
                className={cn(
                  'size-3 transition-transform duration-200',
                  showRejected && 'rotate-180',
                )}
              />
              {showRejected ? 'Hide rejected' : `Show rejected (${rejectedReels.length})`}
            </Collapsible.Trigger>

            <Collapsible.Panel className="collapsible-panel">
              <div className="grid grid-cols-1 gap-4 pt-3 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
                {rejectedReels.map((reel, i) => (
                  <div key={reel.id} className="relative">
                    <PlaceCard
                      reel={{ ...reel, status: 'inbox' }}
                      index={i}
                      onReject={() => {}}
                      onFavourite={() => {}}
                      onDelete={() => handleDelete(reel.id)}
                      onCopy={(targetDreamlistId) => handleCopyToDreamlist(reel.id, targetDreamlistId)}
                      copyTargets={dreamlists.filter((dreamlist) => dreamlist.id !== currentDreamlist.id)}
                      onOpen={() => openDetail(reel)}
                    />
                    <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                      <div className="pointer-events-auto flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUnreject(reel.id)}
                          className={cn(
                            'text-[10px] font-medium',
                            'bg-background/90 border border-border rounded-full px-2.5 py-1',
                            'hover:bg-muted transition-colors',
                          )}
                        >
                          Undo reject
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Permanently delete this idea?')) {
                              handleDelete(reel.id)
                            }
                          }}
                          className={cn(
                            'text-[10px] font-medium',
                            'bg-red-50/95 border border-red-100 text-red-600 rounded-full px-2.5 py-1',
                            'hover:bg-red-100 transition-colors',
                          )}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        reel={activeReel}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onFavourite={activeReel ? () => handleFavourite(activeReel.id) : undefined}
        onDelete={activeReel ? () => handleDelete(activeReel.id) : undefined}
      />
    </>
  )
}
