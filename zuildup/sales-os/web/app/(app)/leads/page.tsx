import { requireAuth } from '@/lib/auth'
import LeadsClient from './LeadsClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Leads | ZuildUp Sales OS',
}

/**
 * /leads — sales team's main work surface.
 *
 * Lane E (QoL sprint 2026-05-22) owns the filter bar + sort dropdown shell.
 * Lane D owns the inline-expand row body inside LeadsClient. The shell is
 * deliberately a thin wrapper so the two lanes don't fight over this file.
 */
export default async function LeadsPage() {
  await requireAuth()
  return <LeadsClient />
}
