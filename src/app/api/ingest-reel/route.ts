import crypto from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { detectPlatform } from '@/lib/platform'

async function getAuthedUserId(request: NextRequest): Promise<string | null> {
  // Bearer token path — used by iOS Shortcut
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('personal_api_token', token)
      .single()
    if (data?.id) return data.id
  }

  // Session cookie path — used by the web app paste form
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    url?: unknown
    notes?: unknown
    submitted_by_label?: unknown
    page_title?: unknown
    page_description?: unknown
    thumbnail_url?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, notes, submitted_by_label, page_title, page_description, thumbnail_url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: '"url" is required' }, { status: 400 })
  }

  // Basic URL structure check
  let cleanUrl: string
  try {
    cleanUrl = new URL(url.trim()).toString()
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const platform = detectPlatform(cleanUrl)
  if (platform === 'other') {
    return NextResponse.json(
      { error: 'Only TikTok and Instagram URLs are supported' },
      { status: 400 }
    )
  }

  const urlHash = crypto.createHash('sha256').update(cleanUrl).digest('hex')
  const notesStr = typeof notes === 'string' ? notes.trim() || null : null
  const labelStr = typeof submitted_by_label === 'string' ? submitted_by_label.trim() || null : null

  const admin = createAdminClient()

  // URL hash cache — return existing submission without creating a new job
  const { data: existing } = await admin
    .from('reel_submissions')
    .select('*')
    .eq('submitted_by_user_id', userId)
    .eq('url_hash', urlHash)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(existing, { status: 200 })
  }

  // Insert the reel submission
  const { data: reel, error: insertError } = await admin
    .from('reel_submissions')
    .insert({
      submitted_by_user_id: userId,
      url: cleanUrl,
      url_hash: urlHash,
      platform,
      notes: notesStr,
      submitted_by_label: labelStr,
      status: 'inbox',
    })
    .select('id')
    .single()

  if (insertError || !reel) {
    console.error('[ingest-reel] insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to save reel' }, { status: 500 })
  }

  // Write the extraction job — the Railway worker picks this up
  const shortcutMetadata = {
    page_title: typeof page_title === 'string' ? page_title : null,
    page_description: typeof page_description === 'string' ? page_description : null,
    thumbnail_url: typeof thumbnail_url === 'string' ? thumbnail_url : null,
  }

  const { data: job, error: jobError } = await admin
    .from('extraction_jobs')
    .insert({
      reel_submission_id: reel.id,
      status: 'pending',
      shortcut_metadata: shortcutMetadata,
    })
    .select('id')
    .single()

  if (jobError) {
    console.error('[ingest-reel] job insert error:', jobError.message)
  }

  return NextResponse.json(
    { job_id: job?.id ?? null, message: 'Saved — extracting place now' },
    { status: 202 }
  )
}
