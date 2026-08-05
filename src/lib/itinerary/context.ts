import type { ItineraryBlock, ReelSubmission, TravelPreferences, Trip, TripChatMessage } from '@/lib/types'
import { ITINERARY_CONTEXT_LIMITS } from './prompt'

interface ContextInput {
  trip: Trip
  dreamlistPreferences: TravelPreferences
  blocks: ItineraryBlock[]
  ideas: ReelSubmission[]
  messages: TripChatMessage[]
  instruction: string
}

export function buildItineraryContext(input: ContextInput) {
  const scheduledIdeaIds = new Set(input.blocks.map((block) => block.reel_submission_id).filter(Boolean))
  const ideas = input.ideas
    .filter((idea) => idea.status !== 'rejected' && !scheduledIdeaIds.has(idea.id))
    .sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || b.created_at.localeCompare(a.created_at))
    .slice(0, ITINERARY_CONTEXT_LIMITS.ideas)
    .map((idea) => ({
      id: idea.id,
      name: idea.place_name,
      city: idea.destination_city,
      country: idea.destination_country,
      type: idea.place_type,
      notes: idea.notes,
      priority: idea.priority,
      has_trusted_place_match: Boolean(idea.google_place_id),
    }))

  return {
    trip: {
      id: input.trip.id,
      name: input.trip.name,
      destination_city: input.trip.destination_city,
      destination_country: input.trip.destination_country,
      start_date: input.trip.start_date,
      end_date: input.trip.end_date,
      version: input.trip.version,
    },
    preferences: { ...input.dreamlistPreferences, ...input.trip.travel_preferences },
    blocks: input.blocks.slice(0, ITINERARY_CONTEXT_LIMITS.blocks).map((block) => ({
      id: block.id,
      date: block.day_date,
      start_time: block.start_time,
      duration_min: block.duration_min,
      title: block.title,
      type: block.type,
      notes: block.notes,
      is_locked: block.is_locked,
      confirmation_ref: block.confirmation_ref,
      idea_id: block.reel_submission_id,
      address: block.address,
    })),
    available_ideas: ideas,
    recent_chat: input.messages.slice(-ITINERARY_CONTEXT_LIMITS.chatMessages).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    current_instruction: input.instruction,
  }
}
