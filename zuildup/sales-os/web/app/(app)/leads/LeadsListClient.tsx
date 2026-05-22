'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDateRelative } from '@/lib/format'
import type { Lead } from '@/lib/inboxApiServer'
import LeadRowExpanded from '@/components/LeadRowExpanded'
import ManualLeadModal from '@/components/ManualLeadModal'
import type { ManualLeadResponse } from '@/lib/leadApi'

interface UserLite {
  id: string
  name: string
}

interface Props {
  leads: Lead[]
  users: UserLite[]
  canOverrideTier?: boolean
  initialOpen?: string | null
}

// Border colour by `status_top` (Lane B field) — fall back to legacy mapping
function borderColor(lead: any): string {
  const top = lead.status_top as string | undefined
  if (top === 'Qualified') return 'border-l-emerald-500'
  if (top === 'Not Qualified') return 'border-l-rose-500'
  if (top === 'Attempted') return 'border-l-amber-500'
  // Legacy fallback based on flat status
  const s = (lead.status as string) || ''
  if (['Won', 'Quote Sent', 'Meeting Scheduled', 'Site Visit', 'Negotiation', 'SQL'].includes(s))
    return 'border-l-emerald-400'
  if (['Lost', 'Junk'].includes(s)) return 'border-l-rose-400'
  if (['Attempted', 'Contacted'].includes(s)) return 'border-l-amber-400'
  return 'border-l-slate-300'
}

function statusPillClass(lead: any): string {
  const top = lead.status_top as string | undefined
  if (top === 'Qualified') return 'bg-emerald-100 text-emerald-800'
  if (top === 'Not Qualified') return 'bg-rose-100 text-rose-800'
  if (top === 'Attempted') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-800'
}

export default function LeadsListClient({
  leads: initialLeads,
  users,
  canOverrideTier,
  initialOpen,
}: Props) {
  const router = useRouter()
  const search = useSearchParams()

  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null)
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [modalOpen, setModalOpen] = useState(false)
  const [newLeadFlash, setNewLeadFlash] = useState<string | null>(null)

  // Sync openId ↔ ?open=
  const updateOpenParam = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(search.toString())
      if (id) {
        params.set('open', id)
      } else {
        params.delete('open')
      }
      const qs = params.toString()
      router.replace(qs ? `/leads?${qs}` : '/leads', { scroll: false })
    },
    [router, search]
  )

  // ESC key collapses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openId) {
        setOpenId(null)
        updateOpenParam(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, updateOpenParam])

  // Pick up changes to ?open= from third-party nav (deep-link / back-forward)
  useEffect(() => {
    const urlOpen = search.get('open')
    if (urlOpen !== openId) {
      setOpenId(urlOpen)
    }
    // We intentionally only react to search changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const usersById = useMemo(() => {
    const m: Record<string, string> = {}
    users.forEach((u) => {
      m[u.id] = u.name
    })
    return m
  }, [users])

  const handleRowClick = useCallback(
    (id: string) => {
      if (openId === id) {
        setOpenId(null)
        updateOpenParam(null)
      } else {
        setOpenId(id)
        updateOpenParam(id)
      }
    },
    [openId, updateOpenParam]
  )

  const handleManualCreated = useCallback(
    (newLead: ManualLeadResponse['lead'], mocked?: boolean) => {
      // Prepend to the displayed list so user sees it immediately
      const synthetic: any = {
        id: newLead.id,
        name: newLead.name,
        phone: newLead.phone,
        email: newLead.email,
        location: null,
        project_details: null,
        status: newLead.status || 'New',
        substatus_reason: null,
        lead_source: newLead.lead_source,
        tier_hint: newLead.tier_hint,
        assigned_to: null,
        date_received: null,
        last_activity_at: null,
        created_at: newLead.created_at,
        next_action_type: null,
        next_action_due: null,
        next_action_notes: null,
        estimated_value: null,
        plot_size: null,
        floors: null,
        budget_band: null,
        leadgen_id: null,
        form_id: null,
        campaign_id: null,
        ad_id: null,
        platform: null,
      }
      setLeads((prev) => [synthetic, ...prev])
      setNewLeadFlash(mocked ? 'Lead added (mocked)' : 'Lead added')
      // Scroll to top so the new lead is visible
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
      // Auto-clear flash after 3s
      setTimeout(() => setNewLeadFlash(null), 3000)
    },
    []
  )

  const handleStatusSaved = useCallback(() => {
    // Collapse and refresh server data
    setOpenId(null)
    updateOpenParam(null)
    router.refresh()
  }, [router, updateOpenParam])

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {newLeadFlash && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1">
            {newLeadFlash}
          </div>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded shadow-sm"
          >
            + New Lead
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {leads.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">
            No leads match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {leads.map((lead) => {
              const isOpen = openId === lead.id
              const nextDue = formatDateRelative(lead.next_action_due)
              const assigneeName = lead.assigned_to ? usersById[lead.assigned_to] : null
              return (
                <li key={lead.id} className={`border-l-4 ${borderColor(lead)}`}>
                  <button
                    type="button"
                    onClick={() => handleRowClick(lead.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none focus:bg-blue-50 ${
                      isOpen ? 'bg-blue-50' : ''
                    }`}
                    aria-expanded={isOpen}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium text-gray-900 min-w-[140px]">
                        {lead.name || '(no name)'}
                      </span>
                      <span className="text-gray-700 min-w-[120px] tabular-nums">
                        {lead.phone || '—'}
                      </span>
                      {lead.lead_source && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800 capitalize">
                          {lead.lead_source}
                        </span>
                      )}
                      {lead.tier_hint && (
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                            lead.tier_hint === 'A'
                              ? 'bg-indigo-100 text-indigo-800'
                              : lead.tier_hint === 'B'
                              ? 'bg-slate-100 text-slate-800'
                              : lead.tier_hint === 'PARTNER'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-zinc-100 text-zinc-800'
                          }`}
                        >
                          Tier-{lead.tier_hint}
                        </span>
                      )}
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusPillClass(
                          lead
                        )}`}
                      >
                        {(lead as any).status_top
                          ? `${(lead as any).status_top}${
                              (lead as any).sub_status ? ' / ' + (lead as any).sub_status : ''
                            }`
                          : lead.status}
                      </span>
                      <span className="text-gray-600 text-xs">
                        {assigneeName || (
                          <span className="text-gray-400 italic">unassigned</span>
                        )}
                      </span>
                      <span className={`text-xs ml-auto ${nextDue.className}`}>{nextDue.text}</span>
                      <span className="text-gray-400 text-xs ml-1" aria-hidden>
                        {isOpen ? '▾' : '▸'}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <LeadRowExpanded
                      lead={{
                        id: lead.id,
                        name: lead.name,
                        phone: lead.phone,
                        email: lead.email,
                        lead_source: lead.lead_source,
                        tier_hint: lead.tier_hint,
                        status: lead.status,
                        created_at: lead.created_at,
                        related_count: (lead as any).related_count,
                        status_top: (lead as any).status_top,
                        sub_status: (lead as any).sub_status,
                      }}
                      canOverrideTier={canOverrideTier}
                      onStatusSaved={handleStatusSaved}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">
            Esc
          </kbd>
          to collapse · click any row to expand
        </span>
        <span className="ml-3">
          Open lead detail with <Link href="/leads" className="text-blue-600 hover:underline">
            ?open=&lt;id&gt;
          </Link>{' '}
          for deep linking.
        </span>
      </div>

      <ManualLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleManualCreated}
      />
    </>
  )
}
