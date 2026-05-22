'use client'

// STUB — Lane C owns the real TierBadge (with admin/director override). Lane
// D ships this placeholder so the build compiles ahead of Lane C landing.
// Umbrella PR resolves the conflict.

interface Props {
  tier: string | null | undefined
  canOverride?: boolean
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  leadId?: string
}

const TIER_CLASS: Record<string, string> = {
  A: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  B: 'bg-slate-100 text-slate-800 border-slate-200',
  C: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  PARTNER: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default function TierBadge({ tier, canOverride }: Props) {
  const t = tier || '—'
  const cls = TIER_CLASS[t] || 'bg-gray-100 text-gray-800 border-gray-200'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${cls}`}
      title={canOverride ? 'Click pencil (Lane C) to override' : 'Tier set by source'}
    >
      Tier-{t}
      {canOverride ? <span className="opacity-60">✎</span> : <span className="opacity-50">🔒</span>}
    </span>
  )
}
