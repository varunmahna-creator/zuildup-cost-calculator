'use client'

import { useState } from 'react'
import { inboxFetch } from '@/lib/inboxAuth'
import { Send, Lock } from 'lucide-react'
import type { InboxLead } from './LeadList'

type Channel = 'whatsapp' | 'email' | 'note'

interface Props {
  lead: InboxLead | null
  onSent?: () => void
}

const COMMS_SEND = process.env.NEXT_PUBLIC_COMMS_SEND_URL || ''
const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

export function ReplyBox({ lead, onSent }: Props) {
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  if (!lead) return null

  const isTierA = lead.tier_hint === 'A'
  // Tier-A gate: only Tier-A leads may send WA/Email via this box. Notes always allowed.
  const channelGated = (channel === 'whatsapp' || channel === 'email') && !isTierA
  const sendDisabled = sending || !body.trim() || channelGated || (channel === 'email' && !subject.trim())

  async function send() {
    if (!lead) return
    setSending(true)
    setErr(null)
    setOk(null)
    try {
      let url: string
      let payload: Record<string, unknown>
      if (channel === 'note') {
        if (!INBOX_API) throw new Error('NEXT_PUBLIC_INBOX_API_URL not configured')
        url = `${INBOX_API}/inbox/lead/${lead.id}/note`
        payload = { body_text: body, kind: 'manual' }
      } else {
        if (!COMMS_SEND) throw new Error('NEXT_PUBLIC_COMMS_SEND_URL not configured')
        url = `${COMMS_SEND}/send/${channel}`
        if (channel === 'email') {
          payload = {
            lead_id: lead.id,
            subject,
            body_html: body,
            body_text: body,
          }
        } else {
          payload = { lead_id: lead.id, body_text: body }
        }
      }
      const r = await inboxFetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        let msg = `HTTP ${r.status}`
        try {
          const j = await r.json()
          msg = j.error || msg
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      setBody('')
      setSubject('')
      setOk('Sent')
      onSent?.()
      setTimeout(() => setOk(null), 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const placeholder =
    channel === 'note'
      ? 'Internal note (not sent to lead)...'
      : `Reply via ${channel}...`

  return (
    <div className="border-t border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="note">Internal note</option>
        </select>
        {channelGated && (
          <span
            title="Tier-A gate: this lead is not classified as Tier-A. Use Internal note instead, or upgrade the lead first."
            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded cursor-help"
          >
            <Lock className="w-3 h-3" />
            Tier-A only
          </span>
        )}
        {ok && <span className="text-xs text-green-700">{ok}</span>}
      </div>
      {channel === 'email' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          disabled={channelGated}
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-2 py-2 text-sm h-20 resize-none"
        disabled={channelGated}
      />
      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
          {err}
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={send}
          disabled={sendDisabled}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
