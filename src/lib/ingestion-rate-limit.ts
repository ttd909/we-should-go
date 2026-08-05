import { createAdminClient } from '@/lib/supabase/admin'

const MAX_NEW_REELS_PER_MINUTE = 10
const MAX_NEW_REELS_PER_DAY = 100

interface RateLimitRow {
  allowed: boolean
  retry_after_seconds: number
}

export interface IngestionRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Reserve one ingestion slot for a user. The backing Postgres function takes
 * an advisory transaction lock, so concurrent Vercel instances share one
 * authoritative limit.
 */
export async function consumeIngestionRateLimit(
  userId: string,
): Promise<IngestionRateLimitResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('consume_ingestion_rate_limit', {
    p_user_id: userId,
    p_minute_limit: MAX_NEW_REELS_PER_MINUTE,
    p_day_limit: MAX_NEW_REELS_PER_DAY,
  })

  if (error) {
    console.error('[ingestion-rate-limit] RPC error:', error.message)
    throw new Error('Ingestion rate limiter is unavailable')
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null
  if (!row) throw new Error('Ingestion rate limiter returned no result')

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
  }
}
