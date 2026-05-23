import { requireAuth, effectiveScope, effectiveTabs } from '@/lib/auth'
import { redirect } from 'next/navigation'
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
  partner?: string  // qol-sprint-2 2026-05-23 — 'zu' | 'y2g' | 'organic'
  from?: string
  to?: string
  sort?: string
  page?: string
  open?: string
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // qol-sprint-2 2026-05-23: any authenticated user with the 'leads' tab can
  // view this page. The inbox-api enforces scope server-side (SPOCs only see
  // their own leads). UI just renders what the API returns.
  const user = await requireAuth()
  const tabs = effectiveTabs(user)
  if (!tabs.includes('leads')) {
    redirect('/inbox')
  }
  const scope = effectiveScope(user)
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page || '1', 10))

  // FilterBar uses 'source'/'assignee'/'tier' query keys; legacy form uses lead_source/assigned_to/tier_hint.
  // Accept either for forward-compat with both lanes' deep links.
  const leadSource = params.source ?? params.lead_source
  const assignedTo = params.assignee ?? params.assigned_to
  const tier = params.tier ?? params.tier_hint
  const partner = params.partner

  const [leadsResp, sourcesResp, usersResp] = await Promise.all([
    getLeadsList({
      q: params.q,
      status: params.status,
      status_top: params.status_top,
      sub_status: params.sub_status,
      assigned_to: assignedTo,
      lead_source: leadSource,
      partner,
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

  const isScoped = scope === 'assigned_only'
  const pageTitle = isScoped ? 'My Leads' : 'All Leads'
  const subtitle = isScoped
    ? `${totalCount} lead${totalCount === 1 ? '' : 's'} assigned to you`
    : `${totalCount} total leads`

  // Partner filter tabs (qol-sprint-2 2026-05-23 — P0-3 fix).
  // The count badges and the click-through filter use the SAME backend param
  // (`partner=…`) so they can never disagree. Replaces the old lead_source
  // pills which had divergent count/filter logic.
  const partnerTabs = [
    { key: '',        label: 'All' },
    { key: 'zu',      label: 'ZU' },
    { key: 'y2g',     label: 'Y2G' },
    { key: 'organic', label: 'Organic' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Partner filter tabs (qol-sprint-2 2026-05-23) — replaces lead_source pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {partnerTabs.map((t) => {
          const isActive = (partner || '') === t.key
          const nextQuery: any = { ...params, page: '1' }
          if (t.key) {
            nextQuery.partner = t.key
          } else {
            delete nextQuery.partner
          }
          return (
            <Link
              key={t.key || 'all'}
              href={{ query: nextQuery }}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>

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
        page={page}
        pageSize={PAGE_SIZE}
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
