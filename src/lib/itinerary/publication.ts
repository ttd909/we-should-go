import { z } from 'zod'
import { itineraryBlockTypeSchema, itineraryTimeSourceSchema } from './schemas'

const publicBlockSchema = z.object({
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  duration_min: z.number().int().positive().nullable(),
  sort_order: z.number().int().nonnegative(),
  time_source: itineraryTimeSourceSchema,
  title: z.string().min(1).max(240),
  type: itineraryBlockTypeSchema,
  notes: z.string().max(4000).nullable(),
  is_locked: z.boolean(),
  timezone: z.string().max(100).nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  end_timezone: z.string().max(100).nullable(),
  address: z.string().max(2000).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).strict()

export const publicItinerarySnapshotSchema = z.object({
  schema_version: z.literal(1),
  trip: z.object({
    name: z.string().min(1).max(240),
    destination_city: z.string().nullable(),
    destination_country: z.string().nullable(),
    destination_region: z.string().nullable(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }).strict(),
  blocks: z.array(publicBlockSchema).max(1000),
}).strict()

export type PublicItinerarySnapshot = z.infer<typeof publicItinerarySnapshotSchema>
export type PublicItineraryBlock = z.infer<typeof publicBlockSchema>

export interface ItineraryPublicationStatus {
  share_slug: string
  source_version: number
  published_at: string
  is_active: boolean
}
