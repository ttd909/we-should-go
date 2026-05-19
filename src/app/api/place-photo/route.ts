import { NextResponse, type NextRequest } from 'next/server'

function encodePhotoName(name: string): string | null {
  const parts = name.split('/')
  if (
    parts.length !== 4 ||
    parts[0] !== 'places' ||
    parts[2] !== 'photos' ||
    !parts[1] ||
    !parts[3]
  ) {
    return null
  }

  return parts.map(encodeURIComponent).join('/')
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key is not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const widthParam = Number(searchParams.get('w') ?? 640)
  const width = Number.isFinite(widthParam) ? Math.min(Math.max(widthParam, 120), 1200) : 640

  if (!name) {
    return NextResponse.json({ error: '"name" is required' }, { status: 400 })
  }

  const encodedName = encodePhotoName(name)
  if (!encodedName) {
    return NextResponse.json({ error: 'Invalid photo name' }, { status: 400 })
  }

  const googleUrl = new URL(`https://places.googleapis.com/v1/${encodedName}/media`)
  googleUrl.searchParams.set('maxWidthPx', String(width))
  googleUrl.searchParams.set('key', apiKey)

  const response = await fetch(googleUrl, {
    redirect: 'follow',
    next: { revalidate: 60 * 60 * 24 * 7 },
  })

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: 'Failed to load place photo' }, { status: response.status })
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  })
}
