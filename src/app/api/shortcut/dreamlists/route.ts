import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface DreamlistMembershipRow {
  role: string
  dreamlists: ShortcutDreamlist | ShortcutDreamlist[] | null
}

interface ShortcutDreamlist {
  id: string
  name: string
  type: 'personal' | 'shared'
  owner_id: string
  created_at: string
}

function bearerToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7).trim()
  return token || null
}

function uniqueLabel(
  dreamlist: ShortcutDreamlist,
  seen: Map<string, number>,
) {
  const base = dreamlist.type === 'personal'
    ? dreamlist.name
    : `${dreamlist.name} (shared)`
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base} ${count + 1}`
}

function getDreamlist(row: DreamlistMembershipRow): ShortcutDreamlist | null {
  if (Array.isArray(row.dreamlists)) return row.dreamlists[0] ?? null
  return row.dreamlists
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('personal_api_token', token)
    .maybeSingle()

  if (profileError || !profile?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await admin
    .from('dreamlist_members')
    .select('role, dreamlists(id, name, type, owner_id, created_at)')
    .eq('user_id', profile.id)

  if (error) {
    console.error('[shortcut/dreamlists] query error:', error.message)
    return NextResponse.json({ error: 'Failed to load Dreamlists' }, { status: 500 })
  }

  const rows = ((data ?? []) as DreamlistMembershipRow[])
    .map((row) => ({ ...row, dreamlist: getDreamlist(row) }))
    .filter((row) => row.dreamlist)
    .sort((a, b) => {
      const dreamlistA = a.dreamlist!
      const dreamlistB = b.dreamlist!
      if (dreamlistA.type !== dreamlistB.type) {
        return dreamlistA.type === 'personal' ? -1 : 1
      }
      return dreamlistA.created_at.localeCompare(dreamlistB.created_at)
    })

  const seenLabels = new Map<string, number>()
  const labels: string[] = []
  const idsByLabel: Record<string, string> = {}
  const dreamlists = rows.map((row) => {
    const dreamlist = row.dreamlist!
    const label = uniqueLabel(dreamlist, seenLabels)
    labels.push(label)
    idsByLabel[label] = dreamlist.id

    return {
      id: dreamlist.id,
      name: dreamlist.name,
      label,
      type: dreamlist.type,
      role: row.role,
      is_personal: dreamlist.type === 'personal',
    }
  })

  const personalDreamlist = dreamlists.find((dreamlist) => dreamlist.is_personal)

  return NextResponse.json(
    {
      dreamlists,
      labels,
      ids_by_label: idsByLabel,
      default_dreamlist_id: personalDreamlist?.id ?? dreamlists[0]?.id ?? null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
