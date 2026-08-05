export type ReelPlatform = 'instagram' | 'tiktok' | 'facebook' | 'other'
export type ReelStatus = 'inbox' | 'saved' | 'scheduled' | 'rejected' | 'needs_review'
export type PlaceType = 'cafe' | 'hotel' | 'restaurant' | 'viewpoint' | 'experience' | 'other'
export type TripStatus = 'idea' | 'planning' | 'booked' | 'completed'
export type AnchorType = 'flight' | 'hotel' | 'event' | 'reservation'
export type DreamlistType = 'personal' | 'shared'
export type DreamlistMemberRole = 'owner' | 'member'
export type IdeaPriority = 'normal' | 'high'
export type ItineraryBlockType = 'place' | 'meal' | 'transit' | 'flight' | 'hotel' | 'event' | 'note'
export type ItineraryTimeSource = 'pinned' | 'estimated'
export type ItineraryEditStatus = 'pending' | 'applied' | 'rejected' | 'undone'

export interface TravelPreferences {
  home_airport?: string
  travellers?: string[]
  dietary_needs?: string[]
  preferred_pace?: 'slow' | 'balanced' | 'busy'
  walking_tolerance?: 'low' | 'medium' | 'high'
  transport_preferences?: string[]
  interests?: string[]
  recurring_requests?: string[]
  default_day_start?: string
  default_day_end?: string
  notes?: string
}

export interface OpeningHours {
  always_open?: boolean
  periods: Array<{
    open_day: number
    open: string
    close_day: number
    close: string
  }>
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  personal_api_token: string
  created_at: string
}

export interface ReelSubmission {
  id: string
  dreamlist_id: string
  submitted_by_user_id: string
  submitted_by_label: string | null
  platform: ReelPlatform
  url: string
  url_hash?: string | null
  caption_text: string | null
  notes: string | null
  place_name: string | null
  google_place_id: string | null
  google_photo_name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  destination_city: string | null
  destination_country: string | null
  destination_region: string | null
  place_type: PlaceType | null
  tags: string[]
  is_favourite: boolean
  confidence: number | null
  priority: IdeaPriority
  trip_id: string | null
  status: ReelStatus
  thumbnail_url: string | null
  source_idea_id: string | null
  copied_from_dreamlist_id: string | null
  copied_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface Trip {
  id: string
  dreamlist_id: string
  name: string
  destination_city: string | null
  destination_country: string | null
  destination_region: string | null
  start_date: string | null
  end_date: string | null
  status: TripStatus
  created_by_user_id: string
  created_at: string
  updated_at: string
  version: number
  travel_preferences: TravelPreferences
}

export interface TripMember {
  trip_id: string
  user_id: string
}

export interface TripAnchor {
  id: string
  trip_id: string
  type: AnchorType
  title: string
  start_at: string | null
  end_at: string | null
  location: string | null
  notes: string | null
  created_at: string
}

export interface TripDay {
  id: string
  trip_id: string
  date: string
  scheduled_items: string[]
}

export interface Dreamlist {
  id: string
  name: string
  type: DreamlistType
  owner_id: string
  created_at: string
  updated_at: string
  travel_preferences: TravelPreferences
}

export interface ItineraryBlock {
  id: string
  trip_id: string
  day_date: string
  start_time: string | null
  duration_min: number | null
  sort_order: number
  time_source: ItineraryTimeSource
  title: string
  type: ItineraryBlockType
  notes: string | null
  is_locked: boolean
  confirmation_ref: string | null
  confidence: number | null
  timezone: string | null
  end_date: string | null
  end_time: string | null
  end_timezone: string | null
  reel_submission_id: string | null
  google_place_id: string | null
  opening_hours: OpeningHours | null
  address: string | null
  latitude: number | null
  longitude: number | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface TripChatMessage {
  id: string
  trip_id: string
  role: 'user' | 'assistant'
  content: string | null
  image_path: string | null
  error_message: string | null
  reply_to_message_id: string | null
  client_request_id: string | null
  created_by_user_id: string | null
  created_at: string
}

export interface ItineraryEditSet {
  id: string
  trip_id: string
  source_message_id: string | null
  client_request_id: string
  expected_version: number
  status: ItineraryEditStatus
  summary: string | null
  patches: unknown[]
  inverse_patches: unknown[]
  hard_conflicts: unknown[]
  warnings: unknown[]
  warning_overrides: unknown[]
  undoes_edit_id: string | null
  created_by_user_id: string | null
  applied_at: string | null
  undone_at: string | null
  created_at: string
  updated_at: string
}

export interface DreamlistMember {
  id: string
  dreamlist_id: string
  user_id: string
  role: DreamlistMemberRole
  created_at: string
}

export interface DreamlistInvite {
  id: string
  dreamlist_id: string
  token: string
  invited_by_user_id: string
  expires_at: string | null
  used_at: string | null
  created_at: string
}
