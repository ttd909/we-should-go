import crypto from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectPlatform } from '@/lib/platform'

export async function POST(request: NextRequest) {
  // Android PWA share uses the browser session, not a bearer token
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  let url: string | undefined
  try {
    const formData = await request.formData()
    url = formData.get('url')?.toString().trim()
  } catch {
    return NextResponse.redirect(new URL('/?error=bad-request', request.url))
  }

  if (!url) {
    return NextResponse.redirect(new URL('/?error=no-url', request.url))
  }

  let cleanUrl: string
  try {
    cleanUrl = new URL(url).toString()
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid-url', request.url))
  }

  const platform = detectPlatform(cleanUrl)
  if (platform === 'other') {
    return NextResponse.redirect(new URL('/?error=unsupported', request.url))
  }

  const urlHash = crypto.createHash('sha256').update(cleanUrl).digest('hex')
  const admin = createAdminClient()

  // Deduplicate — if the user already has this reel, skip insertion
  const { data: existing } = await admin
    .from('reel_submissions')
    .select('id')
    .eq('submitted_by_user_id', user.id)
    .eq('url_hash', urlHash)
    .maybeSingle()

  if (!existing) {
    const { data: reel } = await admin
      .from('reel_submissions')
      .insert({
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
