'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

interface TemplateInfo {
  name: string
  language: string
  category: string | null
  status: string
  var_count: number
  body_text: string | null
  components: any[]
}

interface TimelineEvent {
  phase: string // api_accepted | sent | delivered | read | failed | ...
  at: string | null
  detail?: { errors?: any[]; error?: any; message_status?: string }
}

interface StatusResp {
  ok: boolean
  message_id?: string
  phone?: string
  body?: string | null
  message_status?: string | null
  is_test?: boolean
  current_state?: string
  terminal?: boolean
  events?: TimelineEvent[]
  raw?: any
  error?: string
}

interface HistoryRow {
  id: string
  message_id: string | null
  phone: string
  template_name: string | null
  template_lang: string | null
  admin_email: string | null
  admin_name: string | null
  message_status: string | null
  current_state: string
  terminal: boolean
  body: string | null
  accepted_at: string
  events: TimelineEvent[]
}

interface Props {
  currentUser: { id: string; name: string; email: string }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizePhone(input: string): string {
  // Strip everything non-digit. Caller passes e.g. "+91 99151 00649" → "919915100649".
  return (input || '').replace(/\D/g, '')
}

function isValidPhone(digits: string): boolean {
  // Accept 11–15 digits (E.164 max 15, India local 10 + 91 prefix = 12).
  return digits.length >= 11 && digits.length <= 15
}

function maskPhone(digits: string): string {
  // "919217263051" -> "+91 92XX XX 3051"
  if (!digits) return ''
  if (digits.length < 8) return digits
  const last4 = digits.slice(-4)
  const cc = digits.slice(0, 2) // first two = country code (works for India 91)
  const next2 = digits.slice(2, 4)
  return `+${cc} ${next2}XX XXX${last4.slice(-1)}` // legacy mask
}

function maskPhoneFriendly(digits: string): string {
  // Use the brief's format: +91 99XX XXX 649
  if (!digits) return ''
  if (digits.length < 8) return digits
  const cc = digits.slice(0, 2)
  const next2 = digits.slice(2, 4)
  const last3 = digits.slice(-3)
  return `+${cc} ${next2}XX XXX ${last3}`
}

function relativeOffset(t0: number, atStr: string | null | undefined): string {
  if (!atStr) return '—'
  const at = new Date(atStr).getTime()
  if (!Number.isFinite(at)) return '—'
  const diffSec = (at - t0) / 1000
  if (Math.abs(diffSec) < 1) return `${Math.round(diffSec * 1000)}ms`
  return `${diffSec >= 0 ? '+' : ''}${diffSec.toFixed(1)}s`
}

function formatLocalTime(atStr: string | null | undefined): string {
  if (!atStr) return ''
  try {
    return new Date(atStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return atStr
  }
}

function renderTemplateBody(tpl: TemplateInfo | null, vars: string[]): string {
  if (!tpl?.body_text) return ''
  let out = tpl.body_text
  vars.forEach((v, i) => {
    const re = new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, 'g')
    out = out.replace(re, v || '')
  })
  return out
}

function phaseColor(phase: string): string {
  if (phase === 'failed') return 'bg-red-100 text-red-800 border-red-300'
  if (phase === 'delivered' || phase === 'read') return 'bg-green-100 text-green-800 border-green-300'
  if (phase === 'sent') return 'bg-blue-100 text-blue-800 border-blue-300'
  if (phase === 'api_accepted' || phase === 'api_dispatched')
    return 'bg-gray-100 text-gray-800 border-gray-300'
  return 'bg-yellow-100 text-yellow-800 border-yellow-300'
}

function badgeForState(state: string, terminal: boolean): { label: string; color: string } {
  if (state === 'failed') return { label: 'FAILED', color: 'bg-red-600 text-white' }
  if (state === 'read') return { label: 'DELIVERED+READ', color: 'bg-green-600 text-white' }
  if (state === 'delivered') return { label: 'DELIVERED', color: 'bg-green-500 text-white' }
  if (state === 'sent') return terminal
    ? { label: 'STALLED', color: 'bg-yellow-500 text-white' }
    : { label: 'SENT', color: 'bg-blue-500 text-white' }
  if (state === 'blocked_no_template') return { label: 'TEMPLATE BLOCKED', color: 'bg-red-500 text-white' }
  return { label: state.toUpperCase(), color: 'bg-gray-500 text-white' }
}

function metaErrorLink(code: number | string | null): string {
  if (!code) return ''
  return `https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/`
}

function extractErrorCode(events: TimelineEvent[]): { code: number | null; message: string | null } {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    const errs = ev.detail?.errors
    if (Array.isArray(errs) && errs.length > 0) {
      const e = errs[0]
      return { code: e.code ?? null, message: e.message || e.title || null }
    }
    if (ev.detail?.error) {
      const e = ev.detail.error
      return { code: e.code ?? null, message: e.message || null }
    }
  }
  return { code: null, message: null }
}

// ---------------------------------------------------------------------------
// main component
// ---------------------------------------------------------------------------

export default function WaTestClient({ currentUser }: Props) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templatesError, setTemplatesError] = useState<string | null>(null)

  // form state
  const [phoneRaw, setPhoneRaw] = useState('')
  const [selectedTplName, setSelectedTplName] = useState('')
  const [vars, setVars] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // result panel state
  const [resultMessageId, setResultMessageId] = useState<string | null>(null)
  const [resultStatus, setResultStatus] = useState<StatusResp | null>(null)
  const [sendStartMs, setSendStartMs] = useState<number | null>(null)
  const [apiAcceptedMs, setApiAcceptedMs] = useState<number | null>(null)
  const [pollStopped, setPollStopped] = useState(false)
  const [stalled, setStalled] = useState(false)
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // history
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // ------------------------------------------------------------------------
  // initial loads: templates + history
  // ------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    setLoadingTemplates(true)
    fetch('/api/admin/wa-test/templates', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setTemplatesError(j?.error || `HTTP ${r.status}`)
        } else {
          setTemplates(j.templates || [])
        }
      })
      .catch((e) => {
        if (!cancelled) setTemplatesError(e?.message || 'fetch failed')
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshHistory = useCallback(() => {
    setLoadingHistory(true)
    fetch('/api/admin/wa-test/history?limit=20', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (r.ok) setHistory(j.rows || [])
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [])

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  // ------------------------------------------------------------------------
  // when template changes, reset vars sized appropriately
  // ------------------------------------------------------------------------

  const selectedTpl = useMemo(
    () => templates.find((t) => t.name === selectedTplName) || null,
    [templates, selectedTplName]
  )

  useEffect(() => {
    if (!selectedTpl) {
      setVars([])
      return
    }
    const n = selectedTpl.var_count
    setVars((cur) => {
      const next: string[] = []
      for (let i = 0; i < n; i++) {
        // matches the existing default in wa-outbound (resolveFirstName → "there").
        next.push(cur[i] ?? (i === 0 ? 'there' : ''))
      }
      return next
    })
  }, [selectedTpl])

  // ------------------------------------------------------------------------
  // phone validation + normalization (auto-prefix +91 if user types 10 digits)
  // ------------------------------------------------------------------------

  const phoneDigits = useMemo(() => {
    let d = normalizePhone(phoneRaw)
    if (d.length === 10) d = '91' + d // auto-prefix India
    return d
  }, [phoneRaw])

  const phoneValid = isValidPhone(phoneDigits)
  const formValid = phoneValid && !!selectedTplName && !sending

  // ------------------------------------------------------------------------
  // poller — every 2s, up to 60s, stop on terminal
  // ------------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollerRef.current) {
      clearInterval(pollerRef.current)
      pollerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const beginPolling = useCallback(
    (messageId: string, startMs: number) => {
      stopPolling()
      setPollStopped(false)
      setStalled(false)
      const poll = async () => {
        const elapsed = Date.now() - startMs
        if (elapsed > 60_000) {
          stopPolling()
          setPollStopped(true)
          setStalled(true)
          return
        }
        try {
          const r = await fetch(
            `/api/admin/wa-test/status/${encodeURIComponent(messageId)}`,
            { cache: 'no-store' }
          )
          if (r.ok) {
            const j: StatusResp = await r.json()
            setResultStatus(j)
            if (j.terminal) {
              stopPolling()
              setPollStopped(true)
              // refresh history when terminal so the new row appears with final state
              refreshHistory()
            }
          }
        } catch {
          /* network blip — keep polling */
        }
      }
      // first poll immediate, then every 2s
      poll()
      pollerRef.current = setInterval(poll, 2000)
    },
    [refreshHistory, stopPolling]
  )

  // ------------------------------------------------------------------------
  // send handler
  // ------------------------------------------------------------------------

  const onSend = async () => {
    if (!formValid || !selectedTpl) return
    setSending(true)
    setSendError(null)
    setResultMessageId(null)
    setResultStatus(null)
    setApiAcceptedMs(null)
    setPollStopped(false)
    setStalled(false)
    const t0 = Date.now()
    setSendStartMs(t0)
    try {
      const payload = {
        phone: '+' + phoneDigits,
        template_name: selectedTpl.name,
        lang: selectedTpl.language,
        vars: vars.slice(0, selectedTpl.var_count),
      }
      const r = await fetch('/api/admin/wa-test/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => ({}))
      setApiAcceptedMs(Date.now())
      if (!r.ok || !j?.message_id) {
        const detail = j?.upstream_body?.error || j?.error || `HTTP ${r.status}`
        setSendError(typeof detail === 'string' ? detail : JSON.stringify(detail))
        // Even on failure, set a synthetic status panel so the user sees Meta's reply
        setResultStatus({
          ok: false,
          message_id: undefined,
          current_state: j?.upstream_body?.error || 'send_failed',
          terminal: true,
          events: [
            {
              phase: 'api_accepted',
              at: new Date(t0).toISOString(),
              detail: { message_status: 'send_failed' },
            },
            {
              phase: 'failed',
              at: new Date().toISOString(),
              detail: { error: j?.upstream_body || j },
            },
          ],
        })
        setPollStopped(true)
        return
      }
      setResultMessageId(j.message_id)
      // Initial status synthesised from send response — poller will overwrite.
      setResultStatus({
        ok: true,
        message_id: j.message_id,
        current_state: 'sent',
        terminal: false,
        events: [
          {
            phase: 'api_accepted',
            at: new Date(t0).toISOString(),
            detail: { message_status: 'accepted' },
          },
        ],
      })
      beginPolling(j.message_id, t0)
    } catch (e: any) {
      setSendError(e?.message || 'send failed')
    } finally {
      setSending(false)
    }
  }

  // ------------------------------------------------------------------------
  // render
  // ------------------------------------------------------------------------

  const renderedBody = renderTemplateBody(selectedTpl, vars)

  return (
    <div className="space-y-8">
      {/* form */}
      <section className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Send test message</h2>
        {templatesError && (
          <div className="mb-4 text-sm rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-700">
            Failed to load templates: {templatesError}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(prefix +91 added automatically for 10 digits)</span>
            </label>
            <input
              type="tel"
              value={phoneRaw}
              onChange={(e) => setPhoneRaw(e.target.value)}
              placeholder="+91 92172 63051"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-1 text-xs text-gray-500">
              Normalized:{' '}
              {phoneDigits ? (
                <span className={phoneValid ? 'text-green-700 font-mono' : 'text-red-700 font-mono'}>
                  {phoneDigits} {phoneValid ? '✓' : '✗'}
                </span>
              ) : (
                <span className="font-mono">—</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
            <select
              value={selectedTplName}
              onChange={(e) => setSelectedTplName(e.target.value)}
              disabled={loadingTemplates || templates.length === 0}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{loadingTemplates ? 'Loading…' : 'Select template'}</option>
              {templates.map((t) => (
                <option key={`${t.name}__${t.language}`} value={t.name}>
                  {t.name} ({t.language}) — {t.category || 'UNCAT'}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-gray-500">
              {templates.length} approved template{templates.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {selectedTpl && selectedTpl.var_count > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Variables</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Array.from({ length: selectedTpl.var_count }).map((_, i) => (
                <div key={i}>
                  <label className="block text-xs text-gray-500 mb-1">Var {i + 1} ({`{{${i + 1}}}`})</label>
                  <input
                    type="text"
                    value={vars[i] ?? ''}
                    onChange={(e) => {
                      const next = [...vars]
                      next[i] = e.target.value
                      setVars(next)
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTpl && renderedBody && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3 text-sm whitespace-pre-wrap font-mono text-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Rendered body preview</div>
            {renderedBody}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onSend}
            disabled={!formValid}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send Test'}
          </button>
          <span className="text-xs text-gray-500">
            Logged in as <span className="font-medium text-gray-700">{currentUser.email}</span>
          </span>
        </div>
        {sendError && (
          <div className="mt-3 text-sm rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-700">
            {sendError}
          </div>
        )}
      </section>

      {/* result panel */}
      {resultStatus && sendStartMs !== null && (
        <ResultPanel
          status={resultStatus}
          sendStartMs={sendStartMs}
          apiAcceptedMs={apiAcceptedMs}
          messageId={resultMessageId}
          stalled={stalled}
          pollStopped={pollStopped}
        />
      )}

      {/* history */}
      <section className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent tests (last 20)</h2>
          <button
            type="button"
            onClick={refreshHistory}
            disabled={loadingHistory}
            className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
          >
            {loadingHistory ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">{loadingHistory ? 'Loading…' : 'No test sends yet.'}</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {history.map((row) => {
              const phoneDigits = normalizePhone(row.phone)
              const masked = maskPhoneFriendly(phoneDigits)
              const badge = badgeForState(row.current_state, row.terminal)
              const err = extractErrorCode(row.events || [])
              return (
                <li key={row.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
                  <div className="text-xs text-gray-500 w-36">
                    {formatLocalTime(row.accepted_at)}{' '}
                    <span className="text-gray-400">
                      ({new Date(row.accepted_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})
                    </span>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-gray-700">{row.admin_name || row.admin_email || '—'}</div>
                  </div>
                  <div className="font-mono text-xs text-gray-600 w-44">{masked}</div>
                  <div className="text-xs text-gray-700 flex-1 min-w-[180px]">
                    {row.template_name || '—'}
                    {row.template_lang && <span className="text-gray-400"> ({row.template_lang})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.color}`}>
                      {badge.label}
                    </span>
                    {err.code && (
                      <a
                        href={metaErrorLink(err.code)}
                        target="_blank"
                        rel="noreferrer"
                        title={err.message || ''}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        err {err.code}
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// result panel sub-component
// ---------------------------------------------------------------------// ---------------------------------------------------------------------------

interface ResultPanelProps {
  status: StatusResp
  sendStartMs: number
  apiAcceptedMs: number | null
  messageId: string | null
  stalled: boolean
  pollStopped: boolean
}

function ResultPanel({ status, sendStartMs, apiAcceptedMs, messageId, stalled, pollStopped }: ResultPanelProps) {
  const events = status.events || []
  const state = status.current_state || status.message_status || 'unknown'
  const terminalForBadge = !!status.terminal || stalled
  const badge = badgeForState(state, terminalForBadge)
  const err = extractErrorCode(events)

  // synthetic dispatch event (the first instant the user clicked Send, before
  // the API call returns). Always present.
  const dispatchEv: TimelineEvent = {
    phase: 'api_dispatched',
    at: new Date(sendStartMs).toISOString(),
    detail: undefined,
  }
  // Merge: dispatch + (status.events with api_accepted possibly overridden by
  // apiAcceptedMs from the send response).
  const merged: TimelineEvent[] = [dispatchEv, ...events.map((ev) => {
    if (ev.phase === 'api_accepted' && apiAcceptedMs) {
      return { ...ev, at: new Date(apiAcceptedMs).toISOString() }
    }
    return ev
  })]

  return (
    <section className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Delivery timeline</h2>
        <span className={`text-xs px-3 py-1 rounded font-semibold ${badge.color}`}>{badge.label}</span>
      </div>

      {messageId && (
        <div className="text-xs text-gray-500 mb-3 font-mono break-all">
          message_id: {messageId}
        </div>
      )}

      <ol className="space-y-2 mb-4">
        {merged.map((ev, i) => {
          const isErr = ev.phase === 'failed'
          return (
            <li key={`${ev.phase}-${i}-${ev.at}`} className="flex items-start gap-3">
              <div className={`text-xs px-2 py-0.5 rounded font-medium border ${phaseColor(ev.phase)} w-32 text-center`}>
                {ev.phase}
              </div>
              <div className="text-xs text-gray-500 font-mono w-24">{formatLocalTime(ev.at)}</div>
              <div className="text-xs text-gray-500 font-mono w-16">{relativeOffset(sendStartMs, ev.at)}</div>
              {isErr && err.code && (
                <div className="text-xs text-red-700">
                  error {err.code}{err.message ? `: ${err.message}` : ''}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {status.body && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm whitespace-pre-wrap font-mono text-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Sent body (as Meta saw it)</div>
          {status.body}
        </div>
      )}

      {stalled && (
        <div className="mt-3 text-sm rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-yellow-800">
          No terminal callback received within 60s. Polling stopped. Click Send Test again to retry.
        </div>
      )}
      {pollStopped && !stalled && status.terminal && (
        <div className="mt-3 text-sm rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-gray-600">
          Terminal state reached — polling stopped.
        </div>
      )}
    </section>
  )
}
