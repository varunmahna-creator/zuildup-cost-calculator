import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import TeamActionsClient from './TeamActionsClient'

export const dynamic = 'force-dynamic'

export default async function TeamActionsPage() {
  await requireRole(['admin', 'director'])
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, status, assigned_to, next_action_type, next_action_due, next_action_notes')
    .not('next_action_type', 'is', null)
    .not('assigned_to', 'is', null)
    .order('next_action_due', { ascending: true })

  const { data: users } = await supabase
    .from('users')
    .select('id, name, role')
    .in('role', ['spoc', 'director', 'admin'])
    .order('name')

  const userMap: Record<string, { name: string; role: string }> = {}
  ;(users || []).forEach((u: { id: string; name: string; role: string }) => {
    userMap[u.id] = { name: u.name, role: u.role }
  })

  return (
    <TeamActionsClient
      leads={leads || []}
      users={users || []}
      userMap={userMap}
    />
  )
}
