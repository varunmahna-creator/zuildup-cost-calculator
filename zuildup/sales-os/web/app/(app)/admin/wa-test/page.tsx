import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import WaTestClient from './WaTestClient'

// Brief: /opt/ocplatform/workspace/zuildup/IRAAJ_BRIEF_WA_TEST_INTERFACE_2026-05-23.md
// Admin-only smoke-send interface for WhatsApp templates with live delivery
// timeline. Backend routes live in inbox-api at /admin/wa-test/*.

export const dynamic = 'force-dynamic'

export default async function AdminWaTestPage() {
  const me = await requireAuth()
  if (me.role !== 'admin') {
    redirect('/inbox')
  }
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Template Test</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send any APPROVED template to any phone number and watch the
          delivery callbacks live. Sends are flagged{' '}
          <code className="text-xs">is_test=true</code> in{' '}
          <code className="text-xs">wa_messages</code> for audit.
        </p>
      </div>
      <WaTestClient
        currentUser={{ id: me.id, name: me.name, email: me.email }}
      />
    </div>
  )
}
