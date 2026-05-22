'use client'

/**
 * LeadStatusBlock — client wrapper for the status section on the lead detail
 * page. Renders <StatusPicker /> + <TierBadge /> side-by-side, wired to
 * leadApi (changeStatus / overrideTier). Falls back to the legacy
 * server-action StatusChanger via a 'compat mode' prop (off by default).
 *
 * Lane B's endpoints aren't deployed yet, so leadApi mocks the calls; once
 * Lane B is green flip USE_MOCK_LEAD_API in lib/leadApi.ts.
 */

import { useRouter } from 'next/navigation'
import StatusPicker from '@/components/StatusPicker'
import TierBadge from '@/components/TierBadge'
import { changeStatus, overrideTier, type ChangeStatusPayload } from '@/lib/leadApi'

interface Props {
  leadId: string
  userRole: string
  tier: string | null
  current: {
    status_top: string | null
    sub_status: string | null
    loss_reason: string | null
    loss_reason_text: string | null
    junk_reason: string | null
    nqr_reason: string | null
    nqr_reason_text: string | null
    restart_date: string | null
    callback_at: string | null
  }
}

export default function LeadStatusBlock({ leadId, userRole, tier, current }: Props) {
  const router = useRouter()

  async function onStatusSave(payload: ChangeStatusPayload) {
    const res = await changeStatus(leadId, payload)
    if (!res.ok) throw new Error(res.error || 'change failed')
    // Soft refresh so server-rendered data picks up the new state.
    router.refresh()
  }

  async function onTierOverride(_id: string, newTier: 'A' | 'B' | 'C') {
    const res = await overrideTier(leadId, newTier)
    if (!res.ok) throw new Error(res.error || 'override failed')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Status</h2>
        <TierBadge tier={tier} leadId={leadId} userRole={userRole} onOverride={onTierOverride} />
      </div>
      <StatusPicker leadId={leadId} current={current} onSave={onStatusSave} />
    </div>
  )
}
