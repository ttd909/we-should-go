import crypto from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeIngestionRateLimit } from '@/lib/ingestion-rate-limit'
import { findSupportedReelUrl } from '@/lib/platform'

export async function POST(request: NextRequest) {
  // Android PWA share uses the browser session, not a bearer token
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  let sharedValue: string | undefined
  try {
    const formData = await request.formData()
    sharedValue =
      formData.get('url')?.toString().trim() ||
      formData.get('text')?.toString().trim()
  } catch {
    return NextResponse.redirect(new URL('/?error=bad-request', request.url))
  }

  if (!sharedValue) {
    return NextResponse.redirect(new URL('/?error=no-url', request.url))
  }

  const parsedUrl = findSupportedReelUrl(sharedValue)
  if (!parsedUrl) {
    return NextResponse.redirect(new URL('/?error=unsupported', request.url))
  }
  const { platform, url: cleanUrl } = parsedUrl

  const urlHash = crypto.createHash('sha256').update(cleanUrl).digest('hex')
  const admin = createAdminClient()
  const { data: dreamlist } = await admin
    .from('dreamlists')
    .select('id')
    .eq('owner_id', user.id)
    .eq('type', 'personal')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!dreamlist?.id) {
    return NextResponse.redirect(new URL('/?error=no-dreamlist', request.url))
  }

  // Deduplicate — if the user already has this reel, skip insertion
  const { data: existing } = await admin
    .from('reel_submissions')
    .select('id')
    .eq('dreamlist_id', dreamlist.id)
    .eq('url_hash', urlHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing) {
    let rateLimit
    try {
      rateLimit = await consumeIngestionRateLimit(user.id)
    } catch {
      return NextResponse.redirect(new URL('/?error=temporarily-unavailable', request.url))
    }

    if (!rateLimit.allowed) {
      const response = NextResponse.redirect(new URL('/?error=rate-limited', request.url))
      response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
      return response
    }

    const { data: reel } = await admin
      .from('reel_submissions')
      .insert({
        dreamlist_id: dreamlist.id,
        submitted_by_user_id: user.id,
        url: cleanUrl,
        url_hash: urlHash,
        platform,
        status: 'inbox',
      })
      .select('id')
      .single()

    if (reel) {
      await admin
        .from('extraction_jobs')
        .insert({ reel_submission_id: reel.id, status: 'pending' })
    }
  }

  return NextResponse.redirect(new URL('/?saved=true', request.url))
}
