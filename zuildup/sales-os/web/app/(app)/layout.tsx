import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  const signOut = async () => {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-gray-900">ZuildUp Sales OS</h1>
              <nav className="hidden md:flex gap-6">
                <Link href="/dashboard" className="text-gray-700 hover:text-gray-900">
                  Dashboard
                </Link>
                <Link
                  href="/inbox"
                  className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900"
                >
                  <MessageSquare className="w-4 h-4" />
                  Inbox
                </Link>
                {(user.role === 'admin' || user.role === 'director') && (
                  <>
                    <Link href="/leads" className="text-gray-700 hover:text-gray-900">
                      All Leads
                    </Link>
                    <Link href="/unassigned" className="text-gray-700 hover:text-gray-900">
                      Unassigned
                    </Link>
                    <Link href="/admin/team-actions" className="text-gray-700 hover:text-gray-900">
                      Team Actions
                    </Link>
                  </>
                )}
                {user.role === 'admin' && (
                  <Link href="/admin/users" className="text-gray-700 hover:text-gray-900">
                    Users
                  </Link>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                <div className="text-xs text-gray-500 capitalize">{user.role}</div>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
