import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CalendarRange, CheckCircle2, ListChecks, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { ItineraryBlock, ItineraryEditSet, Trip, TripChatMessage } from '@/lib/types'
import { ItineraryClient } from '@/components/itinerary/itinerary-client'
import { ChatPanel, type ChatMessageView } from '@/components/itinerary/chat-panel'
import type { PendingEditView } from '@/components/itinerary/pending-edit-card'
import { DayNavigator } from '@/components/itinerary/day-navigator'
import { datesBetween } from '@/lib/itinerary/time'

export const dynamic = 'force-dynamic'

export default async function TripItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: tripData, error: tripError },
    { data: blockData, error: blockError },
    { data: editData },
    { data: messageData },
    { data: pendingData },
  ] = await Promise.all([
    supabase.from('trips').select('*').eq('id', id).single(),
    supabase.from('itinerary_blocks').select('*').eq('trip_id', id).order('day_date').order('start_time').order('sort_order'),
    supabase.from('itinerary_edit_sets').select('id,summary').eq('trip_id', id).eq('status', 'applied').order('applied_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('trip_chat_messages').select('*').eq('trip_id', id).order('created_at', { ascending: false }).limit(30),
    supabase.from('itinerary_edit_sets').select('id,summary,hard_conflicts,warnings,patches,source_message_id').eq('trip_id', id).eq('status', 'pending').order('created_at', { ascending: true }),
  ])

  if (tripError || !tripData) notFound()
  if (blockError) throw new Error(`Could not load itinerary: ${blockError.message}`)
  const trip = tripData as Trip
  const destination = [trip.destination_city, trip.destination_country].filter(Boolean).join(', ')
  const chatMessages = ((messageData ?? []) as TripChatMessage[]).reverse()
  const imagePaths = chatMessages.flatMap((message) => message.image_path ? [message.image_path] : [])
  const { data: signedImages } = imagePaths.length
    ? await supabase.storage.from('trip-chat-images').createSignedUrls(imagePaths, 3600)
    : { data: [] }
  const signedByPath = new Map((signedImages ?? []).map((image) => [image.path, image.signedUrl]))
  const messageViews: ChatMessageView[] = chatMessages.map((message) => ({
    ...message,
    image_url: message.image_path ? signedByPath.get(message.image_path) ?? null : null,
  }))
  const messageById = new Map(messageViews.map((message) => [message.id, message]))
  const pendingViews = (pendingData ?? []).map((edit) => ({
    ...edit,
    source_image_url: edit.source_message_id
      ? messageById.get(edit.source_message_id)?.image_url ?? null
      : null,
  })) as PendingEditView[]
  const blocks = (blockData ?? []) as ItineraryBlock[]
  const dayCount = trip.start_date && trip.end_date
    ? datesBetween(trip.start_date, trip.end_date).length
    : new Set(blocks.map((block) => block.day_date)).size
  const confirmedCount = blocks.filter((block) => block.is_locked).length

  return (
    <main className="mx-auto w-full max-w-[1800px] px-4 py-5 pb-24 lg:px-6 2xl:px-8 print:max-w-none print:px-0">
      <Link href={`/trips?dreamlist=${trip.dreamlist_id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"><ArrowLeft className="size-4" />Back to trips</Link>
      <header className="mb-5 rounded-2xl border border-sky-100 bg-white/70 px-4 py-4 shadow-sm backdrop-blur sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-700">Trip planner</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{trip.name}</h1>
            {destination && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" />{destination}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {trip.start_date && trip.end_date && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 font-medium text-sky-800"><CalendarRange className="size-3.5" />{trip.start_date} – {trip.end_date}</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700"><ListChecks className="size-3.5" />{dayCount} days · {blocks.length} plans</span>
            {confirmedCount > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 font-medium text-amber-800"><CheckCircle2 className="size-3.5" />{confirmedCount} confirmed</span>}
          </div>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[15rem_minmax(32rem,1fr)_24rem] 2xl:gap-6">
        <DayNavigator trip={trip} blocks={blocks} />
        <ItineraryClient
          trip={trip}
          blocks={blocks}
          latestEdit={(editData as Pick<ItineraryEditSet, 'id' | 'summary'> | null) ?? null}
        />
        <ChatPanel
          tripId={trip.id}
          version={trip.version}
          currentUserId={user.id}
          messages={messageViews}
          pendingEdits={pendingViews}
        />
      </div>
    </main>
  )
}
