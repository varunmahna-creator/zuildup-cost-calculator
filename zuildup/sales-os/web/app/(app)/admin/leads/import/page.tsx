import { requireRole } from '@/lib/auth'
import ImportClient from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportLeadsPage() {
  const me = await requireRole(['admin', 'director'])
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Import referral leads</h1>
      <p className="text-sm text-gray-600 mb-6">
        Upload an Excel/CSV with at least <code className="bg-gray-100 px-1 rounded">name</code> and{' '}
        <code className="bg-gray-100 px-1 rounded">phone</code> columns. All leads will be tagged as{' '}
        <strong>referral / Tier A</strong> and round-robin assigned to the sales team.
      </p>
      <ImportClient userName={me.name} />
    </div>
  )
}
