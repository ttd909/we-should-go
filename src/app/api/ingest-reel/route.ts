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

async function getWritableDreamlistId(
  userId: string,
  requestedDreamlistId: unknown,
): Promise<string | null> {
  const admin = createAdminClient()
  const requested = typeof requestedDreamlistId === 'string' ? requestedDreamlistId.trim() : ''

  if (requested) {
    const { data } = await admin
      .from('dreamlist_members')
      .select('dreamlist_id')
      .eq('dreamlist_id', requested)
      .eq('user_id', userId)
      .maybeSingle()
    return data?.dreamlist_id ?? null
  }

  const { data } = await admin
    .from('dreamlists')
    .select('id')
    .eq('owner_id', userId)
    .eq('type', 'personal')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

function coerceShortcutString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const firstString = value.find((item): item is string => typeof item === 'string')
    return firstString ?? null
  }
  return null
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
    dreamlist_id?: unknown
    page_title?: unknown
    page_description?: unknown
    thumbnail_url?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { page_title, page_description, thumbnail_url } = body
  const url = coerceShortcutString(body.url)
  const notes = coerceShortcutString(body.notes)
  const submitted_by_label = coerceShortcutString(body.submitted_by_label)

  if (!url) {
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
  const dreamlistId = await getWritableDreamlistId(userId, body.dreamlist_id)
  if (!dreamlistId) {
    return NextResponse.json(
      { error: 'You can only save ideas to Dreamlists you belong to' },
      { status: 403 },
    )
  }

  // URL hash cache — return existing submission without creating a new job
  const { data: existing } = await admin
    .from('reel_submissions')
    .select('*')
    .eq('dreamlist_id', dreamlistId)
    .eq('url_hash', urlHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(existing, { status: 200 })
  }

  // Insert the reel submission
  const { data: reel, error: insertError } = await admin
    .from('reel_submissions')
    .insert({
      dreamlist_id: dreamlistId,
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
    {
      ok: true,
      reel_id: reel.id,
      job_id: job?.id ?? null,
      message: 'Saved - extracting places now',
    },
    { status: 202 }
  )
}
