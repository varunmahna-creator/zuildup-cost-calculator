import { requireAuth } from '@/lib/auth'
import { getPipeline } from '@/lib/inboxApiServer'
import PipelineBoardClient from './PipelineBoardClient'

export const dynamic = 'force-dynamic'

// Bucket D (2026-06-04) — Pipeline tab.
// Sales-team feedback item 10. Qualified-and-not-closed leads grouped by
// expected closure timeline ('<1m' / '1-3m' / '>3m' + 'uncategorized'),
// kanban-style. SPOC scope enforced server-side by inbox-api /pipeline
// (users.lead_scope = assigned_only).
//
// Renders a client component that owns the inline bucket dropdowns +
// optimistic updates via PATCH /leads/:id/estimated-closure.
export default async function PipelinePage() {
  const user = await requireAuth()
  const data = await getPipeline()

  const buckets = data?.buckets || {
    '<1m': [],
    '1-3m': [],
    '>3m': [],
    'uncategorized': [],
  }
  const counts = data?.counts || { '<1m': 0, '1-3m': 0, '>3m': 0, 'uncategorized': 0 }
  const total = data?.total || 0

  const showAssignee = user.role === 'admin' || user.role === 'director'

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} qualified lead{total === 1 ? '' : 's'}
            {showAssignee ? ' across the team' : ' assigned to you'}
            {counts.uncategorized > 0 ? ` — ${counts.uncategorized} need an estimated closure date` : ''}
          </p>
        </div>
      </div>

      <PipelineBoardClient
        initialBuckets={buckets}
        initialCounts={counts}
        showAssignee={showAssignee}
      />
    </div>
  )
}
