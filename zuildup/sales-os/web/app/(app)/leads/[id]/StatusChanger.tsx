'use client'

import { useState, useTransition } from 'react'
import { changeStatus } from './actions'
import { LEAD_STATUSES } from '@/lib/format'

export default function StatusChanger({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
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
      if (res?.error) setMsg('Error: ' + res.error)
      else { setMsg('Saved'); setReason('') }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {needsReason && (
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
      )}
      {changed && (
        <button type="submit" disabled={pending} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded disabled:opacity-50">
          {pending ? 'Saving…' : 'Save status'}
        </button>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </form>
  )
}
