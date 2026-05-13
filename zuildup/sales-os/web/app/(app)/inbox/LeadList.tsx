'use client'

import { useEffect, useRef, useState } from 'react'
import { inboxFetch } from '@/lib/inboxAuth'
import { MessageSquare, Mail, StickyNote, Phone } from 'lucide-react'

export interface InboxLead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string | null
  lead_source: string | null
  assigned_to: string | null
  last_channel: string | null
  last_direction: string | null
  last_body: string | null
  last_received_at: string | null
  tier_hint?: string | null
}

interface Props {
  onSelect: (id: string) => void
  selectedId: string | null
}

const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

function relTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

function ChannelBadge({ channel }: { channel: string | null }) {
  const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium'
  switch (channel) {
    case 'whatsapp':
      return (
        <span className={`${base} bg-green-100 text-green-800`}>
          <MessageSquare className="w-3 h-3" />
          WA
        </span>
      )
    case 'email':
      return (
        <span className={`${base} bg-blue-100 text-blue-800`}>
          <Mail className="w-3 h-3" />
          Email
        </span>
      )
    case 'phone_note':
    case 'note':
      return (
        <span className={`${base} bg-amber-100 text-amber-800`}>
          <StickyNote className="w-3 h-3" />
          Note
        </span>
      )
    case 'phone':
      return (
        <span className={`${base} bg-purple-100 text-purple-800`}>
          <Phone className="w-3 h-3" />
          Call
        </span>
      )
    default:
      return null
  }
}

export function LeadList({ onSelect, selectedId }: Props) {
  const [leads, setLeads] = useState<InboxLead[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    const load = async () => {
      try {
        if (!INBOX_API) {
          setErr('NEXT_PUBLIC_INBOX_API_URL not configured')
          setLoading(false)
          return
        }
        const r = await inboxFetch(`${INBOX_API}/inbox/leads?limit=50`)
        if (!r.ok) {
          const t = await r.text()
          throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`)
        }
        const data = await r.json()
        if (cancelledRef.current) return
        setLeads(data.leads || [])
        setErr(null)
      } catch (e) {
        if (cancelledRef.current) return
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
    }
  }, [])

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading leads…</div>
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 sticky top-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Inbox</h2>
          <span className="text-xs text-gray-500">{leads.length}</span>
        </div>
      </div>
      {err && (
        <div className="m-2 p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
          {err}
        </div>
      )}
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {leads.length === 0 && !err && (
          <li className="p-4 text-sm text-gray-400">No conversations yet.</li>
        )}
        {leads.map((l) => {
          const isSel = selectedId === l.id
          const label = l.name || l.phone || l.email || 'Unnamed'
          return (
            <li
              key={l.id}
              onClick={() => onSelect(l.id)}
              className={`p-3 cursor-pointer hover:bg-gray-50 ${
                isSel ? 'bg-blue-50 border-l-2 border-blue-500' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-gray-900 truncate">{label}</span>
                <ChannelBadge channel={l.last_channel} />
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {(l.last_body || '(no messages yet)').slice(0, 60)}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-400">{relTime(l.last_received_at)}</span>
                {l.tier_hint === 'A' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    Tier-A
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
