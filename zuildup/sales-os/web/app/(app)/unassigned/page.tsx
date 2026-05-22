import { requireRole } from '@/lib/auth'
import { getLeadsList, getUsers } from '@/lib/inboxApiServer'
import { reassignLead } from '../leads/[id]/actions'
import { truncate } from '@/lib/format'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatDate(s: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toISOString().slice(0, 10) } catch { return s }
}

export default async function UnassignedPage() {
  await requireRole(['admin', 'director'])

  const [leadsResp, usersResp] = await Promise.all([
    getLeadsList({ assigned_to: 'unassigned', limit: 200 }),
    getUsers(),
  ])
  const leads = leadsResp?.rows || []
  const users = (usersResp?.users || []).filter((u) => u.role === 'spoc' || u.role === 'director')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Unassigned Leads</h1>
        <p className="text-sm text-gray-500 mt-1">{leads.length} leads waiting for assignment</p>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assign to</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.length > 0 ? leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline font-medium">{lead.name || '(no name)'}</Link>
                </td>
                <td className="px-4 py-3 text-sm">{lead.phone || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  {lead.lead_source ? (
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800 capitalize">{lead.lead_source}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {lead.tier_hint ? (
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                      lead.tier_hint === 'A' ? 'bg-emerald-100 text-emerald-800' :
                      lead.tier_hint === 'B' ? 'bg-amber-100 text-amber-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{lead.tier_hint}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">{lead.location || '—'}</td>
                <td className="px-4 py-3 text-sm" title={lead.project_details || ''}>{truncate(lead.project_details, 30) || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(lead.date_received)}</td>
                <td className="px-4 py-3 text-sm">
                  <form action={reassignLead} className="flex items-center gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select name="assigned_to" className="border border-gray-300 rounded px-2 py-1 text-xs">
                      <option value="">—</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded">Assign</button>
                  </form>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">All leads are assigned. 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
