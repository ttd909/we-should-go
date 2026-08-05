import { z } from 'zod'

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
export const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
const storedTimeStringSchema = z.string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/, 'Invalid stored time')
  .transform((value) => value.slice(0, 5))

export const travelPreferencesSchema = z.object({
  home_airport: z.string().trim().max(12).optional(),
  travellers: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  dietary_needs: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  preferred_pace: z.enum(['slow', 'balanced', 'busy']).optional(),
  walking_tolerance: z.enum(['low', 'medium', 'high']).optional(),
  transport_preferences: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  interests: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  recurring_requests: z.array(z.string().trim().min(1).max(240)).max(30).optional(),
  default_day_start: timeStringSchema.optional(),
  default_day_end: timeStringSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict()

export const itineraryBlockTypeSchema = z.enum([
  'place', 'meal', 'transit', 'flight', 'hotel', 'event', 'note',
])

export const itineraryTimeSourceSchema = z.enum(['pinned', 'estimated'])

export const openingHoursSchema = z.object({
  always_open: z.boolean().optional(),
  periods: z.array(z.object({
    open_day: z.number().int().min(0).max(6),
    open: timeStringSchema,
    close_day: z.number().int().min(0).max(6),
    close: timeStringSchema,
  }).strict()).max(100),
}).strict()

const allowedBlockFields = {
  title: z.string().trim().min(1).max(240),
  type: itineraryBlockTypeSchema,
  day_date: dateStringSchema,
  start_time: timeStringSchema.nullable(),
  duration_min: z.number().int().min(1).max(10080).nullable(),
  sort_order: z.number().int().min(0).max(10000),
  time_source: itineraryTimeSourceSchema,
  notes: z.string().trim().max(4000).nullable(),
  is_locked: z.boolean(),
  confirmation_ref: z.string().trim().max(500).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  timezone: z.string().trim().max(100).nullable(),
  end_date: dateStringSchema.nullable(),
  end_time: timeStringSchema.nullable(),
  end_timezone: z.string().trim().max(100).nullable(),
  reel_submission_id: z.string().uuid().nullable(),
} as const

export const newBlockInputSchema = z.object({
  ...allowedBlockFields,
  type: itineraryBlockTypeSchema.default('place'),
  start_time: timeStringSchema.nullable().default(null),
  duration_min: z.number().int().min(1).max(10080).nullable().default(null),
  sort_order: z.number().int().min(0).max(10000).default(0),
  time_source: itineraryTimeSourceSchema.default('estimated'),
  notes: z.string().trim().max(4000).nullable().default(null),
  is_locked: z.boolean().default(false),
  confirmation_ref: z.string().trim().max(500).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  timezone: z.string().trim().max(100).nullable().default(null),
  end_date: dateStringSchema.nullable().default(null),
  end_time: timeStringSchema.nullable().default(null),
  end_timezone: z.string().trim().max(100).nullable().default(null),
  reel_submission_id: z.string().uuid().nullable().default(null),
}).strict()

export const itineraryBlockSchema = z.object({
  id: z.string().uuid(),
  trip_id: z.string().uuid(),
  ...allowedBlockFields,
  start_time: storedTimeStringSchema.nullable(),
  end_time: storedTimeStringSchema.nullable(),
  google_place_id: z.string().max(500).nullable(),
  opening_hours: openingHoursSchema.nullable(),
  address: z.string().max(2000).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  created_by_user_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict()

export const mutableBlockFieldsSchema = z.object({
  title: allowedBlockFields.title.optional(),
  type: allowedBlockFields.type.optional(),
  start_time: allowedBlockFields.start_time.optional(),
  duration_min: allowedBlockFields.duration_min.optional(),
  time_source: allowedBlockFields.time_source.optional(),
  notes: allowedBlockFields.notes.optional(),
  is_locked: allowedBlockFields.is_locked.optional(),
  confirmation_ref: allowedBlockFields.confirmation_ref.optional(),
  confidence: allowedBlockFields.confidence.optional(),
  timezone: allowedBlockFields.timezone.optional(),
  end_date: allowedBlockFields.end_date.optional(),
  end_time: allowedBlockFields.end_time.optional(),
  end_timezone: allowedBlockFields.end_timezone.optional(),
  reel_submission_id: allowedBlockFields.reel_submission_id.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

const modelNewBlockSchema = z.object({
  title: allowedBlockFields.title,
  type: allowedBlockFields.type,
  day_date: allowedBlockFields.day_date,
  start_time: allowedBlockFields.start_time,
  duration_min: allowedBlockFields.duration_min,
  time_source: allowedBlockFields.time_source,
  notes: allowedBlockFields.notes,
  is_locked: allowedBlockFields.is_locked,
  confirmation_ref: allowedBlockFields.confirmation_ref,
  confidence: allowedBlockFields.confidence,
  idea_id: z.string().uuid().nullable(),
}).strict()

const modelChangesSchema = z.object({
  title: allowedBlockFields.title.nullable(),
  type: allowedBlockFields.type.nullable(),
  start_time: allowedBlockFields.start_time,
  duration_min: allowedBlockFields.duration_min,
  time_source: allowedBlockFields.time_source.nullable(),
  notes: allowedBlockFields.notes,
  is_locked: allowedBlockFields.is_locked.nullable(),
  confirmation_ref: allowedBlockFields.confirmation_ref,
  idea_id: z.string().uuid().nullable(),
}).strict()

export const proposedPatchSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_block'),
    client_ref: z.string().trim().min(1).max(80),
    block: modelNewBlockSchema,
  }).strict(),
  z.object({
    op: z.literal('update_block'),
    id: z.string().uuid(),
    changes: modelChangesSchema,
  }).strict(),
  z.object({
    op: z.literal('move_block'),
    id: z.string().uuid(),
    day_date: dateStringSchema.nullable(),
    start_time: timeStringSchema.nullable(),
  }).strict(),
  z.object({
    op: z.literal('remove_block'),
    id: z.string().uuid(),
  }).strict(),
  z.object({
    op: z.literal('reorder_day'),
    day_date: dateStringSchema,
    block_ids: z.array(z.string().uuid()).max(200),
  }).strict(),
])

export const proposedEditSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  patches: z.array(proposedPatchSchema).min(1).max(100),
}).strict()

const trustedBlockFieldsSchema = z.object({
  google_place_id: z.string().max(500).nullable(),
  opening_hours: openingHoursSchema.nullable(),
  address: z.string().max(2000).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).strict()

export const itineraryPatchSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_block'),
    id: z.string().uuid(),
    block: newBlockInputSchema,
    trusted: trustedBlockFieldsSchema.optional(),
  }).strict(),
  z.object({
    op: z.literal('update_block'),
    id: z.string().uuid(),
    changes: mutableBlockFieldsSchema,
  }).strict(),
  z.object({
    op: z.literal('move_block'),
    id: z.string().uuid(),
    day_date: dateStringSchema.optional(),
    start_time: timeStringSchema.nullable().optional(),
  }).strict(),
  z.object({ op: z.literal('remove_block'), id: z.string().uuid() }).strict(),
  z.object({
    op: z.literal('reorder_day'),
    day_date: dateStringSchema,
    block_ids: z.array(z.string().uuid()).max(200),
  }).strict(),
])

export const itineraryPatchListSchema = z.array(itineraryPatchSchema).min(1).max(200)

export type NewBlockInput = z.infer<typeof newBlockInputSchema>
export type MutableBlockFields = z.infer<typeof mutableBlockFieldsSchema>
export type ProposedPatch = z.infer<typeof proposedPatchSchema>
export type ProposedEdit = z.infer<typeof proposedEditSchema>
