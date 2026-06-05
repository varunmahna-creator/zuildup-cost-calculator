import { requireRole } from '@/lib/auth'
import { getLeadsList, getUsers } from '@/lib/inboxApiServer'
import { SOURCE_BUCKETS } from '@/lib/sourceBuckets'
import Link from 'next/link'
import LeadsListClient from './LeadsListClient'
import LeadsHeaderClient from './LeadsHeaderClient'
import PartnerFilterChips from './PartnerFilterChips'

export const dynamic = 'force-dynamic'

// Next 15 RSC search params: a key with repeated values arrives as string[].
// Always normalise to string[] so multi-select filters work end-to-end.
type SP = string | string[] | undefined

interface SearchParams {
  assigned_to?: SP
  status?: SP
  status_top?: SP
  sub_status?: SP
  q?: SP
  lead_source?: SP
  tier_hint?: SP
  tier?: SP  // FilterBar uses 'tier' key
  source?: SP  // FilterBar uses 'source' key for lead_source (Meta/Google/Referral bucket OR raw)
  assignee?: SP  // FilterBar uses 'assignee' key for assigned_to
  partner?: SP  // Top-filter partner key (y2g | zu)
  from?: SP
  to?: SP
  sort?: SP
  page?: SP
  open?: SP
}

function first(v: SP): string | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}
function arrayify(v: SP): string[] | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v : [v]
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['admin', 'director', 'spoc'])
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(first(params.page) || '1', 10))

  // FilterBar uses 'source'/'assignee'/'tier' query keys; legacy form uses lead_source/assigned_to/tier_hint.
  // Accept either for forward-compat with both lanes' deep links.
  // Sales feedback 2026-06-05: ?source= now accepts SourceBucket names
  // (Meta/Google/Referral) which get expanded server-side in getLeadsList
  // to the underlying raw lead_source values via /leads/sources catalog.
  const leadSource = arrayify(params.source) ?? arrayify(params.lead_source)
  const assignedTo = arrayify(params.assignee) ?? arrayify(params.assigned_to)
  const tier = arrayify(params.tier) ?? arrayify(params.tier_hint)

  const [leadsResp, usersResp] = await Promise.all([
    getLeadsList({
      q: first(params.q),
      status: first(params.status),
      status_top: first(params.status_top),
      sub_status: first(params.sub_status),
      assigned_to: assignedTo,
      lead_source: leadSource,
      partner: first(params.partner),
      tier_hint: tier,
      created_from: first(params.from),
      created_to: first(params.to),
      sort: first(params.sort),
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
          Sales feedback 2026-05-29: migrated from <Link> to client-side
          PartnerFilterChips which explicitly calls router.refresh() —
          Next 15 Router Cache was serving stale RSC payload on Link
          navigation even with the page set to force-dynamic. */}
      <PartnerFilterChips />

      {/* Lane E FilterBar + SortDropdown header (replaces Lane D's inline form).
          Sales feedback 2026-06-05 (Varun, #zuildup-marketing-engine): the old
          campaign-level Source dropdown was redundant with the top partner pills
          AND too granular (every campaign ID became a chip). Replaced with a
          coarse Meta/Google/Referral taxonomy — see lib/sourceBuckets.ts. Server-
          side getLeadsList() expands these bucket names to the underlying raw
          lead_source values via /leads/sources before hitting inbox-api. */}
      <LeadsHeaderClient
        leadSources={[...SOURCE_BUCKETS]}
        assignees={users.map((u) => ({ id: u.id, name: u.name }))}
        currentUserRole={user.role}
      />

      <LeadsListClient
        leads={leads}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        canOverrideTier={canOverrideTier}
        initialOpen={first(params.open) ?? null}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        currentUserRole={user.role}
        // Bucket-C (2026-06-04) item 9 — bulk-assign dropdown source.
        // Spec: "active spoc+director, NOT admins". Admins manage the team
        // but shouldn't get leads assigned to them in the round-robin sense.
        assignableUsers={users
          .filter((u: any) => u.active !== false && u.role !== 'admin')
          .map((u: any) => ({ id: u.id, name: u.name, role: u.role }))}
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
