'use client'

/**
 * InlineActivityLogger — Item 2 (feedback 2026-05-26).
 *
 * Lets SPOCs log calls / notes / next-actions directly from the inline
 * expanded row on /leads, so they don't have to navigate to /leads/[id]
 * just to record "no answer" or jot a quick note.
 *
 * Wraps the SAME server action (logActivity) the detail page uses, so
 * behaviour and validation are identical.
 */

import { useState, useTransition, useRef } from 'react'
import { logActivity } from '@/app/(app)/leads/[id]/actions'
import { ACTIVITY_TYPES } from '@/lib/format'

export default function InlineActivityLogger({
  leadId,
  onLogged,
}: {
  leadId: string
  onLogged?: () => void
}) {
  const [type, setType] = useState<string>('call')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMsg(null)
    setIsError(false)
    const fd = new FormData(e.currentTarget)
    fd.set('leadId', leadId)
    fd.set('type', type)
    startTransition(async () => {
      const res = await logActivity(fd)
      if (res?.error) {
        setMsg('Error: ' + res.error)
        setIsError(true)
      } else {
        setMsg('Activity logged ✓')
        setIsError(false)
        formRef.current?.reset()
        setType('call')
        onLogged?.()
        // Clear success msg after 2.5s
        setTimeout(() => setMsg(null), 2500)
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-2 bg-white border border-gray-200 rounded p-3"
    >
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Log activity
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            name="type"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Outcome</label>
          <input
            type="text"
            name="outcome"
            placeholder="answered / no answer"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Note</label>
        <textarea
          name="note"
          rows={2}
          placeholder="What happened?"
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Next action</label>
          <input
            type="text"
            name="next_action"
            placeholder="follow up / send quote"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Due</label>
          <input
            type="datetime-local"
            name="next_action_due"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Log'}
        </button>
        {msg && (
          <p className={`text-[11px] ${isError ? 'text-red-700' : 'text-emerald-700'}`}>
            {msg}
          </p>
        )}
      </div>
    </form>
  )
}
