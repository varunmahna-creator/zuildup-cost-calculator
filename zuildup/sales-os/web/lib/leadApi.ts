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
const USE_MOCK_LEAD_API = true

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
  nqr_reason?: NqrReason
  nqr_reason_text?: string
  restart_date?: string // YYYY-MM-DD
  attempt_reason?: 'Invalid No' | 'Did not pick' | 'Call back later'
  callback_at?: string // ISO timestamp
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
