'use client'

import { useState, useTransition, useRef } from 'react'
import { logActivity } from './actions'
import { ACTIVITY_TYPES } from '@/lib/format'

export default function ActivityLogger({ leadId }: { leadId: string }) {
  const [type, setType] = useState<string>('call')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    fd.set('leadId', leadId)
    fd.set('type', type)
    startTransition(async () => {
      const res = await logActivity(fd)
      if (res?.error) setMsg('Error: ' + res.error)
      else { setMsg('Activity logged'); formRef.current?.reset() }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 bg-gray-50 p-4 rounded">
      <h3 className="font-semibold text-gray-900">Log activity</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} name="type" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Outcome</label>
          <input type="text" name="outcome" placeholder="e.g. answered / no answer" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
        <textarea name="note" rows={2} placeholder="What happened?" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Next action</label>
          <input type="text" name="next_action" placeholder="e.g. send quote, follow up" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due</label>
          <input type="datetime-local" name="next_action_due" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button type="submit" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
          {pending ? 'Saving…' : 'Log activity'}
        </button>
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>
    </form>
  )
}
