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
import { useRouter } from 'next/navigation'
import { logActivity } from '@/app/(app)/leads/[id]/actions'
import { ACTIVITY_TYPES } from '@/lib/format'

export default function InlineActivityLogger({
  leadId,
  onLogged,
}: {
  leadId: string
  onLogged?: () => void
}) {
  const router = useRouter()
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
    // Sales feedback 2026-05-29 (round 3): the previous version scheduled
    // router.refresh() in a microtask via Promise.resolve().then(...) right
    // after calling startTransition. Microtasks run IMMEDIATELY after the
    // current synchronous frame — BEFORE the `await logActivity(fd)` inside
    // the transition completes. So router.refresh() was firing while the
    // POST was still in flight, fetching stale list data; once the POST
    // resolved, the list still showed the old next_action/notes. SPOCs
    // saw "Saved ✓" but no row change → hit F5.
    //
    // Fix: do the refresh INSIDE the success branch of startTransition,
    // AFTER `await logActivity(fd)` resolves. Refresh outside transition
    // (microtask) so React doesn't queue it as non-urgent.
    startTransition(async () => {
      const res = await logActivity(fd)
      if (res?.error) {
        setMsg('Error: ' + res.error)
        setIsError(true)
        return
      }
      setMsg('Saved ✓ Refreshing…')
      setIsError(false)
      formRef.current?.reset()
      setType('call')
      onLogged?.()
      // refresh AFTER the activity has been persisted server-side.
      // Schedule on a microtask so it lands outside React's transition
      // priority bucket — visible feedback latency stays low.
      queueMicrotask(() => {
        try {
          router.refresh()
        } catch {
          /* no-op — refresh is best-effort */
        }
      })
      // Replace "Refreshing…" with the final "Saved ✓" after a short delay
      window.setTimeout(() => {
        setMsg((prev) => (prev && prev.startsWith('Saved') ? 'Saved ✓' : prev))
      }, 600)
      // Clear success msg after 2.5s total
      window.setTimeout(() => {
        setMsg((prev) => (prev && prev.startsWith('Saved') ? null : prev))
      }, 2500)
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
            disabled={pending}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50"
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
            disabled={pending}
            placeholder="answered / no answer"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Note</label>
        <textarea
          name="note"
          rows={2}
          disabled={pending}
          placeholder="What happened?"
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Next action</label>
          <input
            type="text"
            name="next_action"
            disabled={pending}
            placeholder="follow up / send quote"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Due</label>
          <input
            type="datetime-local"
            name="next_action_due"
            disabled={pending}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50"
          />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending && (
            <span
              className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"
              aria-hidden="true"
            />
          )}
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
