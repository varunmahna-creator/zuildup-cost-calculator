'use client'

import { useEffect, useRef, useState } from 'react'
import { inboxFetch } from '@/lib/inboxAuth'

export interface InboxMessage {
  id: string
  lead_id: string
  channel: string
  direction: 'inbound' | 'outbound'
  ext_id: string | null
  thread_key: string | null
  sender_handle: string | null
  body_text: string | null
  body_html: string | null
  attachments: unknown[]
  metadata: Record<string, unknown> | null
  received_at: string
}

const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

function ChannelTag({ channel }: { channel: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wide opacity-70 mr-2">{channel}</span>
  )
}

// Minimal HTML sanitizer: strip script/style/iframe/on* attributes.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

interface Props {
  leadId: string
}

export function Thread({ leadId }: Props) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)

  useEffect(() => {
    cancelledRef.current = false
    setLoading(true)
    setMessages([])
    lastCountRef.current = 0

    const load = async () => {
      try {
        if (!INBOX_API) {
          setErr('NEXT_PUBLIC_INBOX_API_URL not configured')
          setLoading(false)
          return
        }
        const r = await inboxFetch(`${INBOX_API}/inbox/lead/${leadId}/messages?limit=100`)
        if (!r.ok) {
          const t = await r.text()
          throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`)
        }
        const data = await r.json()
        if (cancelledRef.current) return
        // API returns newest first; we want oldest first (bottom = latest).
        const arr: InboxMessage[] = (data.messages || []).slice().reverse()
        setMessages(arr)
        setErr(null)
      } catch (e) {
        if (cancelledRef.current) return
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 15_000)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
    }
  }, [leadId])

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (messages.length > lastCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    lastCountRef.current = messages.length
  }, [messages])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
      {loading && messages.length === 0 && (
        <div className="text-sm text-gray-500">Loading messages…</div>
      )}
      {err && (
        <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
          {err}
        </div>
      )}
      {!loading && messages.length === 0 && !err && (
        <div className="text-sm text-gray-400">No messages yet for this lead.</div>
      )}
      {messages.map((m) => {
        const out = m.direction === 'outbound'
        return (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg p-3 text-sm shadow-sm ${
              out
                ? 'ml-auto bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-900'
            }`}
          >
            <div className={`flex items-center mb-1 ${out ? 'text-blue-100' : 'text-gray-500'}`}>
              <ChannelTag channel={m.channel} />
              {m.sender_handle && (
                <span className="text-[10px] opacity-80 truncate">{m.sender_handle}</span>
              )}
            </div>
            {m.body_text && (
              <p className="whitespace-pre-wrap break-words">{m.body_text}</p>
            )}
            {!m.body_text && m.body_html && (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.body_html) }}
              />
            )}
            <div className={`text-[10px] mt-1 ${out ? 'text-blue-100' : 'text-gray-400'}`}>
              {new Date(m.received_at).toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
