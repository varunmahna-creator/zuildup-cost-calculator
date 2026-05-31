import { requireRole } from '@/lib/auth'
import { getUsers } from '@/lib/inboxApiServer'
import { SignJWT } from 'jose'
import TeamActionsClient from './TeamActionsClient'

export const dynamic = 'force-dynamic'

// 2026-05-31: rewritten to read from Cloud SQL via inbox-api.
// Previously read from Supabase `leads`/`users`, which became stale after
// lead data moved to Cloud SQL. Same Sales OS rule: Cloud SQL is the only
// DB for lead data; Supabase Auth remains for sessions only.
const API_URL = process.env.NEXT_PUBLIC_INBOX_API_URL || 'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'

async function mintJwt(userId: string, email: string, role: string): Promise<string> {
  const secret = process.env.INBOX_JWT_SECRET
  if (!secret) throw new Error('INBOX_JWT_SECRET not configured')
  const key = new TextEncoder().encode(secret)
  const nowSec = Math.floor(Date.now() / 1000)
  return await new SignJWT({ email, role, user_id: userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600)
    .sign(key)
}

type TeamActionLead = {
  id: string
  name: string | null
  phone: string | null
  status: string
  assigned_to: string | null
  lead_source: string | null
  next_action_type: string | null
  next_action_due: string | null
  next_action_notes: string | null
  assigned_to_name?: string | null
  assigned_to_role?: string | null
}

export default async function TeamActionsPage() {
  const user = await requireRole(['admin', 'director'])

  // Fetch leads from inbox-api / Cloud SQL
  let leads: TeamActionLead[] = []
  try {
    const token = await mintJwt(user.id, user.email, user.role)
    const res = await fetch(API_URL + '/admin/team-actions', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (res.ok) {
      const j = await res.json()
      leads = (j.rows || []) as TeamActionLead[]
    } else {
      console.error('[team-actions] inbox-api HTTP', res.status)
    }
  } catch (e: any) {
    console.error('[team-actions] fetch error:', e.message)
  }

  // Fetch users from inbox-api (same Cloud SQL `users` table the leads
  // are joined against). Filter to spoc/director/admin for the dropdown.
  const usersResp = await getUsers()
  const allUsers = (usersResp?.users || []).filter((u) =>
    u.role === 'spoc' || u.role === 'director' || u.role === 'admin'
  )

  const userMap: Record<string, { name: string; role: string }> = {}
  allUsers.forEach((u) => {
    userMap[u.id] = { name: u.name, role: u.role }
  })

  return (
    <TeamActionsClient
      leads={leads}
      users={allUsers}
      userMap={userMap}
    />
  )
}
