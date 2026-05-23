'use client'

import { useMemo, useState } from 'react'
import type { AdminUser } from '@/lib/inboxApiServer'

const ALL_TABS = ['dashboard', 'inbox', 'leads', 'reports', 'admin'] as const
type Tab = typeof ALL_TABS[number]

const ROLES: AdminUser['role'][] = ['admin', 'director', 'spoc']
const SCOPES: NonNullable<AdminUser['lead_scope']>[] = ['assigned_only', 'all_leads', 'team_leads']

const SCOPE_LABEL: Record<string, string> = {
  assigned_only: 'Assigned only',
  all_leads: 'All leads',
  team_leads: 'Team leads',
}

interface AuditRow {
  id: string
  user_id: string
  user_name?: string | null
  user_email?: string | null
  changed_by_name?: string | null
  field: string
  old_value: string | null
  new_value: string | null
  changed_at: string
}

interface Props {
  initialUsers: AdminUser[]
  initialAudit: AuditRow[]
}

export default function PermissionsClient({ initialUsers, initialAudit }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [audit, setAudit] = useState<AuditRow[]>(initialAudit)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => {
      // Active first, then by role (admin < director < spoc), then name
      if (a.active !== b.active) return a.active ? -1 : 1
      const ra = ROLES.indexOf(a.role)
      const rb = ROLES.indexOf(b.role)
      if (ra !== rb) return ra - rb
      return (a.name || a.email).localeCompare(b.name || b.email)
    })
  }, [users])

  async function patchUser(
    userId: string,
    body: Partial<Pick<AdminUser, 'role' | 'lead_scope' | 'visible_tabs' | 'active'>>
  ) {
    setSavingId(userId)
    setErrorMsg(null)
    try {
      const r = await fetch(`/api/admin/permissions/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${r.status}`)
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...json.updated } : u))
      )
      setFlashMsg(`Saved ${json.updated?.name || json.updated?.email || userId}`)
      setTimeout(() => setFlashMsg(null), 2500)
    } catch (e: any) {
      setErrorMsg(e.message || 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  function toggleTab(user: AdminUser, tab: Tab) {
    const current = new Set(user.visible_tabs || [])
    if (current.has(tab)) current.delete(tab)
    else current.add(tab)
    patchUser(user.id, { visible_tabs: Array.from(current) })
  }

  return (
    <div className="space-y-6">
      {flashMsg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {flashMsg}
        </div>
      )}
      {errorMsg && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {errorMsg}
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-medium">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">User</th>
                <th scope="col" className="px-3 py-2 text-left">Role</th>
                <th scope="col" className="px-3 py-2 text-left">Lead Scope</th>
                <th scope="col" className="px-3 py-2 text-left">Visible Tabs</th>
                <th scope="col" className="px-3 py-2 text-left">Active</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sorted.map((u) => {
                const isSaving = savingId === u.id
                const tabSet = new Set(u.visible_tabs || [])
                return (
                  <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-medium text-gray-900">{u.name || '—'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <select
                        value={u.role}
                        disabled={isSaving}
                        onChange={(e) =>
                          patchUser(u.id, { role: e.target.value as AdminUser['role'] })
                        }
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <select
                        value={u.lead_scope || 'assigned_only'}
                        disabled={isSaving}
                        onChange={(e) =>
                          patchUser(u.id, {
                            lead_scope: e.target.value as NonNullable<AdminUser['lead_scope']>,
                          })
                        }
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        {SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {SCOPE_LABEL[s] || s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {ALL_TABS.map((t) => (
                          <label
                            key={t}
                            className="inline-flex items-center gap-1 text-xs cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={tabSet.has(t)}
                              disabled={isSaving}
                              onChange={() => toggleTab(u, t)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="capitalize text-gray-700">{t}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!u.active}
                          disabled={isSaving}
                          onChange={(e) => patchUser(u.id, { active: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <span className={u.active ? 'text-emerald-700' : 'text-gray-400'}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Recent changes</h2>
          <p className="text-xs text-gray-500">Last {audit.length} permission changes</p>
        </div>
        {audit.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-400 italic">No changes yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left">From → To</th>
                  <th className="px-3 py-2 text-left">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(a.changed_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{a.user_name || a.user_email}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{a.field}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <span className="text-rose-700">{a.old_value ?? '∅'}</span>
                      {' → '}
                      <span className="text-emerald-700">{a.new_value ?? '∅'}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{a.changed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
