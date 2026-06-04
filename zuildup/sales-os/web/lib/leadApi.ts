'use client'

/**
 * Lead API client — wraps Lane B's POST /leads/:id/status and POST /leads/:id/tier.
 *
 * Lane B's endpoints aren't deployed yet — this file ships with MOCK
 * implementations that console.log + fake success, so Lane C UI can be built
 * and merged independently. Flip USE_MOCK_LEAD_API to false (or remove it)
 * once Lane B reports green in the sprint state file.
 *
 * Contract (matches the brief exactly):
 *   POST /leads/:id/status body: ChangeStatusPayload
 *   POST /leads/:id/tier   body: { tier_hint: 'A'|'B'|'C' }
 *
 * Auth: uses inboxFetch (Bearer JWT from /api/inbox-jwt). Same pattern as
 * existing inbox client calls (LeadList / Thread / ReplyBox).
 */

import { inboxFetch } from './inboxAuth'
import type { StatusTop, LossReason, JunkReason, NqrReason } from './format'

// Flip to false (or delete the branch) once Lane B is deployed.
const USE_MOCK_LEAD_API = false

const INBOX_API_BASE =
  process.env.NEXT_PUBLIC_INBOX_API_BASE ||
  process.env.NEXT_PUBLIC_INBOX_API_URL ||
  '' // empty → relative path / same-origin proxy

export interface ChangeStatusPayload {
  status_top: StatusTop
  sub_status: string
  loss_reason?: LossReason
  loss_reason_text?: string
  junk_reason?: JunkReason
  junk_note?: string // item 5: free-text details per junk sub-option
  nqr_reason?: NqrReason
  nqr_reason_text?: string
  restart_date?: string // YYYY-MM-DD
  // Widened 2026-05-25 (item 3, 4): includes Phone Switched Off / Out of
  // Network Area. Backend allow-list needs the same widening for these to
  // round-trip — until then API returns 'invalid-sub_status'.
  attempt_reason?: string
  callback_at?: string // ISO timestamp
  callback_comment?: string // Bucket B (2026-06-04) — optional context shown in Recent Activity
}

export interface OverrideTierPayload {
  tier_hint: 'A' | 'B' | 'C'
}

export interface ApiOk {
  ok: true
  [k: string]: unknown
}

export interface ApiErr {
  ok: false
  error: string
  status?: number
}

export type ApiResult = ApiOk | ApiErr

function url(path: string): string {
  if (!INBOX_API_BASE) return path
  return INBOX_API_BASE.replace(/\/+$/, '') + path
}

async function postJSON(path: string, body: unknown): Promise<ApiResult> {
  try {
    const r = await inboxFetch(url(path), {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      let errText = `HTTP ${r.status}`
      try {
        const j = await r.json()
        if (j?.error) errText = j.error
      } catch {
        try {
          errText = await r.text()
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: errText, status: r.status }
    }
    const data = await r.json().catch(() => ({}))
    return { ok: true, ...data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function changeStatus(
  leadId: string,
  payload: ChangeStatusPayload
): Promise<ApiResult> {
  if (USE_MOCK_LEAD_API) {
    // eslint-disable-next-line no-console
    console.log('[MOCK changeStatus]', { leadId, payload })
    await new Promise((r) => setTimeout(r, 200))
    return { ok: true, mocked: true }
  }
  return postJSON(`/leads/${encodeURIComponent(leadId)}/status`, payload)
}

export async function overrideTier(
  leadId: string,
  tier: 'A' | 'B' | 'C'
): Promise<ApiResult> {
  if (USE_MOCK_LEAD_API) {
    // eslint-disable-next-line no-console
    console.log('[MOCK overrideTier]', { leadId, tier })
    await new Promise((r) => setTimeout(r, 200))
    return { ok: true, mocked: true }
  }
  return postJSON(`/leads/${encodeURIComponent(leadId)}/tier`, { tier_hint: tier })
}

// ─── Lane D additions (manual lead creation + activities/priors fetch) ────────────
// These were originally in a separate Lane D leadApi.ts; folded in here so the
// umbrella branch ships a single canonical client.

const INBOX_API = INBOX_API_BASE // alias for Lane D code below

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
  limit = 200
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
    // Bucket B (2026-06-04): the API returns prior_submissions at the TOP
    // LEVEL of the response, not on json.lead. Older code looked at
    // json.lead.prior_submissions and always got [] — so the panel never
    // populated. Keep both lookups so we round-trip whether the server
    // ever moves the field. (Matches inbox-api/index.js handleGetLead +
    // shared-db/index.js getLeadById return shape:
    //   { ok, lead, activities, comms, prior_submissions })
    const priors =
      (json?.prior_submissions as PriorSubmission[] | undefined) ||
      (json?.lead?.prior_submissions as PriorSubmission[] | undefined) ||
      []
    return priors
  } catch {
    return []
  }
}


// Item 8 (feedback 2026-05-26): look up existing leads by phone number to
// surface duplicate-submission details in the ManualLeadModal. Reuses the
// existing /leads?q= ILIKE search — no new backend endpoint needed.
export interface PriorMatch {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string | null
  status_top: string | null
  sub_status: string | null
  lead_source: string | null
  source: string | null
  partner: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  last_activity_at: string | null
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// Bucket-C 2026-06-04 — admin/director powers + Excel export.
// Items 7 / 8 / 9 / 14 from sales-team feedback.
// ────────────────────────────────────────────────────────────────────────────

/** Item 7. PATCH /leads/:id/name — admin/director only. */
export async function renameLead(
  leadId: string,
  newName: string,
): Promise<ApiResult> {
  if (!INBOX_API) return { ok: false, error: 'no inbox base configured' }
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/${encodeURIComponent(leadId)}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: json?.error || `HTTP ${r.status}`, status: r.status }
    return { ok: true, ...json }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Item 8. DELETE /leads/:id — soft-delete (admin/director only). */
export async function softDeleteLead(leadId: string): Promise<ApiResult> {
  if (!INBOX_API) return { ok: false, error: 'no inbox base configured' }
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/${encodeURIComponent(leadId)}`, {
      method: 'DELETE',
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: json?.error || `HTTP ${r.status}`, status: r.status }
    return { ok: true, ...json }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Item 9. POST /leads/bulk-assign — admin/director only. Cap 100 ids. */
export async function bulkAssignLeads(
  leadIds: string[],
  assignedTo: string,
): Promise<ApiResult & { assigned?: number; skipped?: number; assigneeName?: string }> {
  if (!INBOX_API) return { ok: false, error: 'no inbox base configured' }
  try {
    const r = await inboxFetch(`${INBOX_API}/leads/bulk-assign`, {
      method: 'POST',
      body: JSON.stringify({ lead_ids: leadIds, assigned_to: assignedTo }),
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: json?.error || `HTTP ${r.status}`, status: r.status }
    return { ok: true, ...json }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Item 14. GET /admin/leads/export.xlsx — admin only. Triggers download. */
export async function downloadLeadsXlsx(): Promise<{ ok: boolean; error?: string }> {
  if (!INBOX_API) return { ok: false, error: 'no inbox base configured' }
  try {
    const r = await inboxFetch(`${INBOX_API}/admin/leads/export.xlsx`)
    if (!r.ok) {
      let errText = `HTTP ${r.status}`
      try { const j = await r.json(); if (j?.error) errText = j.error } catch { /* not json */ }
      return { ok: false, error: errText }
    }
    const blob = await r.blob()
    // Best-effort filename from Content-Disposition; fallback to today's date.
    const cd = r.headers.get('Content-Disposition') || ''
    const m = /filename="([^"]+)"/.exec(cd)
    const filename = m?.[1] || `zuildup-leads-${new Date().toISOString().slice(0, 10)}.xlsx`
    const a = document.createElement('a')
    const objUrl = URL.createObjectURL(blob)
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}


export async function fetchLeadsByPhone(phone: string): Promise<PriorMatch[]> {
  if (!INBOX_API) return []
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.length < 6) return []
  const last10 = cleaned.replace(/^\+?91/, '').slice(-10)
  if (last10.length < 6) return []
  try {
    const r = await inboxFetch(`${INBOX_API}/leads?q=${encodeURIComponent(last10)}&limit=5`)
    if (!r.ok) return []
    const json = await r.json()
    return (json?.rows || []) as PriorMatch[]
  } catch (e) {
    console.warn('[leadApi] fetchLeadsByPhone error:', e)
    return []
  }
}
