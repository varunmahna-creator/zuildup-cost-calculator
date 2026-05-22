import { requireAuth } from '@/lib/auth'
import { getDashboardBuckets, getDashboardAnalytics, getTeamOverdue, getUsers, type Lead } from '@/lib/inboxApiServer'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function humanizeRelative(due: Date): string {
  const diffMs = due.getTime() - Date.now()
  const overdue = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.floor(absMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  let phrase: string
  if (days >= 1) phrase = `${days}d`
  else if (hours >= 1) phrase = `${hours}h`
  else phrase = `${Math.max(1, minutes)}m`
  return overdue ? `${phrase} overdue` : `in ${phrase}`
}

function bucketColor(due: Date): string {
  const diffMs = due.getTime() - Date.now()
  if (diffMs < 0) return 'text-red-700'
  if (diffMs < 24 * 3600 * 1000) return 'text-amber-700'
  return 'text-emerald-700'
}

export default async function DashboardPage() {
  const user = await requireAuth()
  const isAdminOrDirector = user.role === 'admin' || user.role === 'director'

  // For SPOC: personal buckets only. For admin/director: team buckets + analytics + team-overdue.
  const [bucketsResp, analyticsResp, teamOverdueResp, usersResp] = await Promise.all([
    getDashboardBuckets(isAdminOrDirector ? undefined : user.id),
    isAdminOrDirector ? getDashboardAnalytics() : Promise.resolve(null),
    isAdminOrDirector ? getTeamOverdue() : Promise.resolve(null),
    isAdminOrDirector ? getUsers() : Promise.resolve(null),
  ])

  const myOverdue = bucketsResp?.overdue || []
  const myToday = bucketsResp?.today || []
  const myUpcoming = bucketsResp?.upcoming || []
  const teamOverdue = teamOverdueResp?.rows || []
  const userMap: Record<string, string> = {}
  ;(usersResp?.users || []).forEach((u) => { userMap[u.id] = u.name })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {isAdminOrDirector ? 'Dashboard' : 'My Day'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Hi {user.name?.split(' ')[0] || 'there'} — here&apos;s what needs attention.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Bucket
          title="⏰ Overdue"
          accent="border-red-300 bg-red-50"
          countAccent="text-red-700"
          leads={myOverdue}
          emptyText="Nothing overdue. Nice."
        />
        <Bucket
          title="📅 Today"
          accent="border-amber-300 bg-amber-50"
          countAccent="text-amber-700"
          leads={myToday}
          emptyText="Nothing due today."
        />
        <Bucket
          title="📋 Upcoming (7d)"
          accent="border-emerald-300 bg-emerald-50"
          countAccent="text-emerald-700"
          leads={myUpcoming}
          emptyText="Nothing in the next 7 days."
        />
      </div>

      {isAdminOrDirector && teamOverdue.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">🌐 All overdue across team ({teamOverdue.length})</h2>
            <Link href="/admin/team-actions" className="text-xs text-blue-600 hover:underline">
              Open team actions →
            </Link>
          </div>
          <div className="space-y-4">
            {(() => {
              const groups: Record<string, any[]> = {}
              teamOverdue.forEach((l) => {
                const k = l.assigned_to || 'unassigned'
                if (!groups[k]) groups[k] = []
                groups[k].push(l)
              })
              return Object.entries(groups).map(([spocId, items]) => (
                <div key={spocId}>
                  <h3 className="text-xs font-medium text-gray-700 uppercase mb-2">
                    {items[0]?.assigned_to_name || userMap[spocId] || 'Unknown'} ({items.length})
                  </h3>
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
                    {items.map((l: any) => (
                      <li key={l.id}>
                        <Link href={`/leads/${l.id}`} className="block px-3 py-2 hover:bg-gray-50 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900 truncate">{l.name || '(no name)'}</span>
                            <span className="text-xs text-red-700 whitespace-nowrap">
                              {l.next_action_type} · {humanizeRelative(new Date(l.next_action_due))}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {isAdminOrDirector && analyticsResp && (
        <AdminAnalytics
          kpis={analyticsResp.kpis}
          funnel={analyticsResp.funnel}
          sources={analyticsResp.sources}
          scorecards={analyticsResp.scorecards}
        />
      )}
    </div>
  )
}

function Bucket({
  title,
  accent,
  countAccent,
  leads,
  emptyText,
}: {
  title: string
  accent: string
  countAccent: string
  leads: Lead[]
  emptyText: string
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <span className={`text-xl font-bold ${countAccent}`}>{leads.length}</span>
      </div>
      {leads.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {leads.slice(0, 12).map((l) => (
            <li key={l.id}>
              <Link
                href={`/leads/${l.id}`}
                className="block bg-white rounded px-2 py-1.5 hover:shadow-sm border border-transparent hover:border-gray-200 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {l.name || '(no name)'}
                  </span>
                  <span className={`text-xs whitespace-nowrap ${bucketColor(new Date(l.next_action_due!))}`}>
                    {humanizeRelative(new Date(l.next_action_due!))}
                  </span>
                </div>
                <div className="text-xs text-gray-600 truncate">
                  {l.next_action_type} {l.phone ? `· ${l.phone}` : ''}
                </div>
              </Link>
            </li>
          ))}
          {leads.length > 12 && (
            <li className="text-xs text-gray-500 text-center pt-1">
              +{leads.length - 12} more
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function AdminAnalytics({
  kpis,
  funnel,
  sources,
  scorecards,
}: {
  kpis: { total: number; new_7d: number; sql_plus: number; won: number; lost: number; junk: number }
  funnel: { name: string; count: number }[]
  sources: { lead_source: string; n: number }[]
  scorecards: any[]
}) {
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))
  const totalSources = sources.reduce((s, x) => s + x.n, 0)

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">Team analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi label="Total Leads" value={kpis.total} />
        <Kpi label="New (7d)" value={kpis.new_7d} />
        <Kpi label="SQL+" value={kpis.sql_plus} accent="text-emerald-600" />
        <Kpi label="Won" value={kpis.won} accent="text-emerald-600" />
        <Kpi label="Lost" value={kpis.lost} accent="text-red-600" />
        <Kpi label="Junk" value={kpis.junk} accent="text-gray-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Funnel</h3>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.name} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-700">{f.name}</span>
                <div className="flex-1 bg-gray-100 rounded h-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-full bg-blue-500" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-sm font-medium">{f.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Lead Sources</h3>
          <div className="space-y-2">
            {sources.map((src) => (
              <div key={src.lead_source} className="flex items-center gap-3">
                <span className="w-32 text-sm capitalize text-gray-700">{src.lead_source}</span>
                <div className="flex-1 bg-gray-100 rounded h-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-full bg-purple-500" style={{ width: `${(src.n / Math.max(1, totalSources)) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-sm font-medium">{src.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Per-SPOC Scorecards</h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="text-left">
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Leads</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Contacted</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Contact %</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">SQL+</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">SQL %</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Won</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Conv %</th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase">Activities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scorecards.map((s) => (
              <tr key={s.id}>
                <td className="px-2 py-2 text-sm font-medium">{s.name} <span className="text-xs text-gray-500">({s.role})</span></td>
                <td className="px-2 py-2 text-sm">{s.total}</td>
                <td className="px-2 py-2 text-sm">{s.contacted}</td>
                <td className="px-2 py-2 text-sm">{s.contact_rate}%</td>
                <td className="px-2 py-2 text-sm">{s.sql}</td>
                <td className="px-2 py-2 text-sm">{s.sql_rate}%</td>
                <td className="px-2 py-2 text-sm">{s.won}</td>
                <td className="px-2 py-2 text-sm font-semibold text-emerald-700">{s.conversion_rate}%</td>
                <td className="px-2 py-2 text-sm">{s.activities}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
