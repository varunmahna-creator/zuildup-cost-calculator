'use client'

import { useState, useTransition } from 'react'
import { saveNextAction, markActionDone } from './actions'

export const ACTION_TYPES = [
  'Make Call',
  'Send Quote',
  'Schedule Meeting',
  'Send Follow-up',
  'Site Visit',
  'Negotiate',
  'Send Brochure',
  'Get Approval',
  'Coordinate with Architect',
  'Custom',
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

function humanizeRelative(due: Date): string {
  const now = Date.now()
  const diffMs = due.getTime() - now
  const overdue = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.floor(absMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  let phrase: string
  if (days >= 1) phrase = `${days} day${days === 1 ? '' : 's'}`
  else if (hours >= 1) phrase = `${hours} hour${hours === 1 ? '' : 's'}`
  else phrase = `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'}`
  return overdue ? `${phrase} overdue ⚠️` : `due in ${phrase}`
}

function badgeColor(due: Date): { bg: string; text: string; emoji: string } {
  const diffMs = due.getTime() - Date.now()
  if (diffMs < 0) return { bg: 'bg-red-50 border-red-300', text: 'text-red-800', emoji: '🔴' }
  if (diffMs < 24 * 3600 * 1000) return { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-800', emoji: '🟡' }
  return { bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-800', emoji: '🟢' }
}

// Convert ISO string → datetime-local input format ("YYYY-MM-DDTHH:mm")
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NextAction({
  leadId,
  current,
}: {
  leadId: string
  current: {
    next_action_type: string | null
    next_action_due: string | null
    next_action_notes: string | null
  }
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const [type, setType] = useState<string>(current.next_action_type || 'Make Call')
  const [due, setDue] = useState<string>(isoToLocalInput(current.next_action_due))
  const [notes, setNotes] = useState<string>(current.next_action_notes || '')

  const hasPending = !!current.next_action_type && !!current.next_action_due
  const dueDate = current.next_action_due ? new Date(current.next_action_due) : null

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    fd.set('leadId', leadId)
    fd.set('action_type', type)
    fd.set('next_action_due', due)
    fd.set('notes', notes)
    startTransition(async () => {
      const res = await saveNextAction(fd)
      if (res?.error) setMsg('Error: ' + res.error)
      else setMsg('Saved ✓')
    })
  }

  const handleDone = () => {
    setMsg(null)
    const fd = new FormData()
    fd.set('leadId', leadId)
    startTransition(async () => {
      const res = await markActionDone(fd)
      if (res?.error) setMsg('Error: ' + res.error)
      else {
        setMsg('Marked done ✓')
        setType('Make Call')
        setDue('')
        setNotes('')
      }
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-3">What&apos;s next?</h2>

      {hasPending && dueDate && (() => {
        const c = badgeColor(dueDate)
        return (
          <div className={`mb-4 px-3 py-2 rounded border ${c.bg}`}>
            <p className={`text-sm font-medium ${c.text}`}>
              {c.emoji} {current.next_action_type} — {humanizeRelative(dueDate)}
            </p>
            {current.next_action_notes && (
              <p className={`text-xs mt-1 ${c.text} opacity-80 whitespace-pre-wrap`}>
                {current.next_action_notes}
              </p>
            )}
          </div>
        )
      })()}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due</label>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="Any context for this action…"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !due}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save next action'}
            </button>
            {hasPending && (
              <button
                type="button"
                onClick={handleDone}
                disabled={pending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
              >
                Mark done
              </button>
            )}
          </div>
          {msg && <p className="text-xs text-gray-600">{msg}</p>}
        </div>
      </form>
    </div>
  )
}
