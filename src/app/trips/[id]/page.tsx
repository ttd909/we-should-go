import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { ItineraryBlock, ItineraryEditSet, Trip, TripChatMessage } from '@/lib/types'
import { ItineraryClient } from '@/components/itinerary/itinerary-client'
import { ChatPanel, type ChatMessageView } from '@/components/itinerary/chat-panel'
import type { PendingEditView } from '@/components/itinerary/pending-edit-card'

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:py-8">
      <Link href={`/trips?dreamlist=${trip.dreamlist_id}`} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to trips</Link>
      <header className="mb-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-700">Trip planner</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{trip.name}</h1>
            {destination && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" />{destination}</p>}
          </div>
          {trip.start_date && trip.end_date && <p className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-800">{trip.start_date} – {trip.end_date}</p>}
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ItineraryClient
          trip={trip}
          blocks={(blockData ?? []) as ItineraryBlock[]}
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
