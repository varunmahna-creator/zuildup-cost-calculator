'use client'

/**
 * LeadReplyBox — inline WhatsApp/Note compose on the lead detail page.
 *
 * Added 2026-05-19 (Varun: "we should be able to see the communication & do
 * the comm from the lead page itself"). Mirrors the inbox ReplyBox semantics:
 *   - channel select: whatsapp | note
 *   - Tier-A gate on whatsapp (only Tier-A leads can be messaged via WA)
 *   - POSTs to NEXT_PUBLIC_COMMS_SEND_URL/send/whatsapp or
 *     NEXT_PUBLIC_INBOX_API_URL/inbox/lead/:id/note
 *   - On success: router.refresh() so the server-rendered Communications
 *     section picks up the new row.
 *
 * Email channel intentionally excluded for v1 — keep the surface small. Email
 * sending still works from the inbox page; we can add here later.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inboxFetch } from '@/lib/inboxAuth'
import { Send, Lock, StickyNote } from 'lucide-react'

type Channel = 'whatsapp' | 'note'

interface Props {
  leadId: string
  tierHint?: string | null
  leadName?: string | null
}

const COMMS_SEND = process.env.NEXT_PUBLIC_COMMS_SEND_URL || ''
const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

export default function LeadReplyBox({ leadId, tierHint, leadName }: Props) {
  const router = useRouter()
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const isTierA = tierHint === 'A'
  // wa-outbound now governs Tier gating server-side (Task 1 of P0 hygiene sprint); client gate obsolete.
  void isTierA
  const channelGated = false
  const sendDisabled = sending || !body.trim() || channelGated

  async function send() {
    setSending(true)
    setErr(null)
    setOk(null)
    try {
      let url: string
      let payload: Record<string, unknown>
      if (channel === 'note') {
        if (!INBOX_API) throw new Error('NEXT_PUBLIC_INBOX_API_URL not configured')
        url = `${INBOX_API}/inbox/lead/${leadId}/note`
        payload = { body_text: body, kind: 'manual' }
      } else {
        if (!COMMS_SEND) throw new Error('NEXT_PUBLIC_COMMS_SEND_URL not configured')
        url = `${COMMS_SEND}/send/whatsapp`
        payload = { lead_id: leadId, body_text: body }
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
      setOk(channel === 'whatsapp' ? 'WhatsApp sent ✓' : 'Note saved ✓')
      // Refresh server component so the new row appears in Communications.
      router.refresh()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const placeholder =
    channel === 'note'
      ? `Internal note about ${leadName || 'this lead'} (not sent)...`
      : `Reply to ${leadName || 'lead'} on WhatsApp...`

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-gray-900 text-sm">Send a message</h2>
        {channelGated && (
          <span
            title="Tier-A gate: only Tier-A leads may be messaged via WhatsApp. Use Internal note instead, or upgrade the lead first."
            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded cursor-help"
          >
            <Lock className="w-3 h-3" />
            Tier-A only
          </span>
        )}
        {ok && <span className="text-xs text-green-700 font-medium">{ok}</span>}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel)}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="whatsapp">📱 WhatsApp</option>
          <option value="note">📝 Internal note</option>
        </select>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        disabled={channelGated}
      />

      {err && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
          {err}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          onClick={send}
          disabled={sendDisabled}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {channel === 'note' ? <StickyNote className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          {sending ? 'Sending...' : channel === 'note' ? 'Save note' : 'Send WhatsApp'}
        </button>
      </div>
    </div>
  )
}
