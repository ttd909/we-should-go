import type { ItineraryIssue } from './validate'

export type ItineraryActionResult =
  | { ok: true; editId: string; version: number }
  | {
      ok: false
      code: 'validation' | 'confirmation_required' | 'stale' | 'unauthorized' | 'not_found' | 'database'
      message: string
      conflicts?: ItineraryIssue[]
      warnings?: ItineraryIssue[]
    }

export type PreferencesActionResult =
  | { ok: true }
  | { ok: false; message: string }

export type ChatActionResult =
  | { ok: true; status: 'applied' | 'pending' | 'discarded' | 'duplicate'; version: number; editId?: string }
  | { ok: false; code: 'validation' | 'rate_limited' | 'stale' | 'unauthorized' | 'not_found' | 'provider' | 'database'; message: string }

export type PhotoActionResult = ChatActionResult
