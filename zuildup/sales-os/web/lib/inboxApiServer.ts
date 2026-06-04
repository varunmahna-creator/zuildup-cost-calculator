// Server-side helper to call the inbox-api Cloud Run service.
// Used by Server Components (e.g. /leads, /dashboard) to read from Cloud SQL.
//
// Mints a per-request HS256 JWT directly here (same secret as /api/inbox-jwt).
// Server-only — never bundle into client code.

import { SignJWT } from 'jose'
import { createClient } from './supabase/server'

const API_URL = process.env.NEXT_PUBLIC_INBOX_API_URL || 'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'
const JWT_SECRET = process.env.INBOX_JWT_SECRET

async function mintJwt(): Promise<{ token: string; user_id: string | null }> {
  if (!JWT_SECRET) throw new Error('INBOX_JWT_SECRET not configured')
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('unauthenticated')

  let role: string = 'spoc'
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()
  if (userRow?.role) role = userRow.role

  const nowSec = Math.floor(Date.now() / 1000)
  const key = new TextEncoder().encode(JWT_SECRET)
  const token = await new SignJWT({ email: authUser.email ?? '', role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(authUser.id)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600) // 10 min — server-side only, short-lived is fine
    .sign(key)
  return { token, user_id: authUser.id }
}

async function inboxApiGet<T = any>(path: string): Promise<T | null> {
  try {
    const { token } = await mintJwt()
    const r = await fetch(API_URL + path, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!r.ok) {
      console.error(`[inboxApiServer] ${path} -> HTTP ${r.status}`)
      return null
    }
    return (await r.json()) as T
  } catch (e: any) {
    console.error('[inboxApiServer] fetch error:', e.message)
    return null
  }
}

// ----- typed wrappers --------------------------------------------------

export type Lead = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  location: string | null
  project_details: string | null
  status: string
  substatus_reason: string | null
  lead_source: string | null
  source?: string | null
  partner?: string | null
  tier_hint: string | null
  assigned_to: string | null
  assigned_to_name?: string | null
  assigned_to_email?: string | null
  date_received: string | null
  last_activity_at: string | null
  created_at: string
  next_action_type: string | null
  next_action_due: string | null
  next_action_notes: string | null
  estimated_value: string | number | null
  plot_size: string | null
  floors: string | null
  budget_band: string | null
  leadgen_id: string | null
  form_id: string | null
  campaign_id: string | null
  ad_id: string | null
  platform: string | null
  fields?: Record<string, any> | null
  // --- QoL sprint 2026-05-22 new status model (Lane A schema, Lane B API) --
  // Optional because back-compat: existing rows may not yet have these set.
  status_top?: string | null
  sub_status?: string | null
  loss_reason?: string | null
  loss_reason_text?: string | null
  junk_reason?: string | null
  nqr_reason?: string | null
  nqr_reason_text?: string | null
  restart_date?: string | null
  attempt_reason?: string | null
  callback_at?: string | null
  // Bucket D (2026-06-04) - pipeline timeline
  estimated_closure_bucket?: string | null
  legacy_status?: string | null
  tier_override_by?: string | null
  tier_override_at?: string | null
  tier_override_from?: string | null
  related_count?: number | null
}

export type ListLeadsResponse = {
  ok: true
  rows: Lead[]
  total: number
  page: number
  limit: number
}

export async function getLeadsList(params: {
  q?: string
  status?: string
  status_top?: string
  sub_status?: string
  assigned_to?: string
  lead_source?: string
  partner?: string  // 2026-05-27: top-filter partner bucket (y2g | zu | organic)
  tier_hint?: string
  created_from?: string
  created_to?: string
  sort?: string
  page?: number | string
  limit?: number | string
}): Promise<ListLeadsResponse | null> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  return inboxApiGet<ListLeadsResponse>(`/leads?${qs.toString()}`)
}

export async function getLeadDetail(id: string) {
  return inboxApiGet<{ ok: true; lead: Lead; activities: any[]; comms: any[] }>(`/leads/${id}`)
}

export async function getLeadSources() {
  return inboxApiGet<{ ok: true; sources: { lead_source: string; n: number }[] }>('/leads/sources')
}

export async function getUsers() {
  return inboxApiGet<{ ok: true; users: { id: string; name: string; email: string; role: string; active: boolean }[] }>('/users')
}

export type DashboardBuckets = {
  ok: true
  overdue: Lead[]
  today: Lead[]
  upcoming: Lead[]
}

export async function getDashboardBuckets(user_id?: string) {
  const qs = user_id ? `?user_id=${encodeURIComponent(user_id)}` : ''
  return inboxApiGet<DashboardBuckets>(`/dashboard/buckets${qs}`)
}

export async function getDashboardAnalytics() {
  return inboxApiGet<{
    ok: true
    kpis: { total: number; new_7d: number; sql_plus: number; won: number; lost: number; junk: number }
    funnel: { name: string; count: number }[]
    sources: { lead_source: string; n: number }[]
    scorecards: any[]
  }>('/dashboard/analytics')
}

export async function getTeamOverdue() {
  return inboxApiGet<{ ok: true; rows: any[] }>('/admin/team-overdue')
}


// Bucket-D (2026-06-04) — Pipeline tab.
// Returns Qualified-not-closed leads grouped by closure bucket. SPOC scope
// enforced on the server (inbox-api reads users.lead_scope).
export type PipelineBucketKey = '<1m' | '1-3m' | '>3m' | 'uncategorized'

export type PipelineLeadCard = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  status_top: string | null
  sub_status: string | null
  estimated_closure_bucket: '<1m' | '1-3m' | '>3m' | null
  last_activity_at: string | null
  next_action_type: string | null
  next_action_text: string | null
  next_action_due: string | null
  created_at: string
}

export type PipelineResponse = {
  ok: true
  buckets: Record<PipelineBucketKey, PipelineLeadCard[]>
  counts: Record<PipelineBucketKey, number>
  total: number
}

export async function getPipeline() {
  return inboxApiGet<PipelineResponse>('/pipeline')
}
