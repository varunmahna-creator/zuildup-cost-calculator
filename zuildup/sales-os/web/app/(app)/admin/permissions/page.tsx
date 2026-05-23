import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAdminPermissions, getAdminPermissionsAudit } from '@/lib/inboxApiServer'
import PermissionsClient from './PermissionsClient'

export const dynamic = 'force-dynamic'

export default async function AdminPermissionsPage() {
  const me = await requireAuth()
  // qol-sprint-2 2026-05-23 (P0-2): admin-only.
  if (me.role !== 'admin') {
    redirect('/inbox')
  }

  const [permsResp, auditResp] = await Promise.all([
    getAdminPermissions(),
    getAdminPermissionsAudit(50),
  ])
  const users = permsResp?.users || []
  const audit = auditResp?.rows || []

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage user roles, lead scope, and tab visibility. Changes audit immediately.
        </p>
      </div>

      <PermissionsClient initialUsers={users} initialAudit={audit} />
    </div>
  )
}
