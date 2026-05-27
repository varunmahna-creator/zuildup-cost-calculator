'use client'

import { useEffect, useState } from 'react'
import { LeadList, type InboxLead } from './LeadList'
import { Thread } from './Thread'
import { ReplyBox } from './ReplyBox'
import { useInboxJwt, inboxFetch } from '@/lib/inboxAuth'
import { ArrowLeft } from 'lucide-react'

const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

/**
 * Lane D Inbox shell. 3-column on desktop, stacked on mobile.
 * Polling cadence handled inside LeadList (30s) and Thread (15s).
 */
export default function InboxClient() {
  const { token, loading, error } = useInboxJwt()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<InboxLead | null>(null)

  // Mobile: when a lead is selected on small screens, hide list and show thread.
  // We rely purely on CSS for this; the state is enough.

  useEffect(() => {
    if (!selectedId) {
      setSelectedLead(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        if (!INBOX_API) return
        const r = await inboxFetch(`${INBOX_API}/inbox/leads?limit=200`)
        if (!r.ok) return
        const data = await r.json()
        if (cancelled) return
        const found = (data.leads || []).find((l: InboxLead) => l.id === selectedId)
        if (found) setSelectedLead(found)
      } catch {
        /* ignore */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-sm text-gray-500">
        Authenticating with inbox service...
      </div>
    )
  }

  if (error || !token) {
    return (
      <div className="max-w-xl mx-auto mt-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
        <h2 className="font-semibold mb-1">Inbox unavailable</h2>
        <p className="text-sm">
          Could not obtain inbox credentials: {error || 'no token'}.
        </p>
        <p className="text-sm mt-2">
          Check that <code>INBOX_JWT_SECRET</code> is set in Vercel env vars and that
          you are signed in.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-8 bg-white">
      {/* Lead list pane */}
      <aside
        className={`${
          selectedId ? 'hidden md:flex' : 'flex'
        } md:w-[360px] md:flex-shrink-0 md:border-r border-gray-200 flex-col h-full`}
      >
        <LeadList onSelect={setSelectedId} selectedId={selectedId} />
      </aside>

      {/* Thread + reply pane */}
      <main
        className={`${
          selectedId ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col h-full min-w-0`}
      >
        {selectedId ? (
          <>
            <div className="md:hidden border-b border-gray-200 p-2 bg-gray-50">
              <button
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to inbox
              </button>
            </div>
            <div className="border-b border-gray-200 px-4 py-2 bg-white">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {selectedLead?.name ||
                  selectedLead?.phone ||
                  selectedLead?.email ||
                  'Conversation'}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {[selectedLead?.phone, selectedLead?.email]
                  .filter(Boolean)
                  .join(' \u00b7 ')}
                {selectedLead?.tier_hint === 'A' && (
                  <span className="ml-2 text-amber-700 font-medium">Tier-A</span>
                )}
              </div>
            </div>
            <Thread leadId={selectedId} />
            <ReplyBox lead={selectedLead} />
          </>
        ) : (
          <div className="m-auto text-sm text-gray-400 px-4 text-center">
            Select a conversation from the list to view messages.
          </div>
        )}
      </main>
    </div>
  )
}
