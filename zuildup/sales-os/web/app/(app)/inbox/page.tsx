import { requireAuth } from '@/lib/auth'
import InboxClient from './InboxClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Inbox | ZuildUp Sales OS',
}

/**
 * Lane D inbox: 3-column conversations view backed by the Cloud Run
 * inbox-api + comms-send services. Auth is enforced via Supabase session
 * (server-side requireAuth); the client shell then mints a short-lived
 * HS256 JWT via /api/inbox-jwt for the downstream services.
 */
export default async function InboxPage() {
  await requireAuth()
  return <InboxClient />
}
