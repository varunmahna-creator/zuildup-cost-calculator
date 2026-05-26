'use client'

import { useEffect, useRef, useState } from 'react'
import { createManualLead, fetchLeadsByPhone, type ManualLeadResponse, type PriorMatch } from '@/lib/leadApi'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (lead: ManualLeadResponse['lead'], mocked?: boolean) => void
}

const SOURCE_OPTIONS = [
  'manual_whatsapp',
  'manual_call',
  'manual_referral',
  'manual_walkin',
  'manual_other',
]

const PHONE_REGEX = /^[+]?[\d][\d\s\-()]{7,18}\d$/

export default function ManualLeadModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [leadSource, setLeadSource] = useState(SOURCE_OPTIONS[0])
  const [customSource, setCustomSource] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // Item 8 (feedback 2026-05-26): show details of any existing lead with
  // the same phone number so the operator knows the prior context.
  const [priors, setPriors] = useState<PriorMatch[]>([])
  const [priorLoading, setPriorLoading] = useState(false)

  useEffect(() => {
    if (open) {
      // reset + focus
      setErr(null)
      setOkMsg(null)
      setTimeout(() => nameRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  // Debounced lookup: 400ms after user stops typing, hit the search API.
  useEffect(() => {
    if (!open) return
    const trimmed = phone.trim()
    if (!trimmed || trimmed.replace(/[^\d]/g, '').length < 6) {
      setPriors([])
      return
    }
    setPriorLoading(true)
    const t = setTimeout(async () => {
      const matches = await fetchLeadsByPhone(trimmed)
      setPriors(matches)
      setPriorLoading(false)
    }, 400)
    return () => clearTimeout(t)
  }, [phone, open])

  if (!open) return null

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required'
    if (!phone.trim()) return 'Phone is required'
    if (!PHONE_REGEX.test(phone.trim())) return 'Phone number looks invalid'
    if (email && !/^\S+@\S+\.\S+$/.test(email.trim())) return 'Email looks invalid'
    const src = useCustom ? customSource.trim() : leadSource
    if (!src) return 'Lead source is required'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setOkMsg(null)
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        lead_source: useCustom ? customSource.trim() : leadSource,
        notes: notes.trim() || undefined,
      }
      const res = await createManualLead(payload)
      setOkMsg(res.mocked ? 'Lead created (mocked — Lane B endpoint pending)' : 'Lead created')
      onCreated?.(res.lead, res.mocked)
      // Reset and close after short delay so user sees feedback
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
      setCustomSource('')
      setUseCustom(false)
      setLeadSource(SOURCE_OPTIONS[0])
      setTimeout(() => {
        onClose()
      }, 400)
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">+ New Lead</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-30"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-600">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Customer name"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Phone <span className="text-red-600">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="+91 9XXXXXXXXX"
              autoComplete="off"
            />
          </div>
          {priorLoading && (
            <p className="text-xs text-gray-500 italic">Checking for prior submissions…</p>
          )}
          {!priorLoading && priors.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                ⚠ Prior submission{priors.length > 1 ? 's' : ''} found for this phone
              </p>
              {priors.map((pr) => (
                <div key={pr.id} className="text-xs bg-white rounded border border-amber-200 p-2 space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {pr.name || '(no name)'}
                    </span>
                    <span className="text-gray-500 shrink-0">
                      {new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="text-gray-700">{pr.phone}{pr.email ? ' · ' + pr.email : ''}</div>
                  <div className="text-gray-600">
                    <span className="font-medium">Status:</span>{' '}
                    {pr.status_top
                      ? pr.status_top + (pr.sub_status ? ' / ' + pr.sub_status : '')
                      : (pr.status || '—')}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Source:</span>{' '}
                    {pr.source || pr.lead_source || '—'}
                    {pr.partner ? ' (' + pr.partner + ')' : ''}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Assignee:</span>{' '}
                    {pr.assigned_to_name || (pr.assigned_to ? pr.assigned_to.slice(0,8) : 'unassigned')}
                  </div>
                  {pr.last_activity_at && (
                    <div className="text-gray-500">
                      Last activity: {new Date(pr.last_activity_at).toLocaleString('en-IN')}
                    </div>
                  )}
                  <a
                    href={`/leads/${pr.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-blue-700 hover:underline mt-1"
                  >
                    Open this lead →
                  </a>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="optional"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Lead source <span className="text-red-600">*</span>
            </label>
            {!useCustom ? (
              <div className="flex gap-2">
                <select
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className="text-xs text-blue-600 hover:underline px-2"
                >
                  Custom…
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="custom source"
                />
                <button
                  type="button"
                  onClick={() => {
                    setUseCustom(false)
                    setCustomSource('')
                  }}
                  className="text-xs text-gray-500 hover:underline px-2"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Optional context — e.g. how they reached us"
            />
          </div>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {err}
            </div>
          )}
          {okMsg && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              {okMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
