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
import InlineActivityLogger from './InlineActivityLogger'

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
  // jsonb of original form-submission fields (varies by lead source)
  fields?: Record<string, any> | null
}

// Helpers — Sales OS feedback 2026-05-27: surface form-submitted details inline
// so SPOCs don't have to navigate into the full lead page to see budget /
// plot_status / readiness etc. Real-world data has TWO key conventions:
//   (a) snake_clean keys (FAR LP, newer forms): budget, plot_status, plot_size,
//       build_readiness, preferred_tier, city, plot_area, ...
//   (b) question-text keys (Meta Lead Ads): "what_is_your_budget?",
//       "do_you_own_a_plot_or_site?", "when_are_you_planning_to_construct?",
//       "plot_location", ...
// We map both to the same 6 display rows below.
type FieldRow = { label: string; value: string }
const FIELD_LABELS: Array<{ label: string; keys: string[] }> = [
  { label: 'Budget',          keys: ['budget', 'what_is_your_budget?'] },
  { label: 'Plot status',     keys: ['plot_status', 'do_you_own_a_plot_or_site?'] },
  { label: 'Plot size',       keys: ['plot_size', 'plot_area', 'plotArea'] },
  { label: 'Readiness',       keys: ['build_readiness', 'when_are_you_planning_to_construct?'] },
  { label: 'Preferred tier',  keys: ['preferred_tier'] },
  { label: 'City',            keys: ['city', 'plot_location'] },
]
const HIDE_KEYS = new Set([
  'full_name', 'email', 'phone_number', 'phone', 'name',
  'page_slug', 'source', 'form_type',
])
function extractFieldRows(fields: Record<string, any> | null | undefined): { primary: FieldRow[]; extras: FieldRow[] } {
  if (!fields || typeof fields !== 'object') return { primary: [], extras: [] }
  const used = new Set<string>()
  const primary: FieldRow[] = []
  for (const { label, keys } of FIELD_LABELS) {
    for (const k of keys) {
      const v = fields[k]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        primary.push({ label, value: String(v).replace(/_/g, ' ').trim() })
        used.add(k)
        break
      }
    }
  }
  const extras: FieldRow[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (used.has(k) || HIDE_KEYS.has(k)) continue
    if (v === null || v === undefined || String(v).trim() === '') continue
    extras.push({
      label: k.replace(/[?_]/g, ' ').replace(/\s+/g, ' ').trim(),
      value: String(v).replace(/_/g, ' ').trim(),
    })
  }
  return { primary, extras }
}

interface Props {
  lead: LeadRowExpandedLead
  canOverrideTier?: boolean
  userRole?: string
  onStatusSaved?: () => void
  // Bucket-C (2026-06-04) items 7 & 8 — pencil-edit name & soft-delete buttons.
  // Either `userRole` (legacy alias) or `currentUserRole` may carry the role.
  currentUserRole?: string
  onLeadDeleted?: () => void
}

export default function LeadRowExpanded({
  lead,
  canOverrideTier,
  userRole,
  onStatusSaved,
  currentUserRole,
  onLeadDeleted,
}: Props) {
  const effectiveRole = currentUserRole || userRole || (canOverrideTier ? 'admin' : 'spoc')
  const isAdminOrDirector = effectiveRole === 'admin' || effectiveRole === 'director'
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [priors, setPriors] = useState<PriorSubmission[]>([])
  const [loading, setLoading] = useState(true)

  // ── Bucket-C (2026-06-04) item 7 — inline edit lead name ────────────────
  // displayName is THE source of truth for what's rendered, seeded from the
  // prop but updatable optimistically. We deliberately AVOID the
  // state-from-prop antipattern (MEMORY.md 2026-05-29): the only sync from
  // prop to state is the *first* mount (initial state) and an explicit
  // resetEffect on lead.id change (i.e. when a different lead is opened).
  // We don't sync on every prop change — that would clobber in-flight edits.
  const [displayName, setDisplayName] = useState<string>(lead.name || '')
  useEffect(() => {
    setDisplayName(lead.name || '')
    // Reset edit/delete UI when the row changes underneath us.
    setEditingName(false)
    setDraftName('')
    setNameSaving(false)
    setNameError(null)
    setDeleteOpen(false)
    setDeleteConfirmText('')
    setDeleting(false)
    setDeleteError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const startEditName = () => {
    setDraftName(displayName)
    setNameError(null)
    setEditingName(true)
  }
  const cancelEditName = () => {
    setEditingName(false)
    setDraftName('')
    setNameError(null)
  }
  const saveName = async () => {
    const trimmed = draftName.trim()
    if (!trimmed) { setNameError('Name cannot be empty.'); return }
    if (trimmed === displayName) { setEditingName(false); return }
    setNameSaving(true)
    setNameError(null)
    const { renameLead } = await import('@/lib/leadApi')
    const r = await renameLead(lead.id, trimmed)
    setNameSaving(false)
    if (!r.ok) {
      setNameError(r.error || 'Failed to save')
      return
    }
    setDisplayName(trimmed)
    setEditingName(false)
    // Refresh activity log so the new "name_changed" entry appears.
    fetchLeadActivities(lead.id).then(setActivities).catch(() => {})
  }

  // ── Bucket-C (2026-06-04) item 8 — soft-delete with type-DELETE confirm ─
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const runDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    const { softDeleteLead } = await import('@/lib/leadApi')
    const r = await softDeleteLead(lead.id)
    setDeleting(false)
    if (!r.ok) {
      setDeleteError(r.error || 'Failed to delete')
      return
    }
    setDeleteOpen(false)
    onLeadDeleted?.()
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchLeadActivities(lead.id),
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
              <div className="flex gap-2 items-start">
                <dt className="text-gray-500 w-20 shrink-0 pt-0.5">Name</dt>
                <dd className="text-gray-900 flex-1">
                  {editingName ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveName() }
                          if (e.key === 'Escape') { e.preventDefault(); cancelEditName() }
                        }}
                        maxLength={200}
                        className="border border-gray-300 rounded px-2 py-0.5 text-sm w-full max-w-[260px]"
                        disabled={nameSaving}
                        aria-label="Lead name"
                      />
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={saveName}
                          disabled={nameSaving || !draftName.trim()}
                          className="px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {nameSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditName}
                          disabled={nameSaving}
                          className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        {nameError && <span className="text-rose-600">{nameError}</span>}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span>{displayName || <span className="text-gray-400 italic">—</span>}</span>
                      {isAdminOrDirector && (
                        <button
                          type="button"
                          onClick={startEditName}
                          aria-label="Edit lead name"
                          title="Edit lead name (admin/director)"
                          className="text-gray-400 hover:text-indigo-600"
                        >
                          {/* lucide-react Pencil icon, inlined to avoid bundle bloat */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"/>
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
                          </svg>
                        </button>
                      )}
                    </span>
                  )}
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

          {/* Form submission details — feedback 2026-05-27.
              Surfaces keys the user actually filled on the lead form so
              SPOCs can prioritize without opening full lead page. */}
          {(() => {
            const { primary, extras } = extractFieldRows(lead.fields)
            if (primary.length === 0 && extras.length === 0) return null
            return (
              <div className="bg-white rounded border border-gray-200 p-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Form details
                </h4>
                <dl className="text-sm space-y-1">
                  {primary.map((row) => (
                    <div key={row.label} className="flex gap-2">
                      <dt className="text-gray-500 w-28 shrink-0">{row.label}</dt>
                      <dd className="text-gray-900 flex-1 font-medium">{row.value}</dd>
                    </div>
                  ))}
                  {extras.length > 0 && (
                    <details className="pt-1">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        More details ({extras.length})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {extras.map((row) => (
                          <div key={row.label} className="flex gap-2">
                            <dt className="text-gray-500 w-28 shrink-0 capitalize">{row.label}</dt>
                            <dd className="text-gray-900 flex-1">{row.value}</dd>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </dl>
              </div>
            )
          })()}
        </div>

        {/* MIDDLE: Prior submissions — Bucket B item 5 (2026-06-04):
            clicking a prior row expands the panel inline to show that prior
            lead's activities. Fetched lazily on first expand. */}
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
                <ul className="space-y-1 max-h-[420px] overflow-y-auto">
                  {priors.map((p) => (
                    <PriorSubmissionRow key={p.id} prior={p} />
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

        {/* RIGHT: Recent activity — Bucket B item 4 (2026-06-04):
            shows ALL activities (no pagination); outer container scrolls,
            and any long-text entry scrolls in-row instead of truncating. */}
        <div className="space-y-3 lg:col-span-1">
          <div className="bg-white rounded border border-gray-200 p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Recent activity {activities.length > 0 && (
                <span className="ml-1 text-[10px] font-normal text-gray-400">({activities.length})</span>
              )}
            </h4>
            {loading ? (
              <p className="text-xs text-gray-400 italic">Loading…</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No activities yet.</p>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
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
                        <p className="text-xs text-gray-600 break-words">Outcome: {a.outcome}</p>
                      )}
                      {a.note && (
                        a.note.length > 200 ? (
                          <div className="text-xs text-gray-700 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-gray-50 rounded px-1.5 py-1 mt-0.5">
                            {a.note}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{a.note}</p>
                        )
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
          {/* Item 2 (feedback 2026-05-26): inline activity logger so SPOCs
              can log calls/notes/next-actions without leaving /leads. */}
          <InlineActivityLogger
            leadId={lead.id}
            onLogged={() => {
              // Re-fetch the activities list so the new entry shows up.
              fetchLeadActivities(lead.id).then((acts) => setActivities(acts))
            }}
          />
        </div>
      </div>

      {/* Bucket-C (2026-06-04) item 8 — soft-delete (admin/director only). */}
      {isAdminOrDirector && (
        <div className="mt-4 pt-3 border-t border-rose-100 flex justify-end">
          <button
            type="button"
            onClick={() => { setDeleteOpen(true); setDeleteConfirmText(''); setDeleteError(null); }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-rose-600 text-white rounded hover:bg-rose-700"
            aria-label="Delete this lead"
            title="Soft-delete this lead (admin/director only)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete lead
          </button>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-rose-700">Delete this lead?</h3>
            <p className="mt-2 text-sm text-gray-700">
              This will soft-delete <span className="font-semibold">{displayName || '(unnamed)'}</span>.
              The row will disappear from all views; the underlying record stays in the database
              with a <code className="bg-gray-100 px-1 rounded">deleted_at</code> timestamp.
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Type <code className="bg-gray-100 px-1 rounded font-mono">DELETE</code> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono uppercase"
              placeholder="DELETE"
              disabled={deleting}
            />
            {deleteError && (
              <p className="mt-2 text-sm text-rose-600">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
                disabled={deleting}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDelete}
                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="px-3 py-1.5 bg-rose-600 text-white rounded text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Prior submission row (Bucket B item 5, 2026-06-04) ─────────────────────
// Renders a single prior-submission link; clicking the chevron expands an
// inline activities panel for that prior lead. Lazy-fetches activities on
// first expand. Each open row is independent (no shared open-state).
function PriorSubmissionRow({ prior }: { prior: PriorSubmission }) {
  const [open, setOpen] = useState(false)
  const [activities, setActivities] = useState<LeadActivity[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    // Lazy-load on first open only.
    if (next && activities === null && !loading) {
      setLoading(true)
      try {
        const acts = await fetchLeadActivities(prior.id)
        setActivities(acts)
      } catch {
        setActivities([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <li className="text-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse prior submission activities' : 'Expand prior submission activities'}
          className="text-gray-400 hover:text-gray-600 w-4 shrink-0"
        >
          {open ? '▾' : '▸'}
        </button>
        <Link
          href={`/leads?open=${prior.id}`}
          className="text-blue-600 hover:underline"
        >
          {prior.lead_source || 'unknown'} · {formatDate(prior.created_at)}
        </Link>
        {(prior.status_top || prior.status) && (
          <span className="ml-1 text-xs text-gray-500">
            {prior.status_top}
            {prior.sub_status ? ` / ${prior.sub_status}` : ''}
            {!prior.status_top && prior.status ? prior.status : ''}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-1 ml-5 border-l-2 border-gray-200 pl-3">
          {loading ? (
            <p className="text-[11px] text-gray-400 italic">Loading activities…</p>
          ) : !activities || activities.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">No activities recorded.</p>
          ) : (
            <ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-1.5 text-xs">
                  <span className="leading-tight">{ACTIVITY_ICONS[a.type] || '•'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-gray-800 truncate">{a.type}</span>
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {formatDateTime(a.created_at)}
                      </span>
                    </div>
                    {a.note && (
                      a.note.length > 200 ? (
                        <div className="text-[11px] text-gray-700 whitespace-pre-wrap break-words max-h-24 overflow-y-auto bg-gray-50 rounded px-1.5 py-1">
                          {a.note}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-700 whitespace-pre-wrap break-words">{a.note}</p>
                      )
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
      )}
    </li>
  )
}
