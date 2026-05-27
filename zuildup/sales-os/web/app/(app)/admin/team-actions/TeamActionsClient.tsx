'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type LeadRow = {
  id: string
  name: string | null
  phone: string | null
  status: string
  assigned_to: string | null
  next_action_type: string | null
  next_action_due: string | null
  next_action_notes: string | null
}

type Bucket = 'all' | 'overdue' | 'today' | 'upcoming'

const ACTION_TYPES = [
  'Make Call', 'Send Quote', 'Schedule Meeting', 'Send Follow-up',
  'Site Visit', 'Negotiate', 'Send Brochure', 'Get Approval',
  'Coordinate with Architect', 'Custom',
]

function humanizeRelative(due: Date): string {
  const diffMs = due.getTime() - Date.now()
  const overdue = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.floor(absMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  let phrase: string
  if (days >= 1) phrase = `${days}d`
  else if (hours >= 1) phrase = `${hours}h`
  else phrase = `${Math.max(1, minutes)}m`
  return overdue ? `${phrase} overdue` : `in ${phrase}`
}

function getIstDayBounds() {
  const IST_OFFSET_MS = 5.5 * 3600 * 1000
  const nowUtc = Date.now()
  const nowIst = new Date(nowUtc + IST_OFFSET_MS)
  const istY = nowIst.getUTCFullYear()
  const istM = nowIst.getUTCMonth()
  const istD = nowIst.getUTCDate()
  const todayStartUtc = Date.UTC(istY, istM, istD) - IST_OFFSET_MS
  const tomorrowStartUtc = todayStartUtc + 24 * 3600 * 1000
  return {
    todayStart: new Date(todayStartUtc),
    tomorrowStart: new Date(tomorrowStartUtc),
    sevenDaysFromNow: new Date(nowUtc + 7 * 24 * 3600 * 1000),
  }
}

function classifyBucket(due: Date, bounds: ReturnType<typeof getIstDayBounds>): 'overdue' | 'today' | 'upcoming' | 'far' {
  const now = Date.now()
  if (due.getTime() < now) return 'overdue'
  if (due >= bounds.todayStart && due < bounds.tomorrowStart) return 'today'
  if (due >= bounds.tomorrowStart && due < bounds.sevenDaysFromNow) return 'upcoming'
  return 'far'
}

function statusBadge(due: Date) {
  const diffMs = due.getTime() - Date.now()
  if (diffMs < 0) return { emoji: '🔴', label: 'Overdue', cls: 'bg-red-100 text-red-800' }
  if (diffMs < 24 * 3600 * 1000) return { emoji: '🟡', label: 'Today', cls: 'bg-amber-100 text-amber-800' }
  return { emoji: '🟢', label: 'Upcoming', cls: 'bg-emerald-100 text-emerald-800' }
}

export default function TeamActionsClient({
  leads,
  users,
  userMap,
}: {
  leads: LeadRow[]
  users: { id: string; name: string; role: string }[]
  userMap: Record<string, { name: string; role: string }>
}) {
  const [spocFilter, setSpocFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [bucketFilter, setBucketFilter] = useState<Bucket>('all')
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null)
  const [nudgePending, setNudgePending] = useState<string | null>(null)

  const bounds = getIstDayBounds()

  // Per-SPOC counts for header
  const spocCounts = useMemo(() => {
    const counts: Record<string, { overdue: number; today: number; upcoming: number }> = {}
    leads.forEach(l => {
      if (!l.assigned_to || !l.next_action_due) return
      const due = new Date(l.next_action_due)
      const b = classifyBucket(due, bounds)
      if (b === 'far') return
      if (!counts[l.assigned_to]) counts[l.assigned_to] = { overdue: 0, today: 0, upcoming: 0 }
      counts[l.assigned_to][b]++
    })
    return counts
  }, [leads, bounds])

  // Filter leads
  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (!l.next_action_due || !l.assigned_to) return false
      if (spocFilter !== 'all' && l.assigned_to !== spocFilter) return false
      if (actionFilter !== 'all' && l.next_action_type !== actionFilter) return false
      if (bucketFilter !== 'all') {
        const b = classifyBucket(new Date(l.next_action_due), bounds)
        if (b !== bucketFilter) return false
      }
      return true
    })
  }, [leads, spocFilter, actionFilter, bucketFilter, bounds])

  const handleNudge = async (leadId: string) => {
    setNudgeMsg(null)
    setNudgePending(leadId)
    try {
      const res = await fetch('/api/nudge/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      if (res.status === 404) {
        setNudgeMsg('Manual nudge endpoint not yet live (Phase C). Will activate Monday.')
      } else if (!res.ok) {
        const t = await res.text().catch(() => '')
        setNudgeMsg(`Nudge failed (${res.status}): ${t.slice(0, 120)}`)
      } else {
        setNudgeMsg('Nudge sent ✓')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setNudgeMsg(`Nudge error: ${msg}`)
    } finally {
      setNudgePending(null)
      setTimeout(() => setNudgeMsg(null), 5000)
    }
  }

  const spocsWithLeads = users.filter(u => spocCounts[u.id])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Team Actions</h1>
        <p className="text-sm text-gray-500">{filtered.length} of {leads.length} pending actions</p>
      </div>

      {/* Per-SPOC summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {spocsWithLeads.length === 0 ? (
            <p className="text-gray-500 italic">No pending actions across the team.</p>
          ) : (
            spocsWithLeads.map(u => {
              const c = spocCounts[u.id]
              return (
                <div key={u.id}>
                  <span className="font-medium text-gray-900">{u.name}:</span>{' '}
                  <span className="text-red-700">{c.overdue} overdue</span>,{' '}
                  <span className="text-amber-700">{c.today} today</span>,{' '}
                  <span className="text-emerald-700">{c.upcoming} upcoming</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">SPOC</label>
            <select
              value={spocFilter}
              onChange={(e) => setSpocFilter(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All SPOCs</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Action type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All actions</option>
              {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bucket</label>
            <div className="flex gap-3 text-sm pt-1">
              {(['all', 'overdue', 'today', 'upcoming'] as Bucket[]).map(b => (
                <label key={b} className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="bucket"
                    value={b}
                    checked={bucketFilter === b}
                    onChange={() => setBucketFilter(b)}
                  />
                  <span className="capitalize">{b}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {nudgeMsg && (
        <div className="mb-3 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-sm text-blue-800">
          {nudgeMsg}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SPOC</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 italic">
                  No actions match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map(l => {
                const due = new Date(l.next_action_due!)
                const badge = statusBadge(due)
                const spoc = l.assigned_to ? userMap[l.assigned_to] : null
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 text-sm">
                      <Link href={`/leads/${l.id}`} className="font-medium text-blue-600 hover:underline">
                        {l.name || '(no name)'}
                      </Link>
                      {l.phone && <div className="text-xs text-gray-500">{l.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {spoc ? <>{spoc.name} <span className="text-xs text-gray-500">({spoc.role})</span></> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm">{l.next_action_type}</td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className="block">{due.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-xs text-gray-500">{humanizeRelative(due)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${badge.cls}`}>
                        {badge.emoji} {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right">
                      <button
                        type="button"
                        onClick={() => handleNudge(l.id)}
                        disabled={nudgePending === l.id}
                        className="text-xs px-2.5 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
                      >
                        {nudgePending === l.id ? 'Sending…' : 'Nudge SPOC'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
