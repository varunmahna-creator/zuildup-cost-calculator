'use client'

// Bucket D (2026-06-04) — Pipeline kanban board.
//
// Three columns ('<1m', '1-3m', '>3m') for the actual pipeline, plus a
// banner-style "Needs estimate" section at the top for Qualified leads
// without a closure bucket (so SPOCs can triage them in).
//
// Each card has an inline dropdown to change the bucket. We use optimistic
// updates: state moves immediately, then rolls back if the API rejects.
// Card click → opens the existing lead drawer? We don't ship the drawer
// inline here (it's modal in /leads); instead, clicking a card navigates
// to /leads?open=<id> which the LeadsListClient already handles for deep
// links. This keeps the page small and reuses the existing drawer.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  CLOSURE_BUCKETS,
  CLOSURE_BUCKET_LABEL,
  updateClosureBucket,
  type ClosureBucket,
  type PipelineLead,
  type PipelineBucketKey,
} from '@/lib/leadApi'
import { formatDateTime } from '@/lib/format'
import LeadRowExpanded from '@/components/LeadRowExpanded'

type Buckets = Record<PipelineBucketKey, PipelineLead[]>
type Counts = Record<PipelineBucketKey, number>

interface Props {
  initialBuckets: Buckets
  initialCounts: Counts
  showAssignee: boolean
}

// Visual config per column. Uncategorized is rendered separately above
// the three "real" columns.
const COLUMN_ORDER: ClosureBucket[] = ['<1m', '1-3m', '>3m']
const COLUMN_THEME: Record<ClosureBucket, { header: string; border: string; bg: string }> = {
  '<1m':  { header: 'text-rose-700',    border: 'border-rose-200',    bg: 'bg-rose-50/40' },
  '1-3m': { header: 'text-amber-700',   border: 'border-amber-200',   bg: 'bg-amber-50/40' },
  '>3m':  { header: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50/40' },
}

export default function PipelineBoardClient({ initialBuckets, initialCounts, showAssignee }: Props) {
  // We render from state — but state is only "moved" on optimistic update;
  // the initial render mirrors the server result. (Avoids the
  // state-from-prop antipattern: we never derive state from prop changes
  // after mount; the prop is the seed only.)
  const [buckets, setBuckets] = useState<Buckets>(initialBuckets)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 2026-06-10 (iraaj — Sales feedback): clicking a card opens the lead
  // INLINE within the Pipeline tab (using LeadRowExpanded), instead of
  // routing to /leads?open=<id> which navigated users out to the Leads tab.
  // Mirrors the openId/?open= URL-sync pattern from LeadsListClient.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialOpen = searchParams.get('open')
  const [openId, setOpenId] = useState<string | null>(initialOpen)

  const updateOpenParam = useCallback((id: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (id) next.set('open', id)
    else next.delete('open')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const handleCardClick = useCallback((id: string) => {
    setOpenId((prev) => {
      const nextId = prev === id ? null : id
      updateOpenParam(nextId)
      return nextId
    })
  }, [updateOpenParam])

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && openId) {
        setOpenId(null)
        updateOpenParam(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, updateOpenParam])

  // Keep state in sync if URL changes third-partyly (back/forward).
  useEffect(() => {
    const urlOpen = searchParams.get('open')
    if (urlOpen !== openId) setOpenId(urlOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const counts: Counts = useMemo(() => ({
    '<1m':           buckets['<1m'].length,
    '1-3m':          buckets['1-3m'].length,
    '>3m':           buckets['>3m'].length,
    'uncategorized': buckets.uncategorized.length,
  }), [buckets])

  async function moveLead(lead: PipelineLead, newBucket: ClosureBucket) {
    if (newBucket === lead.estimated_closure_bucket) return
    const fromKey: PipelineBucketKey = (lead.estimated_closure_bucket as PipelineBucketKey | null) ?? 'uncategorized'
    const updatedLead: PipelineLead = { ...lead, estimated_closure_bucket: newBucket }

    // Optimistic: snapshot, mutate.
    const snapshot = buckets
    const next: Buckets = {
      '<1m':           buckets['<1m'].filter((l) => l.id !== lead.id),
      '1-3m':          buckets['1-3m'].filter((l) => l.id !== lead.id),
      '>3m':           buckets['>3m'].filter((l) => l.id !== lead.id),
      'uncategorized': buckets.uncategorized.filter((l) => l.id !== lead.id),
    }
    // Prepend so the moved card surfaces at the top of the new column.
    next[newBucket] = [updatedLead, ...next[newBucket]]
    setBuckets(next)
    setErrorMsg(null)

    startTransition(async () => {
      const r = await updateClosureBucket(lead.id, newBucket)
      if (!r.ok) {
        // Roll back.
        setBuckets(snapshot)
        setErrorMsg(`Couldn't move lead: ${r.error}`)
      }
    })
    void fromKey
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded p-3">
          {errorMsg}
        </div>
      )}

      {/* Uncategorized banner — qualified leads missing a closure date */}
      {counts.uncategorized > 0 && (
        <section className="bg-slate-50 border border-slate-200 rounded p-3">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">
            Needs estimate <span className="text-slate-500 font-normal">({counts.uncategorized})</span>
          </h2>
          <p className="text-xs text-slate-600 mb-3">
            These leads are marked Qualified but don&rsquo;t have an expected closure timeline yet.
            Pick one below to add them to the pipeline.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.uncategorized.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                showAssignee={showAssignee}
                isOpen={openId === lead.id}
                onClick={() => handleCardClick(lead.id)}
                onMove={(b) => moveLead(lead, b)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Three pipeline columns */}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMN_ORDER.map((key) => {
          const theme = COLUMN_THEME[key]
          const list = buckets[key]
          return (
            <section
              key={key}
              className={`rounded border ${theme.border} ${theme.bg}`}
            >
              <header className="px-3 py-2 border-b border-inherit flex items-center justify-between">
                <h2 className={`text-sm font-semibold ${theme.header}`}>
                  {CLOSURE_BUCKET_LABEL[key]}
                </h2>
                <span className="text-xs text-gray-500">{counts[key]}</span>
              </header>
              <div className="p-3 space-y-2 min-h-[120px]">
                {list.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No leads in this bucket</p>
                ) : (
                  list.map((lead) => (
                    <LeadCard
                key={lead.id}
                lead={lead}
                showAssignee={showAssignee}
                isOpen={openId === lead.id}
                onClick={() => handleCardClick(lead.id)}
                onMove={(b) => moveLead(lead, b)}
              />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

interface CardProps {
  lead: PipelineLead
  showAssignee: boolean
  isOpen: boolean
  onClick: () => void
  onMove: (newBucket: ClosureBucket) => void
}

function LeadCard({ lead, showAssignee, isOpen, onClick, onMove }: CardProps) {
  return (
    <article
      className={`bg-white rounded border p-2.5 shadow-sm hover:shadow transition-shadow ${
        isOpen ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onClick}
          className="font-medium text-gray-900 text-sm hover:underline truncate flex-1 min-w-0 text-left"
          title={lead.name || ''}
          aria-expanded={isOpen}
        >
          {lead.name || '(no name)'}
        </button>
        <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">
          {lead.sub_status || ''}
        </span>
      </header>
      <div className="text-xs text-gray-600 mt-1 space-y-0.5">
        {lead.phone && <div className="truncate">📞 {lead.phone}</div>}
        {showAssignee && lead.assigned_to_name && (
          <div className="truncate">👤 {lead.assigned_to_name}</div>
        )}
        {lead.last_activity_at && (
          <div className="truncate text-gray-500">
            Last: {formatDateTime(lead.last_activity_at)}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-[10px] text-gray-500 shrink-0">Move to</label>
        <select
          value={lead.estimated_closure_bucket || ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === '<1m' || v === '1-3m' || v === '>3m') onMove(v)
          }}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white flex-1 min-w-0"
        >
          <option value="" disabled>Pick…</option>
          {CLOSURE_BUCKETS.map((b) => (
            <option key={b} value={b}>{CLOSURE_BUCKET_LABEL[b]}</option>
          ))}
        </select>
      </div>
      {isOpen && (
        <div className="mt-2 -mx-2.5 -mb-2.5 border-t border-blue-200 bg-blue-50/30 rounded-b">
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
              status_top: lead.status_top,
              sub_status: lead.sub_status,
              estimated_closure_bucket: lead.estimated_closure_bucket,
              fields: (lead.fields as Record<string, any> | null | undefined) ?? null,
            }}
            canOverrideTier={false}
            onStatusSaved={() => {
              // Pipeline owns its own optimistic mutation for the bucket
              // dropdown; for any other status change, refresh from server
              // so the kanban reshuffles correctly.
              // We rely on parent router.refresh() via a global hook —
              // safe to call via window.location since pipeline page is SSR.
              if (typeof window !== 'undefined') window.location.reload()
            }}
          />
        </div>
      )}
    </article>
  )
}
