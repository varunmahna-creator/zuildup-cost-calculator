import { requireRole } from '@/lib/auth'
import { getLeadsList, getLeadSources, getUsers } from '@/lib/inboxApiServer'
import {
  formatDateRelative,
  LEAD_STATUSES,
  STATUS_TOP,
  STATUS_COLOR,
  ROW_BORDER_COLOR,
  statusTopKey,
} from '@/lib/format'
import TierBadge from '@/components/TierBadge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface SearchParams {
  assigned_to?: string
  status?: string         // legacy enum (kept for back-compat shadow column)
  status_top?: string     // new top-level status
  q?: string
  lead_source?: string
  tier_hint?: string
  page?: string
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['admin', 'director'])
  const params = await searchParams

  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(params.page || '1', 10))

  // Fetch leads, sources, users in parallel.
  const [leadsResp, sourcesResp, usersResp] = await Promise.all([
    getLeadsList({
      q: params.q,
      status: params.status,
      // Lane B will accept status_top on the listing endpoint. For now we pass
      // it through; the API ignores unknown params, so this is forward-safe.
      status_top: params.status_top,
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
              !params.lead_source ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
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

      {/* Filters */}
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
          <select name="assigned_to" defaultValue={params.assigned_to || ''} className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status (top)</label>
          <select name="status_top" defaultValue={params.status_top || ''} className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">Any</option>
            {STATUS_TOP.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Legacy status</label>
          <select name="status" defaultValue={params.status || ''} className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">Any</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tier</label>
          <select name="tier_hint" defaultValue={params.tier_hint || ''} className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">Any</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="PARTNER">PARTNER</option>
          </select>
        </div>
        {params.lead_source && <input type="hidden" name="lead_source" value={params.lead_source} />}
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded">Apply</button>
        <Link href="/leads" className="text-sm text-gray-500 hover:underline">Reset</Link>
      </form>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.length > 0 ? leads.map((lead) => {
              const nextDue = formatDateRelative(lead.next_action_due)
              const assignee = users.find((u) => u.id === lead.assigned_to)
              const topKey = statusTopKey(lead.status_top)
              const rowBorder = ROW_BORDER_COLOR[topKey]
              const pill = STATUS_COLOR[topKey]
              return (
                <tr key={lead.id} className={`hover:bg-gray-50 ${rowBorder}`}>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline font-medium">
                      {lead.name || '(no name)'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {lead.phone ? <a href={`tel:${lead.phone}`} className="text-gray-900 hover:underline">{lead.phone}</a> : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {lead.lead_source ? (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800 capitalize">
                        {lead.lead_source}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <TierBadge tier={lead.tier_hint ?? null} leadId={lead.id} userRole={user.role} readOnly />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${pill}`}
                      title={lead.sub_status ? `${lead.status_top || '—'} · ${lead.sub_status}` : (lead.status_top || lead.status || 'No status')}
                    >
                      {lead.status_top || lead.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {lead.sub_status || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{assignee?.name || <span className="text-gray-400 italic">unassigned</span>}</td>
                  <td className={`px-4 py-3 text-sm ${nextDue.className}`}>{nextDue.text}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{(() => { const d = lead.created_at || lead.date_received; if (!d) return '—'; const dt = new Date(d); return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); })()}</td>
                </tr>
              )
            }) : (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 text-sm">
        <span className="text-gray-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={{ query: { ...params, page: String(page - 1) } }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">← Prev</Link>
          )}
          {page < totalPages && (
            <Link href={{ query: { ...params, page: String(page + 1) } }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">Next →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
