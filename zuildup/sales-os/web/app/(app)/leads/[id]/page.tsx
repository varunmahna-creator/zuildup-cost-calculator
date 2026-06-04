import { requireAuth } from '@/lib/auth'
import { getLeadDetail, getUsers } from '@/lib/inboxApiServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  formatDate,
  formatDateTime,
  formatDateRelative,
  ageDays,
  ACTIVITY_ICONS,
  STATUS_COLOR,
  statusTopKey,
} from '@/lib/format'
// Item 9 (feedback 2026-05-25): DispositionBar removed from this page;
// LeadStatusBlock / StatusPicker is now the only disposition surface.
import Assignment from './Assignment'
import ActivityLogger from './ActivityLogger'
import Attachments from './Attachments'
// NextAction tab removed 2026-05-22 (Lane D, QoL sprint) — redundant with
// activity log / Lane B's structured callback flow. NextAction.tsx kept on
// disk in case Lane B reuses parts.
import LeadReplyBox from './LeadReplyBox'
import LeadStatusBlock from './LeadStatusBlock'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params

  // SINGLE SOURCE OF TRUTH: Cloud SQL via inbox-api. All mutations now write
  // to Cloud SQL too (2026-05-14 wave 2). Supabase is auth-only.
  const detail = await getLeadDetail(id)
  if (!detail || !detail.lead) notFound()

  const usersResult = await getUsers()
  const users = usersResult?.users || []
  const userMap: Record<string, string> = {}
  users.forEach((u) => { userMap[u.id] = u.name })

  const lead = detail.lead as any
  const activities = (detail.activities || []) as any[]
  const comms = (detail.comms || []) as any[]

  const assignee = users.find((u) => u.id === lead.assigned_to)
  const canReassign = user.role === 'admin' || user.role === 'director'
  // SPOC can dispose only their own; admin/director can dispose anything
  const canDispose = user.role === 'admin' || user.role === 'director' || lead.assigned_to === user.id
  const ageInDays = lead.date_received ? ageDays(lead.date_received) : (lead.created_at ? ageDays(lead.created_at) : 0)
  const nextDue = formatDateRelative(lead.next_action_due)
  // Bucket-A 2026-06-04 (item 12): hide Next Action UI for terminal
  // statuses (Not Qualified / Junk / Closed Won / Closed Lost /
  // Duplicate). A pending next-action on a closed-out lead is stale by
  // definition.
  const _topStatus = String(lead.status_top || '').trim()
  const _subStatus = String(lead.sub_status || '').trim()
  const _legacyStatus = String(lead.status || '').trim()
  const isTerminalLead = (
    _topStatus === 'Not Qualified'
    || ['Lost', 'Closed Won', 'Closed Lost', 'Duplicate', 'Junk'].includes(_subStatus)
    || ['Junk', 'Lost', 'Closed Won', 'Closed Lost'].includes(_legacyStatus)
  )

  const grouped: Record<string, any[]> = {}
  activities.forEach((a) => {
    const day = (a.created_at || '').substring(0, 10)
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(a)
  })

  return (
    <div>
      <div className="mb-4">
        <Link href={user.role === 'spoc' ? '/inbox' : '/leads'} className="text-sm text-blue-600 hover:underline">← Back</Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{lead.name || '(no name)'}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
              {lead.phone && <span>📞 <a href={"tel:" + lead.phone} className="hover:underline">{lead.phone}</a></span>}
              {lead.email && <span>✉️ <a href={"mailto:" + lead.email} className="hover:underline">{lead.email}</a></span>}
              {lead.location && <span>📍 {lead.location}</span>}
              {lead.lead_source && (
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800 capitalize">
                  {lead.lead_source}
                </span>
              )}
              {lead.tier_hint && (
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded border ${
                  lead.tier_hint === 'A' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                  lead.tier_hint === 'B' ? 'bg-slate-100 text-slate-800 border-slate-200' :
                  lead.tier_hint === 'C' ? 'bg-zinc-100 text-zinc-700 border-zinc-200' :
                  lead.tier_hint === 'PARTNER' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                  'bg-gray-100 text-gray-800 border-gray-200'
                }`}>
                  Tier-{lead.tier_hint}
                </span>
              )}
              {lead.date_received && <span className="text-gray-500">Received: {formatDate(lead.date_received)} ({ageInDays}d ago)</span>}
            </div>
          </div>
          <span
            className={`inline-flex px-3 py-1 text-sm font-medium rounded-full border ${STATUS_COLOR[statusTopKey(lead.status_top)]}`}
            title={lead.sub_status ? `${lead.status_top || '—'} · ${lead.sub_status}` : (lead.status_top || lead.status || 'No status')}
          >
            {lead.sub_status || lead.status_top || lead.status || '—'}
          </span>
        </div>
      </div>

      {/* DispositionBar removed 2026-05-25 (feedback item 9). */}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Project + Comms + Activity */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Project Details</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.project_details || <span className="text-gray-400 italic">No details provided</span>}</p>
            {lead.substatus_reason && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                <strong>Reason:</strong> {lead.substatus_reason}
              </div>
            )}
            {(lead.plot_size || lead.budget_band || lead.floors) && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-700">
                {lead.plot_size && <span>Plot size: <strong>{lead.plot_size}</strong></span>}
                {lead.budget_band && <span>Budget: <strong>{lead.budget_band}</strong></span>}
                {lead.floors && <span>Floors: <strong>{lead.floors}</strong></span>}
              </div>
            )}
          </div>

          {/* NextAction tab removed 2026-05-22 (Lane D, QoL sprint) */}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <ActivityLogger leadId={lead.id} />
          </div>

          <LeadReplyBox leadId={lead.id} tierHint={lead.tier_hint} leadName={lead.name} />

          {comms.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Communications ({comms.length})</h2>
              <ul className="space-y-2">
                {comms.slice(0, 20).map((c: any) => (
                  <li key={c.id} className={`p-3 rounded text-sm ${c.direction === 'inbound' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600">
                        {c.direction === 'inbound' ? '⬅ inbound' : '➡ outbound'} · {c.channel}
                      </span>
                      <span className="text-xs text-gray-500">{c.received_at ? formatDateTime(c.received_at) : ''}</span>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">{c.body_text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Timeline ({activities.length})</h2>
            {Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-gray-400 italic">No activities yet. Log the first call/note above.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([day, items]) => (
                  <div key={day}>
                    <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">{formatDate(day)}</h3>
                    <ul className="space-y-2">
                      {(items as any[]).map((a: any) => (
                        <li key={a.id} className="flex gap-3 p-3 bg-gray-50 rounded">
                          <span className="text-lg">{ACTIVITY_ICONS[a.type as keyof typeof ACTIVITY_ICONS] || '•'}</span>
                          <div className="flex-1 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{a.type}</span>
                              <span className="text-xs text-gray-500">{formatDateTime(a.created_at)}</span>
                            </div>
                            {a.outcome && <p className="text-xs text-gray-600 mt-0.5">Outcome: {a.outcome}</p>}
                            {a.note && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{a.note}</p>}
                            {a.next_action && (
                              <p className="text-xs text-gray-600 mt-1">→ Next: {a.next_action}{a.next_action_due ? ` (due ${formatDateTime(a.next_action_due)})` : ''}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">by {a.user_name || userMap[a.user_id] || 'unknown'}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Status, Assignment, Attachments */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <LeadStatusBlock
              leadId={lead.id}
              userRole={user.role}
              tier={lead.tier_hint ?? null}
              current={{
                status_top: lead.status_top ?? null,
                sub_status: lead.sub_status ?? null,
                loss_reason: lead.loss_reason ?? null,
                loss_reason_text: lead.loss_reason_text ?? null,
                junk_reason: lead.junk_reason ?? null,
                junk_note: lead.junk_note ?? null,
                nqr_reason: lead.nqr_reason ?? null,
                nqr_reason_text: lead.nqr_reason_text ?? null,
                restart_date: lead.restart_date ?? null,
                callback_at: lead.callback_at ?? null,
              }}
            />
            {!isTerminalLead && (
              <div className="mt-3 text-xs text-gray-500">
                Next action: <span className={nextDue.className}>{nextDue.text}</span>
              </div>
            )}
            {/* Item 2 (feedback 2026-05-25): inline collapsible activity logger
                in the right column, using the existing <ActivityLogger /> form. */}
            {canDispose && (
              <details className="mt-4 border-t border-gray-100 pt-3">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer select-none hover:text-gray-900">
                  + Log Activity
                </summary>
                <div className="mt-3">
                  <ActivityLogger leadId={lead.id} />
                </div>
              </details>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Assignment</h2>
            {canReassign ? (
              <Assignment leadId={lead.id} currentAssigneeId={lead.assigned_to} users={users || []} />
            ) : (
              <p className="text-sm text-gray-700">{assignee?.name || lead.assigned_to_name || 'Unassigned'}</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Attachments</h2>
            <Attachments leadId={lead.id} attachments={[]} />
          </div>

          {/* Form-submission details for Meta-origin leads */}
          {lead.fields && Object.keys(lead.fields).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Form submission</h2>
              <dl className="text-sm space-y-1">
                {Object.entries(lead.fields).map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="text-gray-500 capitalize w-32">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-gray-900 flex-1">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
