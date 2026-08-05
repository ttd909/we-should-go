import type { Metadata } from 'next'
import { Link2Off } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Shared itinerary | We Should Go',
  description: 'Open the complete itinerary link shared with you.',
  robots: { index: false, follow: false },
}
export default function PublicItineraryLandingPage() {
  return (
    <main className="-mb-24 flex min-h-screen items-center justify-center px-5 py-16 md:mb-0">
      <section className="w-full max-w-md rounded-3xl border border-sky-100 bg-white/85 p-8 text-center shadow-[var(--travel-card-shadow)] backdrop-blur">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Link2Off className="size-6" /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Open your shared itinerary link</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">This address needs the private share code at the end. Ask the trip organiser to send you the full link again.</p>
      </section>
    </main>
  )
}
