export type Platform = 'tiktok' | 'instagram' | 'facebook' | 'other'

export interface SupportedReelUrl {
  platform: Exclude<Platform, 'other'>
  url: string
}

const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
])

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
])

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
])

const FACEBOOK_SHORT_HOSTS = new Set(['fb.watch', 'www.fb.watch'])

function normalisePath(pathname: string): string {
  const path = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return path || '/'
}

function normaliseUrl(url: URL, pathname: string, retainedQuery?: [string, string]): string {
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  url.pathname = pathname
  url.hash = ''
  url.search = ''
  if (retainedQuery) url.searchParams.set(retainedQuery[0], retainedQuery[1])
  return url.toString()
}

/**
 * Parse and canonicalise a supported public reel URL.
 *
 * Hostnames are matched exactly. Checking for a platform name anywhere in the
 * URL would allow attacker-controlled URLs such as
 * https://example.com/?next=instagram.com to reach the extraction worker.
 */
export function parseSupportedReelUrl(value: string): SupportedReelUrl | null {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return null
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== ''
  ) {
    return null
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const pathname = normalisePath(parsed.pathname)

  if (TIKTOK_HOSTS.has(hostname)) {
    const isShortLink =
      (hostname === 'vm.tiktok.com' || hostname === 'vt.tiktok.com') &&
      /^\/[A-Za-z0-9_-]+$/.test(pathname)
    const isVideo = /^\/@[^/]+\/video\/\d+$/.test(pathname)
    const isTikTokShare = /^\/t\/[A-Za-z0-9_-]+$/.test(pathname)

    if (!isShortLink && !isVideo && !isTikTokShare) return null
    return { platform: 'tiktok', url: normaliseUrl(parsed, pathname) }
  }

  if (INSTAGRAM_HOSTS.has(hostname)) {
    if (!/^\/reels?\/[A-Za-z0-9_-]+$/.test(pathname)) return null
    return { platform: 'instagram', url: normaliseUrl(parsed, pathname) }
  }

  if (FACEBOOK_SHORT_HOSTS.has(hostname)) {
    if (!/^\/[A-Za-z0-9_-]+$/.test(pathname)) return null
    return { platform: 'facebook', url: normaliseUrl(parsed, pathname) }
  }

  if (FACEBOOK_HOSTS.has(hostname)) {
    const isReel = /^\/reel\/\d+$/.test(pathname)
    const isSharedReel = /^\/share\/r\/[A-Za-z0-9_-]+$/.test(pathname)
    const watchVideoId = pathname === '/watch' ? parsed.searchParams.get('v') : null
    const isWatchUrl = watchVideoId !== null && /^\d+$/.test(watchVideoId)

    if (!isReel && !isSharedReel && !isWatchUrl) return null
    return {
      platform: 'facebook',
      url: normaliseUrl(
        parsed,
        pathname,
        isWatchUrl && watchVideoId ? ['v', watchVideoId] : undefined,
      ),
    }
  }

  return null
}

/** Find a supported URL when a share sheet supplies caption text plus a link. */
export function findSupportedReelUrl(value: string): SupportedReelUrl | null {
  const direct = parseSupportedReelUrl(value)
  if (direct) return direct

  const candidates = value.match(/https:\/\/[^\s<>"']+/gi) ?? []
  for (const candidate of candidates.slice(0, 5)) {
    const parsed = parseSupportedReelUrl(candidate.replace(/[),.!?\]]+$/, ''))
    if (parsed) return parsed
  }

  return null
}

export function detectPlatform(url: string): Platform {
  return parseSupportedReelUrl(url)?.platform ?? 'other'
}
