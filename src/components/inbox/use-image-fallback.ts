'use client'

import { useCallback, useState } from 'react'

export function useImageFallback(...candidates: Array<string | null | undefined>) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set())
  const imageUrl = candidates.find(
    (candidate): candidate is string => Boolean(candidate && !failedUrls.has(candidate)),
  ) ?? null

  const handleImageError = useCallback(() => {
    if (!imageUrl) return

    setFailedUrls((current) => {
      if (current.has(imageUrl)) return current
      const next = new Set(current)
      next.add(imageUrl)
      return next
    })
  }, [imageUrl])

  return { imageUrl, handleImageError }
}
