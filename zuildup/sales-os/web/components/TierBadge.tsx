'use client'

/**
 * TierBadge — pill showing A / B / C with optional override button.
 *
 * Props:
 *   tier:     'A' | 'B' | 'C' | 'PARTNER' | null
 *   leadId:   string (used only for the override callback)
 *   userRole: 'admin' | 'director' | 'spoc' | string
 *   onOverride?: (leadId, newTier) => Promise<void>
 *   readOnly?: boolean — force-disable controls even for admin/director (e.g. list views)
 *
 * Behavior:
 *   - admin / director (and onOverride present): pencil icon → 3 tier buttons →
 *     confirm step → calls onOverride with the chosen tier.
 *   - spoc (or anyone else): lock icon + cursor-not-allowed + tooltip
 *     "Tier override restricted to managers".
 */

import { useState } from 'react'
import { TIER_COLOR } from '@/lib/format'

type Tier = 'A' | 'B' | 'C'

interface Props {
  tier?: string | null
  leadId: string
  userRole: string
  onOverride?: (leadId: string, newTier: Tier) => Promise<void> | void
  readOnly?: boolean
}

function tierClass(t: string | null | undefined): string {
  if (!t) return TIER_COLOR.unset
  return TIER_COLOR[t] || TIER_COLOR.unset
}

const TIER_OPTIONS: readonly Tier[] = ['A', 'B', 'C'] as const

export default function TierBadge({ tier, leadId, userRole, onOverride, readOnly }: Props) {
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<Tier | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const canOverride =
    !readOnly && (userRole === 'admin' || userRole === 'director') && typeof onOverride === 'function'

  const displayTier = tier || '—'
  const pillClass = `inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${tierClass(tier)}`

  async function commit() {
    if (!picked || !onOverride) return
    setSaving(true)
    setMsg(null)
    try {
      await onOverride(leadId, picked)
      setMsg('Saved')
      setEditing(false)
      setPicked(null)
    } catch (e) {
      setMsg('Error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  // SPOC / read-only view → locked badge with tooltip.
  if (!canOverride) {
    return (
      <span
        className={`${pillClass} ${tier ? '' : 'opacity-70'} ${
          !readOnly ? 'cursor-not-allowed' : ''
        }`}
        title={
          !readOnly && userRole === 'spoc'
            ? 'Tier override restricted to managers'
            : tier
              ? `Tier ${tier}`
              : 'No tier'
        }
      >
        Tier {displayTier}
        {!readOnly && userRole === 'spoc' && (
          <span aria-hidden="true" className="text-[10px] leading-none">🔒</span>
        )}
      </span>
    )
  }

  // Admin/director view.
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={pillClass}>Tier {displayTier}</span>
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setMsg(null)
            setPicked(null)
          }}
          className="text-gray-500 hover:text-gray-800 text-xs"
          aria-label="Override tier"
          title="Override tier"
        >
          ✎
        </button>
        {msg && <span className="text-[11px] text-emerald-600">{msg}</span>}
      </span>
    )
  }

  // Editing flow — pick + confirm.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500">Override → </span>
      {TIER_OPTIONS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setPicked(t)}
          className={`px-2 py-0.5 text-xs rounded border ${
            picked === t ? 'bg-indigo-600 text-white border-indigo-600' : tierClass(t)
          }`}
        >
          {t}
        </button>
      ))}
      <button
        type="button"
        onClick={commit}
        disabled={!picked || saving}
        className="px-2 py-0.5 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
      >
        {saving ? '…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setPicked(null)
          setMsg(null)
        }}
        className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
      >
        Cancel
      </button>
      {msg?.startsWith('Error') && <span className="text-[11px] text-rose-600">{msg}</span>}
    </span>
  )
}
