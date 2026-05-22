'use client'

import { useState, useTransition } from 'react'
import { reassignLeadAction } from './actions'

export default function Assignment({ leadId, currentAssigneeId, users }: {
  leadId: string
  currentAssigneeId: string | null
  users: { id: string; name: string; role: string }[]
}) {
  const [assignee, setAssignee] = useState(currentAssigneeId || '')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const changed = (assignee || null) !== currentAssigneeId

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('leadId', leadId)
      if (assignee) fd.set('assigned_to', assignee)
      const res = await reassignLeadAction(fd)
      if (res?.error) setMsg('Error: ' + res.error)
      else setMsg('Saved')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        <option value="">— Unassigned —</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
      </select>
      {changed && (
        <button type="submit" disabled={pending} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded disabled:opacity-50">
          {pending ? 'Saving…' : 'Reassign'}
        </button>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </form>
  )
}
