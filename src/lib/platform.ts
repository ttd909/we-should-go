export type Platform = 'tiktok' | 'instagram' | 'other'

export function detectPlatform(url: string): Platform {
  if (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) return 'tiktok'
  if (url.includes('instagram.com')) return 'instagram'
  return 'other'
}
