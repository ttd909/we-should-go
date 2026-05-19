'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Refreshes the page every 5 seconds while reels are being enriched.
// Stops when the parent re-renders with no pending reels, or after 60 seconds.
export function InboxPoller() {
  const router = useRouter()

  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 5000)
    const stop = setTimeout(() => clearInterval(poll), 60_000)
    return () => {
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [router])

  return null
}
