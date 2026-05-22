// Lane D + (shared with) Lane C client-side lead API helpers.
//
// 2026-05-22 — initial. Lane B's /leads/manual endpoint may not be deployed
// at the moment this file ships. createManualLead falls back to a mock if the
// server returns 404/501. Lane B will replace the mock branch with real wiring
// when its PR lands.

'use client'

import { inboxFetch } from './inboxAuth'

const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

export interface ManualLeadPayload {
  name: string
  phone: string
  email?: string
  lead_source: string
  notes?: string
}

export interface ManualLeadResponse {
  ok: true
  lead: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    lead_source: string | null
    tier_hint: string | null
    status: string
    created_at: string
  }
  mocked?: boolean
}

/**
 * Create a manual lead via Lane B's POST /leads/manual endpoint.
 * Falls back to a mocked response if the endpoint is missing.
 */
export async function createManualLead(payload: ManualLeadPayload): Promise<ManualLeadResponse> {
  if (!INBOX_API) {
    // Mock-only mode for local dev / preview without API
    return mockManualLeadResponse(payload)
  }
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/manual`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (r.status === 404 || r.status === 501) {
      // Lane B endpoint not yet deployed — graceful mock so UI is testable.
      console.warn('[leadApi] /leads/manual not deployed; using mock response')
      return mockManualLeadResponse(payload)
    }
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`)
    }
    const json = await r.json()
    return json as ManualLeadResponse
  } catch (e) {
    // Network / CORS / parse errors → mock so we don't block UX in preview.
    console.warn('[leadApi] createManualLead error, falling back to mock:', e)
    return mockManualLeadResponse(payload)
  }
}

function mockManualLeadResponse(payload: ManualLeadPayload): ManualLeadResponse {
  return {
    ok: true,
    mocked: true,
    lead: {
      id: 'mock-' + Math.random().toString(36).slice(2, 10),
      name: payload.name,
      phone: payload.phone,
      email: payload.email || null,
      lead_source: payload.lead_source,
      tier_hint: 'B',
      status: 'New',
      created_at: new Date().toISOString(),
    },
  }
}

/**
 * Fetch last-N activities for a lead. Used by the inline-expanded row.
 * Wraps the same endpoint that the detail page hits server-side
 * (GET /leads/:id → { activities[] }).
 */
export interface LeadActivity {
  id: string
  type: string
  outcome: string | null
  note: string | null
  next_action: string | null
  next_action_due: string | null
  created_at: string
  user_id: string | null
  user_name: string | null
}

export async function fetchLeadActivities(
  leadId: string,
  limit = 5
): Promise<LeadActivity[]> {
  if (!INBOX_API) return []
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/${leadId}`)
    if (!r.ok) return []
    const json = await r.json()
    const acts: LeadActivity[] = json?.activities || []
    return acts.slice(0, limit)
  } catch (e) {
    console.warn('[leadApi] fetchLeadActivities error:', e)
    return []
  }
}

export interface PriorSubmission {
  id: string
  lead_source: string | null
  created_at: string
  status_top?: string | null
  sub_status?: string | null
  status?: string | null
}

export async function fetchPriorSubmissions(
  leadId: string
): Promise<PriorSubmission[]> {
  if (!INBOX_API) return []
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/${leadId}`)
    if (!r.ok) return []
    const json = await r.json()
    return (json?.lead?.prior_submissions || []) as PriorSubmission[]
  } catch {
    return []
  }
}
