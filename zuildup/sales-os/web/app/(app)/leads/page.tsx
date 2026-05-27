import { requireRole } from '@/lib/auth'
import { getLeadsList, getUsers } from '@/lib/inboxApiServer'
import Link from 'next/link'
import LeadsListClient from './LeadsListClient'
import LeadsHeaderClient from './LeadsHeaderClient'

export const dynamic = 'force-dynamic'

interface SearchParams {
  assigned_to?: string
  status?: string
  status_top?: string
  sub_status?: string
  q?: string
  lead_source?: string
  tier_hint?: string
  tier?: string  // FilterBar uses 'tier' key
  source?: string  // FilterBar uses 'source' key for lead_source
  assignee?: string  // FilterBar uses 'assignee' key for assigned_to
  partner?: string  // Top-filter partner key (y2g | zu)
  from?: string
  to?: string
  sort?: string
  page?: string
  open?: string
}

// Top-filter partner options.
// Feedback 2026-05-27 (Varun): collapse the campaign-level lead_source pills
// into clean partner buckets — the sales team should only see Y2G vs ZuildUp,
// never the underlying campaign IDs. API param is `partner` (values: y2g | zu).
const PARTNER_FILTERS: { key: string; label: string }[] = [
  { key: 'y2g', label: 'Y2G' },
  { key: 'zu', label: 'ZuildUp' },
]

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['admin', 'director', 'spoc'])
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page || '1', 10))

  // FilterBar uses 'source'/'assignee'/'tier' query keys; legacy form uses lead_source/assigned_to/tier_hint.
  // Accept either for forward-compat with both lanes' deep links.
  const leadSource = params.source ?? params.lead_source
  const assignedTo = params.assignee ?? params.assigned_to
  const tier = params.tier ?? params.tier_hint

  const [leadsResp, usersResp] = await Promise.all([
    getLeadsList({
      q: params.q,
      status: params.status,
      status_top: params.status_top,
      sub_status: params.sub_status,
      assigned_to: assignedTo,
      lead_source: leadSource,
      partner: params.partner,
      tier_hint: tier,
      created_from: params.from,
      created_to: params.to,
      sort: params.sort,
      page,
      limit: PAGE_SIZE,
    }),
    getUsers(),
  ])

  const leads = leadsResp?.rows || []
  const totalCount = leadsResp?.total || 0
  const users = usersResp?.users || []
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1
  const canOverrideTier = user.role === 'admin' || user.role === 'director'

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user.role === 'spoc' ? 'My Leads' : 'All Leads'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} total leads</p>
        </div>
      </div>

      {/* Top partner-filter pills.
          Feedback 2026-05-27 (Varun): replaced raw lead_source pills (which leaked
          campaign IDs into the sales-team UI) with two clean buckets — Y2G + ZuildUp.
          Sales team should never see campaign-level details here. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={{ query: { ...params, partner: undefined, page: '1' } }}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${
            !params.partner
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          All
        </Link>
        {PARTNER_FILTERS.map((p) => (
          <Link
            key={p.key}
            href={{ query: { ...params, partner: p.key, page: '1' } }}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              params.partner === p.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Lane E FilterBar + SortDropdown header (replaces Lane D's inline form).
          leadSources intentionally empty: campaign-level Source dropdown was hiding
          the same campaign IDs as the old top pills — sales team doesn't need it. */}
      <LeadsHeaderClient
        leadSources={[]}
        assignees={users.map((u) => ({ id: u.id, name: u.name }))}
      />

      <LeadsListClient
        leads={leads}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        canOverrideTier={canOverrideTier}
        initialOpen={params.open ?? null}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
      />

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 text-sm">
        <span className="text-gray-500">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={{ query: { ...params, page: String(page - 1) } }}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              ← Prev
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={{ query: { ...params, page: String(page + 1) } }}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
