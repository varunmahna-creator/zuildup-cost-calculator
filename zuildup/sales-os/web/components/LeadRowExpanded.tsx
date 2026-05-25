'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDateTime, formatDate, ACTIVITY_ICONS } from '@/lib/format'
import {
  fetchLeadActivities,
  fetchPriorSubmissions,
  changeStatus,
  overrideTier,
  type LeadActivity,
  type PriorSubmission,
} from '@/lib/leadApi'
import StatusPicker from './StatusPicker'
import TierBadge from './TierBadge'

export interface LeadRowExpandedLead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  lead_source: string | null
  tier_hint: string | null
  status: string
  created_at: string
  related_count?: number
  // optional new-model fields from Lane B (graceful absence)
  status_top?: string | null
  sub_status?: string | null
  loss_reason?: string | null
  loss_reason_text?: string | null
  junk_reason?: string | null
  nqr_reason?: string | null
  nqr_reason_text?: string | null
  restart_date?: string | null
  callback_at?: string | null
}

interface Props {
  lead: LeadRowExpandedLead
  canOverrideTier?: boolean
  userRole?: string
  onStatusSaved?: () => void
}

export default function LeadRowExpanded({
  lead,
  canOverrideTier,
  userRole,
  onStatusSaved,
}: Props) {
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [priors, setPriors] = useState<PriorSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchLeadActivities(lead.id, 5),
      lead.related_count && lead.related_count > 0
        ? fetchPriorSubmissions(lead.id)
        : Promise.resolve([] as PriorSubmission[]),
    ])
      .then(([acts, pri]) => {
        if (cancelled) return
        setActivities(acts)
        setPriors(pri)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lead.id, lead.related_count])

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Contact + StatusPicker + Quick actions */}
        <div className="space-y-3 lg:col-span-1">
          <div className="bg-white rounded border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Contact
            </h4>
            <dl className="text-sm space-y-1">
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Name</dt>
                <dd className="text-gray-900 flex-1">
                  {lead.name || <span className="text-gray-400 italic">—</span>}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Phone</dt>
                <dd className="flex-1">
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">
                      {lead.phone}
                    </a>
                  ) : (
                    <span className="text-gray-400 italic">—</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Email</dt>
                <dd className="flex-1">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-gray-400 italic">—</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Source</dt>
                <dd className="flex-1 text-gray-900">{lead.lead_source || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Tier</dt>
                <dd className="flex-1">
                  <TierBadge
                    tier={lead.tier_hint}
                    leadId={lead.id}
                    userRole={userRole || (canOverrideTier ? 'admin' : 'spoc')}
                    onOverride={async (id, newTier) => {
                      const r = await overrideTier(id, newTier)
                      if (!r.ok) throw new Error(r.error || 'Failed to override tier')
                    }}
                  />
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-500 w-20 shrink-0">Created</dt>
                <dd className="flex-1 text-gray-700">{formatDateTime(lead.created_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Status
            </h4>
            <StatusPicker
              leadId={lead.id}
              current={{
                status_top: lead.status_top ?? null,
                sub_status: lead.sub_status ?? null,
                loss_reason: lead.loss_reason ?? null,
                loss_reason_text: lead.loss_reason_text ?? null,
                junk_reason: lead.junk_reason ?? null,
                nqr_reason: lead.nqr_reason ?? null,
                restart_date: lead.restart_date ?? null,
                callback_at: lead.callback_at ?? null,
              }}
              onSave={async (payload) => {
                const r = await changeStatus(lead.id, payload)
                if (!r.ok) throw new Error(r.error || 'Failed to save status')
                onStatusSaved?.()
              }}
            />
          </div>

          <div className="bg-white rounded border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Quick actions
            </h4>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/leads/${lead.id}#wa-template`}
                className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
              >
                Send WA template
              </Link>
              <Link
                href={`/leads/${lead.id}#wa-reply`}
                className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
              >
                Send WA reply
              </Link>
              <Link
                href={`/leads/${lead.id}#add-note`}
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
              >
                Add note
              </Link>
              <Link
                href={`/leads/${lead.id}#schedule-callback`}
                className="text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                Schedule callback
              </Link>
              {/* Item 8 (feedback 2026-05-25): open in a new tab so SPOC keeps
                  their list context. */}
              <a
                href={`/leads/${lead.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 ml-auto"
              >
                Open full detail →
              </a>
            </div>
          </div>
        </div>

        {/* MIDDLE: Prior submissions */}
        <div className="space-y-3 lg:col-span-1">
          {lead.related_count && lead.related_count > 0 ? (
            <div className="bg-white rounded border border-gray-200 p-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Prior submissions ({lead.related_count})
              </h4>
              {loading ? (
                <p className="text-xs text-gray-400 italic">Loading…</p>
              ) : priors.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No earlier submissions found.</p>
              ) : (
                <ul className="space-y-1">
                  {priors.map((p) => (
                    <li key={p.id} className="text-sm">
                      <Link
                        href={`/leads?open=${p.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {p.lead_source || 'unknown'} · {formatDate(p.created_at)}
                      </Link>
                      {(p.status_top || p.status) && (
                        <span className="ml-2 text-xs text-gray-500">
                          {p.status_top}
                          {p.sub_status ? ` / ${p.sub_status}` : ''}
                          {!p.status_top && p.status ? p.status : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="bg-white rounded border border-gray-200 p-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Prior submissions
              </h4>
              <p className="text-xs text-gray-400 italic">
                No earlier submissions for this phone.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: Last 5 activities */}
        <div className="space-y-3 lg:col-span-1">
          <div className="bg-white rounded border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Recent activity
            </h4>
            {loading ? (
              <p className="text-xs text-gray-400 italic">Loading…</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No activities yet.</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm">
                    <span className="text-base leading-tight">
                      {ACTIVITY_ICONS[a.type] || '•'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-gray-900 truncate">{a.type}</span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {formatDateTime(a.created_at)}
                        </span>
                      </div>
                      {a.outcome && (
                        <p className="text-xs text-gray-600 truncate">Outcome: {a.outcome}</p>
                      )}
                      {a.note && (
                        <p className="text-xs text-gray-700 line-clamp-2">{a.note}</p>
                      )}
                      {a.user_name && (
                        <p className="text-[10px] text-gray-400">by {a.user_name}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
