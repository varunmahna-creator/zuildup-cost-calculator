'use client'

// STUB — Lane C owns the real StatusPicker (cascading dropdown with
// status_top → sub_status → reason fields). This file is shipped by Lane D as
// a placeholder so the build compiles before Lane C lands. When Lane C's PR
// merges, its StatusPicker.tsx overrides this file (umbrella PR will resolve).
//
// Until then, this stub falls back to the legacy StatusChanger contract:
// flat lead_status enum + free-text reason on Junk/Lost.

import { useState, useTransition } from 'react'
import { changeStatus } from '@/app/(app)/leads/[id]/actions'
import { LEAD_STATUSES } from '@/lib/format'

interface Props {
  leadId: string
  currentStatus: string
  onSaved?: () => void
}

export default function StatusPicker({ leadId, currentStatus, onSaved }: Props) {
  const [status, setStatus] = useState(currentStatus)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const needsReason = status === 'Junk' || status === 'Lost'
  const changed = status !== currentStatus

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (needsReason && !reason.trim()) {
      setMsg('Reason required for Junk/Lost')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('leadId', leadId)
      fd.set('status', status)
      if (needsReason) fd.set('reason', reason)
      const res = await changeStatus(fd)
      if (res?.error) {
        setMsg('Error: ' + res.error)
      } else {
        setMsg('Saved')
        setReason('')
        onSaved?.()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        Lane C placeholder — full cascading picker pending
      </div>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {needsReason && (
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required for Junk/Lost)"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
      )}
      {changed && (
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save status'}
        </button>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </form>
  )
}
