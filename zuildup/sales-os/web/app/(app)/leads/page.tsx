import { requireRole } from '@/lib/auth'
import { getLeadsList, getLeadSources, getUsers } from '@/lib/inboxApiServer'
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
  from?: string
  to?: string
  sort?: string
  page?: string
  open?: string
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['admin', 'director'])
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page || '1', 10))

  // FilterBar uses 'source'/'assignee'/'tier' query keys; legacy form uses lead_source/assigned_to/tier_hint.
  // Accept either for forward-compat with both lanes' deep links.
  const leadSource = params.source ?? params.lead_source
  const assignedTo = params.assignee ?? params.assigned_to
  const tier = params.tier ?? params.tier_hint

  const [leadsResp, sourcesResp, usersResp] = await Promise.all([
    getLeadsList({
      q: params.q,
      status: params.status,
      status_top: params.status_top,
      sub_status: params.sub_status,
      assigned_to: assignedTo,
      lead_source: leadSource,
      tier_hint: tier,
      created_from: params.from,
      created_to: params.to,
      sort: params.sort,
      page,
      limit: PAGE_SIZE,
    }),
    getLeadSources(),
    getUsers(),
  ])

  const leads = leadsResp?.rows || []
  const totalCount = leadsResp?.total || 0
  const sources = sourcesResp?.sources || []
  const users = usersResp?.users || []
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1
  const canOverrideTier = user.role === 'admin' || user.role === 'director'

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} total leads</p>
        </div>
      </div>

      {/* Source filter pills (kept from Lane D) */}
      {sources.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/leads"
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              !leadSource
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            All ({sources.reduce((s, x) => s + x.n, 0)})
          </Link>
          {sources.map((src) => (
            <Link
              key={src.lead_source}
              href={{ query: { ...params, lead_source: src.lead_source, source: src.lead_source, page: '1' } }}
              className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${
                leadSource === src.lead_source
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {src.lead_source} ({src.n})
            </Link>
          ))}
        </div>
      )}

      {/* Lane E FilterBar + SortDropdown header (replaces Lane D's inline form) */}
      <LeadsHeaderClient
        leadSources={sources.map((s) => s.lead_source).filter(Boolean) as string[]}
        assignees={users.map((u) => ({ id: u.id, name: u.name }))}
      />

      <LeadsListClient
        leads={leads}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        canOverrideTier={canOverrideTier}
        initialOpen={params.open ?? null}
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
