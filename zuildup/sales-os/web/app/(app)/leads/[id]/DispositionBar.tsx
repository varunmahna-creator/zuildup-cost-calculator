'use client'

/**
 * DispositionBar — 1-click lead disposition (ZU_C2 P0)
 *
 * Six big buttons map directly to the most common outcomes after a SPOC's
 * first contact. Designed to remove friction so SPOCs actually disposition
 * leads in the app (vs WhatsApp/notebook). Built 2026-05-18 by Iraaj per
 * Varun's ZU_C2 brief.
 *
 * Button → action mapping:
 *   Qualified      → status='SQL'         (no reason needed)
 *   Not Qualified  → status='Lost'        + lost_reason='Not qualified'
 *   Junk           → status='Junk'        + reason from modal (5 presets + custom)
 *   Out of Zone    → status='Junk'        + substatus_reason='Outside territory'
 *   Call Back      → status='Attempted'   + activity log {type:'call', outcome:'callback', note}
 *   Lost           → status='Lost'        + reason from modal
 *
 * Implementation notes:
 * - Lazy "tap-to-confirm" pattern: first click on a destructive action shows
 *   inline preset chips; second click commits. No full-page modal overlay
 *   — modals are friction.
 * - Optimistic UI: status pill in the page header doesn't update from here
 *   (parent server-action call triggers revalidatePath). We just show a
 *   green "Saved" toast for 1.5s after success.
 * - Disabled if user.role === 'spoc' AND assigned_to !== user.id. That's
 *   already enforced at the API layer, but we hide the controls to reduce
 *   confusion.
 */

import { useState, useTransition } from 'react'
import { changeStatus, logActivity } from './actions'

type ButtonKind = 'qualified' | 'not_qualified' | 'junk' | 'out_of_zone' | 'call_back' | 'lost'

interface DispositionBarProps {
  leadId: string
  currentStatus: string
  canEdit: boolean
}

const JUNK_PRESETS = ['Below min order', 'Builder himself', 'Not looking', 'Phone unreachable', 'Other']
const LOST_PRESETS = ['Price too high', 'Went with competitor', 'Project delayed', 'Lost interest', 'Other']

const BUTTONS: Array<{
  kind: ButtonKind
  label: string
  emoji: string
  classes: string
  hoverClasses: string
  needsReason?: 'junk' | 'lost' | 'call_back_note'
  immediate?: boolean
}> = [
  { kind: 'qualified',     label: 'Qualified',     emoji: '✅', classes: 'bg-emerald-600 hover:bg-emerald-700 text-white', hoverClasses: '', immediate: true },
  { kind: 'not_qualified', label: 'Not Qualified', emoji: '❌', classes: 'bg-orange-500 hover:bg-orange-600 text-white', hoverClasses: '', immediate: true },
  { kind: 'call_back',     label: 'Call Back',     emoji: '📞', classes: 'bg-blue-600 hover:bg-blue-700 text-white', hoverClasses: '', needsReason: 'call_back_note' },
  { kind: 'out_of_zone',   label: 'Out of Zone',   emoji: '📍', classes: 'bg-amber-500 hover:bg-amber-600 text-white', hoverClasses: '', immediate: true },
  { kind: 'junk',          label: 'Junk',          emoji: '🗑️', classes: 'bg-gray-600 hover:bg-gray-700 text-white', hoverClasses: '', needsReason: 'junk' },
  { kind: 'lost',          label: 'Lost',          emoji: '💔', classes: 'bg-red-600 hover:bg-red-700 text-white', hoverClasses: '', needsReason: 'lost' },
]

export default function DispositionBar({ leadId, currentStatus, canEdit }: DispositionBarProps) {
  const [pending, startTransition] = useTransition()
  const [activeKind, setActiveKind] = useState<ButtonKind | null>(null)
  const [reasonInput, setReasonInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [msgKind, setMsgKind] = useState<'success' | 'error'>('success')

  if (!canEdit) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500">
        Disposition disabled — you can only act on leads assigned to you.
      </div>
    )
  }

  function showToast(text: string, kind: 'success' | 'error' = 'success') {
    setMsg(text)
    setMsgKind(kind)
    setTimeout(() => setMsg(null), kind === 'success' ? 1800 : 4000)
  }

  function commit(kind: ButtonKind, reason?: string) {
    startTransition(async () => {
      let statusRes: any
      switch (kind) {
        case 'qualified':
          statusRes = await changeStatus(makeFD({ leadId, status: 'SQL' }))
          break
        case 'not_qualified':
          statusRes = await changeStatus(makeFD({ leadId, status: 'Lost', reason: 'Not qualified' }))
          break
        case 'out_of_zone':
          statusRes = await changeStatus(makeFD({ leadId, status: 'Junk', reason: 'Outside territory' }))
          break
        case 'junk':
          statusRes = await changeStatus(makeFD({ leadId, status: 'Junk', reason: reason || 'Other' }))
          break
        case 'lost':
          statusRes = await changeStatus(makeFD({ leadId, status: 'Lost', reason: reason || 'Other' }))
          break
        case 'call_back':
          statusRes = await changeStatus(makeFD({ leadId, status: 'Attempted' }))
          if (statusRes?.ok || !statusRes?.error) {
            await logActivity(makeFD({
              leadId,
              type: 'call',
              outcome: 'callback',
              note: reason || 'Will call back later',
            }))
          }
          break
      }

      if (statusRes?.error) {
        showToast('Error: ' + statusRes.error, 'error')
      } else {
        showToast(`Saved · ${kind.replace('_', ' ')}`, 'success')
        setActiveKind(null)
        setReasonInput('')
      }
    })
  }

  function handleClick(kind: ButtonKind, immediate?: boolean, needsReason?: string) {
    if (immediate) {
      commit(kind)
      return
    }
    if (activeKind === kind) {
      // second click on same button = commit with whatever reason is selected/typed
      commit(kind, reasonInput.trim() || (needsReason === 'call_back_note' ? '' : undefined))
    } else {
      setActiveKind(kind)
      setReasonInput('')
    }
  }

  const active = BUTTONS.find((b) => b.kind === activeKind)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Disposition <span className="text-xs font-normal text-gray-500">(current: <span className="font-medium">{currentStatus}</span>)</span></h2>
        {msg && (
          <span
            className={`text-xs font-medium px-2 py-1 rounded ${
              msgKind === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {msg}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={pending}
            onClick={() => handleClick(b.kind, b.immediate, b.needsReason)}
            className={`${b.classes} text-sm font-semibold rounded px-3 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-1 ${
              activeKind === b.kind ? 'ring-2 ring-offset-2 ring-blue-500' : ''
            }`}
          >
            <span className="text-lg">{b.emoji}</span>
            <span className="leading-tight">{b.label}</span>
          </button>
        ))}
      </div>

      {/* Inline reason picker — opens when a button needing a reason is selected */}
      {activeKind && active?.needsReason && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
          <p className="text-xs font-medium text-blue-900">
            {active.needsReason === 'junk' && 'Why is this junk? Tap a preset or type below:'}
            {active.needsReason === 'lost' && 'Why was it lost? Tap a preset or type below:'}
            {active.needsReason === 'call_back_note' && 'Add a note (optional) and click Call Back again:'}
          </p>
          {active.needsReason !== 'call_back_note' && (
            <div className="flex flex-wrap gap-1.5">
              {(active.needsReason === 'junk' ? JUNK_PRESETS : LOST_PRESETS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setReasonInput(p); commit(activeKind!, p) }}
                  className="text-xs bg-white border border-blue-300 hover:bg-blue-100 rounded px-2 py-1 transition"
                  disabled={pending}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            placeholder={
              active.needsReason === 'call_back_note'
                ? 'e.g. wants to discuss Sunday morning'
                : 'Or type a custom reason'
            }
            className="w-full text-sm border border-blue-300 rounded px-2 py-1.5"
            disabled={pending}
            onKeyDown={(e) => { if (e.key === 'Enter' && reasonInput.trim()) commit(activeKind!, reasonInput.trim()) }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setActiveKind(null); setReasonInput('') }}
              className="text-xs text-blue-700 hover:underline"
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => commit(activeKind!, reasonInput.trim() || undefined)}
              disabled={pending || (active.needsReason !== 'call_back_note' && !reasonInput.trim())}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function makeFD(obj: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(obj).forEach(([k, v]) => fd.set(k, v))
  return fd
}
