export type ReelPlatform = 'instagram' | 'tiktok' | 'other'
export type ReelStatus = 'inbox' | 'saved' | 'scheduled' | 'rejected' | 'needs_review'
export type PlaceType = 'cafe' | 'hotel' | 'restaurant' | 'viewpoint' | 'experience' | 'other'
export type TripStatus = 'idea' | 'planning' | 'booked' | 'completed'
export type AnchorType = 'flight' | 'hotel' | 'event' | 'reservation'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  personal_api_token: string
  created_at: string
}

export interface ReelSubmission {
  id: string
  submitted_by_user_id: string
  submitted_by_label: string | null
  platform: ReelPlatform
  url: string
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
  trip_id: string | null
  status: ReelStatus
  thumbnail_url: string | null
  created_at: string
}

export interface Trip {
  id: string
  name: string
  destination_city: string | null
  destination_country: string | null
  destination_region: string | null
  start_date: string | null
  end_date: string | null
  status: TripStatus
  created_by_user_id: string
  created_at: string
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
