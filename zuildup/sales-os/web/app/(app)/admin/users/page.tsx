import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { addUser, removeUser, toggleActive } from './actions'
import PhoneCell from './PhoneCell'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const me = await requireRole(['admin'])
  const supabase = await createClient()

  const { data: allowlist } = await supabase
    .from('user_allowlist')
    .select('email, name, role, active, added_at')
    .order('added_at')

  const { data: realUsers } = await supabase.from('users').select('email, id, phone')
  const realUserMap: Record<string, { id: string; phone: string | null }> = {}
  ;(realUsers || []).forEach((u: { email: string; id: string; phone: string | null }) => {
    realUserMap[u.email.toLowerCase()] = { id: u.id, phone: u.phone }
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">User Management</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Add New User</h2>
        <form action={addUser} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" name="email" required className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" name="name" required className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
            <select name="role" required className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
              <option value="spoc">SPOC</option>
              <option value="director">Director</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-1.5 rounded">Add user</button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Logged In</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(allowlist || []).map((u: { email: string; name: string; role: string; active: boolean; added_at: string }) => {
              const isMe = u.email === me.email
              const real = realUserMap[u.email.toLowerCase()]
              const hasLoggedIn = !!real
              return (
                <tr key={u.email}>
                  <td className="px-4 py-3 text-sm font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-sm">{u.name}</td>
                  <td className="px-4 py-3 text-sm capitalize">{u.role}</td>
                  <td className="px-4 py-3 text-sm">
                    <PhoneCell userId={real?.id ?? null} currentPhone={real?.phone ?? null} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {u.active ? (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-emerald-100 text-emerald-800">Active</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-800">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{hasLoggedIn ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-sm flex gap-2">
                    {!isMe && (
                      <>
                        <form action={toggleActive}>
                          <input type="hidden" name="email" value={u.email} />
                          <input type="hidden" name="active" value={u.active ? 'false' : 'true'} />
                          <button type="submit" className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                            {u.active ? 'Disable' : 'Enable'}
                          </button>
                        </form>
                        <form action={removeUser}>
                          <input type="hidden" name="email" value={u.email} />
                          <button type="submit" className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">Remove</button>
                        </form>
                      </>
                    )}
                    {isMe && <span className="text-xs text-gray-400 italic">(you)</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
