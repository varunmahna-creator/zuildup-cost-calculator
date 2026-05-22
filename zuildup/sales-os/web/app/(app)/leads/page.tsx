import { requireRole } from '@/lib/auth'
import { getLeadsList, getLeadSources, getUsers } from '@/lib/inboxApiServer'
import { LEAD_STATUSES } from '@/lib/format'
import Link from 'next/link'
import LeadsListClient from './LeadsListClient'

export const dynamic = 'force-dynamic'

interface SearchParams {
  assigned_to?: string
  status?: string
  q?: string
  lead_source?: string
  tier_hint?: string
  page?: string
  open?: string
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['admin', 'director'])
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page || '1', 10))

  const [leadsResp, sourcesResp, usersResp] = await Promise.all([
    getLeadsList({
      q: params.q,
      status: params.status,
      assigned_to: params.assigned_to,
      lead_source: params.lead_source,
      tier_hint: params.tier_hint,
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Leads</h1>
        <p className="text-sm text-gray-500 mt-1">{totalCount} total leads</p>
      </div>

      {/* Source filter pills */}
      {sources.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/leads"
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              !params.lead_source
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            All ({sources.reduce((s, x) => s + x.n, 0)})
          </Link>
          {sources.map((src) => (
            <Link
              key={src.lead_source}
              href={{ query: { ...params, lead_source: src.lead_source, page: '1' } }}
              className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${
                params.lead_source === src.lead_source
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {src.lead_source} ({src.n})
            </Link>
          ))}
        </div>
      )}

      {/* Filters (Lane E will replace with FilterBar) */}
      <form className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={params.q || ''}
            placeholder="name, phone, email…"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Assigned to</label>
          <select
            name="assigned_to"
            defaultValue={params.assigned_to || ''}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            name="status"
            defaultValue={params.status || ''}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Any</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tier</label>
          <select
            name="tier_hint"
            defaultValue={params.tier_hint || ''}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Any</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="PARTNER">PARTNER</option>
          </select>
        </div>
        {params.lead_source && (
          <input type="hidden" name="lead_source" value={params.lead_source} />
        )}
        {params.open && <input type="hidden" name="open" value={params.open} />}
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded"
        >
          Apply
        </button>
        <Link href="/leads" className="text-sm text-gray-500 hover:underline">
          Reset
        </Link>
      </form>

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
