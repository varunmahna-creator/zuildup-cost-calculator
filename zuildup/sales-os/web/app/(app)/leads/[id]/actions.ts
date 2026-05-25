'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { SignJWT } from 'jose'

// ============================================================================
// 2026-05-14 rewrite: all mutations now write to Cloud SQL via inbox-api.
// Supabase remains for auth/session only. Per Varun's decision today, the
// legacy 650 leads will be tackled via Google Sheets — Sales OS only needs
// to work flawlessly for NEW leads coming in.
// ============================================================================

const API_URL = process.env.NEXT_PUBLIC_INBOX_API_URL || 'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'

async function mintJwt(userId: string, email: string, role: string): Promise<string> {
  const secret = process.env.INBOX_JWT_SECRET
  if (!secret) throw new Error('INBOX_JWT_SECRET not configured')
  const key = new TextEncoder().encode(secret)
  const nowSec = Math.floor(Date.now() / 1000)
  return await new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600)
    .sign(key)
}

async function apiPost(path: string, body: any): Promise<{ ok: boolean; error?: string; status?: number }> {
  const user = await requireAuth()
  const token = await mintJwt(user.id, user.email, user.role)
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const status = res.status
  let json: any = {}
  try { json = await res.json() } catch {}
  if (!res.ok) return { ok: false, error: json.error || `HTTP ${status}`, status }
  return { ok: true, ...json }
}

// ============================================================================

export async function changeStatus(formData: FormData) {
  const leadId = formData.get('leadId') as string
  const newStatus = formData.get('status') as string
  const reason = (formData.get('reason') as string) || null

  if (!leadId || !newStatus) return { error: 'Missing fields' }
  if ((newStatus === 'Junk' || newStatus === 'Lost') && !reason) {
    return { error: 'Reason required for Junk/Lost' }
  }

  const result = await apiPost(`/leads/${leadId}/status`, { status: newStatus, reason })
  if (!result.ok) return { error: result.error || 'Failed' }

  // Item 11 (feedback 2026-05-25): trim revalidatePath fan-out. Only the
  // current lead detail page needs to refresh — /leads and /dashboard are
  // either polled by client or refreshed on their next visit. Previously
  // every disposition rebuilt 3 routes server-side, which is the dominant
  // contributor to the "sluggish" feel after a click.
  revalidatePath('/leads/' + leadId)
  return { ok: true }
}

// Form-action variant (returns void).
export async function reassignLead(formData: FormData): Promise<void> {
  const user = await requireAuth()
  if (user.role !== 'admin' && user.role !== 'director') return
  const leadId = formData.get('leadId') as string
  const assignTo = (formData.get('assigned_to') as string) || null
  if (!leadId) return

  await apiPost(`/leads/${leadId}/assign`, { assigned_to: assignTo })
  // Item 11: assignment changes do need /unassigned to refresh, but /leads
  // and /dashboard can wait until their next render.
  revalidatePath('/leads/' + leadId)
  revalidatePath('/unassigned')
}

// Client-callable variant (returns result object).
export async function reassignLeadAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    await reassignLead(formData)
    return { ok: true }
  } catch (e: any) {
    return { error: e.message || 'Failed' }
  }
}

export async function logActivity(formData: FormData) {
  const leadId = formData.get('leadId') as string
  const type = formData.get('type') as string
  const outcome = (formData.get('outcome') as string) || null
  const note = (formData.get('note') as string) || null
  const next_action = (formData.get('next_action') as string) || null
  const next_action_due_raw = formData.get('next_action_due') as string
  const next_action_due = next_action_due_raw ? new Date(next_action_due_raw).toISOString() : null

  if (!leadId || !type) return { error: 'Missing fields' }

  const result = await apiPost(`/leads/${leadId}/activity`, {
    type, outcome, note, next_action, next_action_due,
  })
  if (!result.ok) return { error: result.error || 'Failed' }

  // Item 11: just rebuild the lead detail; inbox + dashboard poll on their
  // own intervals.
  revalidatePath('/leads/' + leadId)
  return { ok: true }
}

// File upload still uses Supabase Storage for now — switching to GCS is a
// next-rollout item. The DB row goes to Supabase `attachments` table (legacy)
// because we have no Cloud SQL endpoint for it yet. Acceptable per Varun:
// new leads probably don't need file uploads in the first iteration.
export async function uploadAttachment(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()
  const leadId = formData.get('leadId') as string
  const kind = (formData.get('kind') as string) || 'other'
  const file = formData.get('file') as File

  if (!leadId || !file || file.size === 0) return { error: 'Missing file or leadId' }

  // Storage upload via service-role
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = 'leads/' + leadId + '/' + Date.now() + '-' + safeName
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage.from('attachments').upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upErr) return { error: 'Upload failed: ' + upErr.message }

  // Log activity to Cloud SQL
  await apiPost(`/leads/${leadId}/activity`, {
    type: kind === 'quote' ? 'quote_sent' : 'file_upload',
    note: 'Uploaded ' + kind + ': ' + file.name,
  })

  // Best-effort: also write to Supabase attachments table (legacy contract).
  // Skip-fail silently if the lead is Cloud-SQL-only (no Supabase shadow).
  try {
    await supabase.from('attachments').insert({
      lead_id: leadId,
      uploader_id: user.id,
      file_url: path,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      kind,
    })
  } catch {}

  revalidatePath('/leads/' + leadId)
  return { ok: true }
}

// ===== Action items (next_action_*) =====

export async function saveNextAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const leadId = formData.get('leadId') as string
  const action_type = formData.get('action_type') as string
  const dueRaw = formData.get('next_action_due') as string
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!leadId || !action_type || !dueRaw) return { error: 'Missing fields' }
  const due = new Date(dueRaw)
  if (isNaN(due.getTime())) return { error: 'Invalid due date' }

  const result = await apiPost(`/leads/${leadId}/next-action`, {
    action_type,
    next_action_due: due.toISOString(),
    notes,
  })
  if (!result.ok) return { error: result.error || 'Failed' }

  revalidatePath('/leads/' + leadId)
  return { ok: true }
}

export async function markActionDone(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const leadId = formData.get('leadId') as string
  if (!leadId) return { error: 'Missing leadId' }

  const result = await apiPost(`/leads/${leadId}/action-done`, {})
  if (!result.ok) return { error: result.error || 'Failed' }

  revalidatePath('/leads/' + leadId)
  return { ok: true }
}
