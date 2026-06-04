'use client'

/**
 * StatusPicker — cascading status dropdown (top → sub → reasons).
 *
 * UX:
 *   Step 1: 3 chips (Qualified / Not Qualified / Attempted) — radio behavior
 *   Step 2: sub-status buttons appear inline below the chosen top
 *   Step 3: conditional reason fields:
 *     - sub='Lost'           → loss_reason dropdown + loss_reason_text (required iff reason='Other')
 *     - sub='Junk'           → junk_reason dropdown (required)
 *     - sub='Below Min Order' / 'No Immediate Req' → optional nqr_reason + nqr_reason_text +
 *                              restart_date (required for 'No Immediate Req')
 *     - sub='Call back later' → datetime-local for callback_at (REQUIRED)
 *
 * Save button stays disabled until the payload is valid against the same
 * CHECK constraints the server enforces (Lane A's schema).
 *
 * Props:
 *   leadId, current (optional starting values), onSave(payload) → Promise<void>
 */

import { useMemo, useState } from 'react'
import {
  STATUS_TOP,
  SUB_STATUS_BY_TOP,
  LOSS_REASONS,
  JUNK_REASONS,
  type StatusTop,
  type LossReason,
  type JunkReason,
} from '@/lib/format'
import type { ChangeStatusPayload } from '@/lib/leadApi'

interface Current {
  status_top?: string | null
  sub_status?: string | null
  loss_reason?: string | null
  loss_reason_text?: string | null
  junk_reason?: string | null
  junk_note?: string | null
  nqr_reason?: string | null
  nqr_reason_text?: string | null
  restart_date?: string | null
  callback_at?: string | null
}

interface Props {
  leadId: string
  current?: Current
  onSave: (payload: ChangeStatusPayload) => Promise<void> | void
}

function asStatusTop(v: string | null | undefined): StatusTop | '' {
  if (v && (STATUS_TOP as readonly string[]).includes(v)) return v as StatusTop
  return ''
}

// Build a datetime-local-friendly string from an ISO timestamp.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function StatusPicker({ leadId, current, onSave }: Props) {
  const [top, setTop] = useState<StatusTop | ''>(asStatusTop(current?.status_top))
  const [sub, setSub] = useState<string>(current?.sub_status || '')

  const [lossReason, setLossReason] = useState<string>(current?.loss_reason || '')
  const [lossReasonText, setLossReasonText] = useState<string>(current?.loss_reason_text || '')
  const [junkReason, setJunkReason] = useState<string>(current?.junk_reason || '')
  const [junkNote, setJunkNote] = useState<string>(current?.junk_note || '') // item 5
  // nqr_reason dropdown is no longer rendered (items 6 + 7 → free-text only),
  // but keep the field on the payload type for backward-compat / legacy reads.
  const [nqrReasonText, setNqrReasonText] = useState<string>(current?.nqr_reason_text || '')
  const [restartDate, setRestartDate] = useState<string>(current?.restart_date || '')
  const [callbackAt, setCallbackAt] = useState<string>(toLocalInput(current?.callback_at))
  // Bucket B (2026-06-04) — optional context for 'Call back later'. Plumbed
  // through to the backend, which appends it to the callback_scheduled
  // activity note so it surfaces in Recent Activity.
  const [callbackComment, setCallbackComment] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const subOptions = useMemo<readonly string[]>(() => (top ? SUB_STATUS_BY_TOP[top] : []), [top])

  // When top changes, reset sub and all reason fields.
  // Item 1 (feedback sprint 2026-05-25): when user picks 'Qualified',
  // the sub-status defaults to 'Call Done' (first in the list).
  function chooseTop(t: StatusTop) {
    if (t === top) return
    setTop(t)
    const defaultSub = t === 'Qualified' ? 'Call Done' : ''
    setSub(defaultSub)
    setLossReason('')
    setLossReasonText('')
    setJunkReason('')
    setJunkNote('')
    setNqrReasonText('')
    setRestartDate('')
    setCallbackAt('')
    setCallbackComment('')
    setMsg(null)
  }

  function chooseSub(s: string) {
    setSub(s)
    setMsg(null)
  }

  // Sub-statuses (under Attempted) that surface the optional "Call Back At"
  // datetime input. Item 4 (feedback sprint 2026-05-25).
  // 'Call back later' (existing) keeps the REQUIRED behavior. The others
  // expose an OPTIONAL datetime so SPOC can schedule a callback if they want.
  const ATTEMPTED_CALLBACK_SUBS = new Set([
    'Did not pick',
    'Phone Switched Off',
    'Out of Network Area',
  ])

  // Sub-statuses (under Not Qualified) that show ONLY a free-text reason
  // (no further reason dropdown). Item 6 + item 7.
  const NQ_FREE_TEXT_ONLY = new Set([
    'Below Min Order',
    'No Immediate Req',
    'No Plot',
    'Did Not Enquire',
  ])

  // --- validation ---------------------------------------------------------
  const validationError = useMemo<string | null>(() => {
    if (!top) return 'Pick a top-level status'
    if (!sub) return 'Pick a sub-status'

    if (sub === 'Lost') {
      if (!lossReason) return 'Pick a loss reason'
      if (lossReason === 'Other' && !lossReasonText.trim()) return 'Describe the loss reason'
    }
    if (sub === 'Junk') {
      if (!junkReason) return 'Pick a junk reason'
      // junkNote is OPTIONAL — item 5 just exposes the textbox, server-side
      // junk_note column accepts NULL or any text.
    }
    if (sub === 'No Immediate Req') {
      if (!restartDate) return 'Pick a restart date'
    }
    // Item 6: Below Min Order / No Immediate Req use free-text-only flow now.
    // No nqr_reason dropdown to validate. (Backward-compat: if a legacy lead
    // has nqr_reason='Other' already, we still accept its nqr_reason_text.)
    if (sub === 'Call back later') {
      if (!callbackAt) return 'Pick a callback date & time'
    }
    return null
  }, [top, sub, lossReason, lossReasonText, junkReason, restartDate, callbackAt])

  const canSave = validationError === null && !saving

  // --- build payload ------------------------------------------------------
  function buildPayload(): ChangeStatusPayload | null {
    if (!top || !sub) return null
    const p: ChangeStatusPayload = { status_top: top, sub_status: sub }

    if (sub === 'Lost') {
      p.loss_reason = lossReason as LossReason
      if (lossReason === 'Other') p.loss_reason_text = lossReasonText.trim()
      else if (lossReasonText.trim()) p.loss_reason_text = lossReasonText.trim()
    }
    if (sub === 'Junk') {
      p.junk_reason = junkReason as JunkReason
      // Item 5: free-text note alongside the reason (e.g. for Out of Zone —
      // which state). Optional.
      if (junkNote.trim()) p.junk_note = junkNote.trim()
    }
    // Item 6 + item 7: NQ free-text-only flow. Send nqr_reason_text only.
    // nqr_reason is explicitly NOT sent for these — backend can treat absence
    // as "no preset; see the free-text field". For legacy callers that still
    // pass a preset (e.g. 'Other'), the field still round-trips below.
    if (NQ_FREE_TEXT_ONLY.has(sub)) {
      if (nqrReasonText.trim()) p.nqr_reason_text = nqrReasonText.trim()
      if (sub === 'No Immediate Req' && restartDate) p.restart_date = restartDate
    }
    if (top === 'Attempted') {
      // sub_status doubles as attempt_reason in the API contract.
      p.attempt_reason = sub
      // Item 4: schedule a callback datetime when SPOC picked a no-contact
      // sub-status (Did not pick / Phone Switched Off / Out of Network Area)
      // OR the explicit 'Call back later'. Datetime input is optional for
      // the new sub-statuses; required for 'Call back later'.
      if ((sub === 'Call back later' || ATTEMPTED_CALLBACK_SUBS.has(sub)) && callbackAt) {
        // Convert the local datetime input → ISO (toISOString in UTC)
        p.callback_at = new Date(callbackAt).toISOString()
        // Bucket B (2026-06-04) — only send comment for explicit 'Call back later'.
        if (sub === 'Call back later' && callbackComment.trim()) {
          p.callback_comment = callbackComment.trim()
        }
      }
    }
    return p
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    const payload = buildPayload()
    if (!payload) return
    setSaving(true)
    setMsg(null)
    try {
      await onSave(payload)
      setMsg('Saved')
    } catch (err) {
      setMsg('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  // --- render -------------------------------------------------------------
  const chipBase = 'px-3 py-1.5 text-sm rounded-full border transition-colors'
  const chipOn: Record<StatusTop, string> = {
    Qualified: 'bg-emerald-600 text-white border-emerald-600',
    'Not Qualified': 'bg-rose-600 text-white border-rose-600',
    Attempted: 'bg-amber-500 text-white border-amber-500',
  }
  const chipOff = 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
  const subBtnOn = 'bg-blue-600 text-white border-blue-600'
  const subBtnOff = 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-lead-id={leadId}>
      {/* Step 1: top chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TOP.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => chooseTop(t)}
            className={`${chipBase} ${top === t ? chipOn[t] : chipOff}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Step 2: sub-status row */}
      {top && (
        <div className="flex flex-wrap gap-2 pl-1 border-l-2 border-gray-200">
          {subOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => chooseSub(s)}
              className={`px-2.5 py-1 text-xs rounded border ${sub === s ? subBtnOn : subBtnOff}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Step 3: conditional reason fields */}
      {sub === 'Lost' && (
        <div className="space-y-2 bg-rose-50 border border-rose-200 rounded p-3">
          <label className="block text-xs font-medium text-gray-700">Loss reason *</label>
          <select
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Pick one…</option>
            {LOSS_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <textarea
            value={lossReasonText}
            onChange={(e) => setLossReasonText(e.target.value)}
            placeholder={lossReason === 'Other' ? 'Describe (required) *' : 'Optional details'}
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {sub === 'Junk' && (
        <div className="space-y-2 bg-rose-50 border border-rose-200 rounded p-3">
          <label className="block text-xs font-medium text-gray-700">Junk reason *</label>
          <select
            value={junkReason}
            onChange={(e) => setJunkReason(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Pick one…</option>
            {JUNK_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {/* Item 5: free-text note tied to junk_note column. */}
          {junkReason && (
            <>
              <label className="block text-xs font-medium text-gray-700 pt-1">Add details (optional)</label>
              <textarea
                value={junkNote}
                onChange={(e) => setJunkNote(e.target.value)}
                placeholder="e.g. for Out of Zone — which state / city"
                rows={2}
                name="junk_note"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </>
          )}
        </div>
      )}

      {NQ_FREE_TEXT_ONLY.has(sub) && (
        <div className="space-y-2 bg-rose-50 border border-rose-200 rounded p-3">
          {/* Item 6 + 7: free-text only — NO reason dropdown for these subs. */}
          <label className="block text-xs font-medium text-gray-700">Reason (details)</label>
          <textarea
            value={nqrReasonText}
            onChange={(e) => setNqrReasonText(e.target.value)}
            placeholder="Add context for this disposition"
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          {sub === 'No Immediate Req' && (
            <>
              <label className="block text-xs font-medium text-gray-700 pt-1">Restart date *</label>
              <input
                type="date"
                value={restartDate}
                onChange={(e) => setRestartDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </>
          )}
        </div>
      )}

      {/* Item 4: callback datetime — required for 'Call back later', optional
          for the new no-contact sub-statuses (Did not pick / Phone Switched
          Off / Out of Network Area). */}
      {(sub === 'Call back later' || ATTEMPTED_CALLBACK_SUBS.has(sub)) && (
        <div className="space-y-2 bg-amber-50 border border-amber-200 rounded p-3">
          <label className="block text-xs font-medium text-gray-700">
            Call back at {sub === 'Call back later' ? '*' : '(optional)'}
          </label>
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <p className="text-[11px] text-gray-500">
            {sub === 'Call back later'
              ? 'Required — sales will be reminded at this time.'
              : 'Set a follow-up time; we’ll surface it on the dashboard.'}
          </p>
          {/* Bucket B (2026-06-04) — optional comments for 'Call back later'.
              When saved, backend appends this to the auto-logged
              callback_scheduled activity so the next SPOC sees the context. */}
          {sub === 'Call back later' && (
            <>
              <label className="block text-xs font-medium text-gray-700 pt-2">
                Comments / Context (optional)
              </label>
              <textarea
                value={callbackComment}
                onChange={(e) => setCallbackComment(e.target.value)}
                placeholder="e.g. customer asked to call after 6pm, wants to discuss layout options"
                rows={2}
                name="callback_comment"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </>
          )}
        </div>
      )}

      {/* Save row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className={`text-xs ${validationError ? 'text-gray-500' : msg?.startsWith('Error') ? 'text-rose-600' : 'text-emerald-600'}`}>
          {msg || validationError || 'Ready to save.'}
        </p>
        <button
          type="submit"
          disabled={!canSave || saving}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving && (
            <span
              className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"
              aria-hidden="true"
            />
          )}
          {saving ? 'Saving…' : 'Save status'}
        </button>
      </div>
    </form>
  )
}
