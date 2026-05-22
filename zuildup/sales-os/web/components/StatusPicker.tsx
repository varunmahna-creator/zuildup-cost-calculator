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
  NQR_REASONS,
  type StatusTop,
  type LossReason,
  type JunkReason,
  type NqrReason,
} from '@/lib/format'
import type { ChangeStatusPayload } from '@/lib/leadApi'

interface Current {
  status_top?: string | null
  sub_status?: string | null
  loss_reason?: string | null
  loss_reason_text?: string | null
  junk_reason?: string | null
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
  const [nqrReason, setNqrReason] = useState<string>(current?.nqr_reason || '')
  const [nqrReasonText, setNqrReasonText] = useState<string>(current?.nqr_reason_text || '')
  const [restartDate, setRestartDate] = useState<string>(current?.restart_date || '')
  const [callbackAt, setCallbackAt] = useState<string>(toLocalInput(current?.callback_at))

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const subOptions = useMemo<readonly string[]>(() => (top ? SUB_STATUS_BY_TOP[top] : []), [top])

  // When top changes, reset sub and all reason fields.
  function chooseTop(t: StatusTop) {
    if (t === top) return
    setTop(t)
    setSub('')
    setLossReason('')
    setLossReasonText('')
    setJunkReason('')
    setNqrReason('')
    setNqrReasonText('')
    setRestartDate('')
    setCallbackAt('')
    setMsg(null)
  }

  function chooseSub(s: string) {
    setSub(s)
    setMsg(null)
  }

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
    }
    if (sub === 'No Immediate Req') {
      if (!restartDate) return 'Pick a restart date'
    }
    if (sub === 'Below Min Order' || sub === 'No Immediate Req') {
      if (nqrReason === 'Other' && !nqrReasonText.trim()) return 'Describe the "Other" reason'
    }
    if (sub === 'Call back later') {
      if (!callbackAt) return 'Pick a callback date & time'
    }
    return null
  }, [top, sub, lossReason, lossReasonText, junkReason, nqrReason, nqrReasonText, restartDate, callbackAt])

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
    }
    if (sub === 'Below Min Order' || sub === 'No Immediate Req') {
      if (nqrReason) p.nqr_reason = nqrReason as NqrReason
      if (nqrReasonText.trim()) p.nqr_reason_text = nqrReasonText.trim()
      if (sub === 'No Immediate Req' && restartDate) p.restart_date = restartDate
      else if (restartDate) p.restart_date = restartDate
    }
    if (top === 'Attempted') {
      // sub_status doubles as attempt_reason in the API contract.
      p.attempt_reason = sub as 'Invalid No' | 'Did not pick' | 'Call back later'
      if (sub === 'Call back later' && callbackAt) {
        // Convert the local datetime input → ISO (toISOString in UTC)
        p.callback_at = new Date(callbackAt).toISOString()
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
        </div>
      )}

      {(sub === 'Below Min Order' || sub === 'No Immediate Req') && (
        <div className="space-y-2 bg-rose-50 border border-rose-200 rounded p-3">
          <label className="block text-xs font-medium text-gray-700">Not-qualified reason (optional)</label>
          <select
            value={nqrReason}
            onChange={(e) => setNqrReason(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="">Pick one…</option>
            {NQR_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {nqrReason && (
            <textarea
              value={nqrReasonText}
              onChange={(e) => setNqrReasonText(e.target.value)}
              placeholder={nqrReason === 'Other' ? 'Describe (required) *' : 'Optional details'}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          )}
          <label className="block text-xs font-medium text-gray-700 pt-1">
            Restart date {sub === 'No Immediate Req' ? '*' : '(optional)'}
          </label>
          <input
            type="date"
            value={restartDate}
            onChange={(e) => setRestartDate(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {sub === 'Call back later' && (
        <div className="space-y-2 bg-amber-50 border border-amber-200 rounded p-3">
          <label className="block text-xs font-medium text-gray-700">Callback at *</label>
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <p className="text-[11px] text-gray-500">Required — sales will be reminded at this time.</p>
        </div>
      )}

      {/* Save row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className={`text-xs ${validationError ? 'text-gray-500' : msg?.startsWith('Error') ? 'text-rose-600' : 'text-emerald-600'}`}>
          {msg || validationError || 'Ready to save.'}
        </p>
        <button
          type="submit"
          disabled={!canSave}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save status'}
        </button>
      </div>
    </form>
  )
}
