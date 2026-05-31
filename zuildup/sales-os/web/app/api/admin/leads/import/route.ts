/**
 * /api/admin/leads/import — bulk Excel upload for referral leads.
 *
 * 2026-05-31 rewrite (post-Supabase bug fix):
 *   - Previously wrote rows to Supabase `leads`, but production /leads reads
 *     from Cloud SQL via the inbox-api Cloud Run service. Result: every
 *     upload silently landed in the wrong DB and never surfaced in the UI.
 *   - This rewrite proxies the parsed rows to the inbox-api
 *     `/admin/leads/bulk-import` endpoint, which writes to Cloud SQL
 *     `zuildup_sales_os.leads` with the same defaults (tier_hint=A,
 *     lead_source=referral, status='New', round-robin assignment).
 *
 * Sales OS rule (permanent, per Varun 2026-05-31):
 *   - Cloud SQL `zuildup-sales-os-pg15` is the only DB for Sales OS lead
 *     data. No new Supabase writes for leads/activities/attachments.
 *   - Supabase Auth (user sessions) remains.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireRole } from '@/lib/auth'
import { SignJWT } from 'jose'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow larger uploads (Vercel default body limit is 4 MB for serverless functions)
export const maxDuration = 60

const API_URL = process.env.NEXT_PUBLIC_INBOX_API_URL || 'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'

const HEADER_ALIASES: Record<string, string> = {
  // name
  name: 'name',
  full_name: 'name',
  fullname: 'name',
  'full name': 'name',
  customer_name: 'name',
  'customer name': 'name',
  // phone
  phone: 'phone',
  mobile: 'phone',
  mobile_no: 'phone',
  'mobile no': 'phone',
  mobile_number: 'phone',
  'mobile number': 'phone',
  phone_number: 'phone',
  'phone number': 'phone',
  contact: 'phone',
  contact_number: 'phone',
  'contact number': 'phone',
  // email
  email: 'email',
  email_id: 'email',
  'email id': 'email',
  'e-mail': 'email',
  emailaddress: 'email',
  'email address': 'email',
  // city/location
  city: 'city',
  location: 'city',
  town: 'city',
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ')
}

function cleanPhone(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  // Strip all non-digits
  let digits = s.replace(/\D/g, '')
  if (!digits) return null
  // Strip leading zeros (e.g. 09876543210)
  digits = digits.replace(/^0+/, '')
  if (digits.length === 10) {
    return '+91' + digits
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return '+' + digits
  }
  if (digits.length === 11 && digits.startsWith('1') && s.startsWith('+1')) {
    return '+' + digits
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return '+' + digits
  }
  return null
}

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

interface SkippedRow {
  row: number
  name: string | null
  phone: string | null
  reason: string
  existing_lead_id?: string
}

interface ErrorRow {
  row: number
  raw: Record<string, unknown>
  reason: string
}

interface CreatedRow {
  row: number
  lead_id: string
  name: string
  phone: string
  assigned_to: string | null
}

async function mintJwt(userId: string, email: string, role: string): Promise<string> {
  const secret = process.env.INBOX_JWT_SECRET
  if (!secret) throw new Error('INBOX_JWT_SECRET not configured')
  const key = new TextEncoder().encode(secret)
  const nowSec = Math.floor(Date.now() / 1000)
  return await new SignJWT({ email, role, user_id: userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600)
    .sign(key)
}

export async function POST(req: NextRequest) {
  // Auth gate
  let user: { id: string; email: string; role: string }
  try {
    user = await requireRole(['admin', 'director'])
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded (field name must be "file")' }, { status: 400 })
  }

  // Parse XLSX
  let workbook: XLSX.WorkBook
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    workbook = XLSX.read(buf, { type: 'buffer' })
  } catch (e) {
    return NextResponse.json({ error: 'Could not parse file: ' + (e instanceof Error ? e.message : String(e)) }, { status: 400 })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: 'Workbook has no sheets' }, { status: 400 })
  }
  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

  if (!rows.length) {
    return NextResponse.json({ error: 'No data rows found' }, { status: 400 })
  }

  // Detect headers
  const rawHeaders = Object.keys(rows[0])
  const headerMap: Record<string, string> = {}
  for (const h of rawHeaders) {
    const norm = normalizeHeader(h)
    if (HEADER_ALIASES[norm]) {
      headerMap[h] = HEADER_ALIASES[norm]
    }
  }

  // Pre-process: validate + clean each row, build the payload for inbox-api
  // We keep ALL the original per-row error/skip handling here so the response
  // shape matches the existing AdminLeadsImportUI without changes.
  const validRows: Array<{
    row: number
    name: string
    phone: string
    email: string | null
    location: string | null
    raw: Record<string, unknown>
  }> = []
  const errors: ErrorRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2
    const raw = rows[i]
    const mapped: Record<string, unknown> = {}
    for (const [rawKey, val] of Object.entries(raw)) {
      const std = headerMap[rawKey]
      if (std) mapped[std] = val
    }

    const name = cleanString(mapped.name)
    const phoneRaw =
      cleanString(mapped.phone) ??
      (mapped.phone !== null && mapped.phone !== undefined ? String(mapped.phone) : null)
    const email = cleanString(mapped.email)
    const city = cleanString(mapped.city)

    if (!name) { errors.push({ row: sheetRow, raw, reason: 'Missing name' }); continue }
    if (!phoneRaw) { errors.push({ row: sheetRow, raw, reason: 'Missing phone' }); continue }
    const phone = cleanPhone(phoneRaw)
    if (!phone) { errors.push({ row: sheetRow, raw, reason: `Invalid phone: ${phoneRaw}` }); continue }

    validRows.push({ row: sheetRow, name, phone, email, location: city, raw })
  }

  if (validRows.length === 0) {
    return NextResponse.json({
      created_count: 0,
      skipped_count: 0,
      error_count: errors.length,
      total_rows: rows.length,
      created: [],
      skipped_duplicates: [],
      errors,
      warning: null,
      detected_headers: rawHeaders,
      mapped_headers: headerMap,
    })
  }

  // Call inbox-api bulk-import. inbox-api handles dedup, round-robin assignment,
  // activity logging, and phone-resubmit linking — same code path as the
  // Meta/Google lead webhooks. Cloud SQL is the source of truth.
  let token: string
  try {
    token = await mintJwt(user.id, user.email, user.role)
  } catch (e) {
    return NextResponse.json({ error: 'jwt mint failed: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }

  const apiResp = await fetch(API_URL + '/admin/leads/bulk-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      leads: validRows.map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email,
        location: r.location,
      })),
      lead_source: 'referral',
      tier_hint: 'A',
    }),
    cache: 'no-store',
  })

  if (!apiResp.ok) {
    let body: any = {}
    try { body = await apiResp.json() } catch {}
    return NextResponse.json({
      error: 'inbox-api bulk-import failed: HTTP ' + apiResp.status + (body.error ? ` — ${body.error}` : ''),
    }, { status: 502 })
  }

  const apiJson = await apiResp.json() as {
    ok: boolean
    created: { id: string; name: string; phone: string; assigned_to: string | null }[]
    skipped: { name: string; phone: string; reason: string; existing_lead_id?: string }[]
    errors:  { name: string; phone: string; reason: string }[]
  }

  // Map API response back to row-numbered output the UI expects.
  // We do this by walking the validRows in order; inbox-api processes them
  // in input order and returns matching arrays.
  const created: CreatedRow[] = []
  const skipped: SkippedRow[] = []
  const apiErrors: ErrorRow[] = []

  // Build phone -> row lookup
  const phoneToRow = new Map<string, { row: number; name: string; raw: Record<string, unknown> }>()
  for (const r of validRows) {
    phoneToRow.set(r.phone, { row: r.row, name: r.name, raw: r.raw })
  }
  for (const c of apiJson.created || []) {
    const meta = phoneToRow.get(c.phone)
    created.push({
      row: meta?.row ?? -1,
      lead_id: c.id,
      name: c.name,
      phone: c.phone,
      assigned_to: c.assigned_to,
    })
  }
  for (const s of apiJson.skipped || []) {
    const meta = phoneToRow.get(s.phone)
    skipped.push({
      row: meta?.row ?? -1,
      name: meta?.name ?? s.name,
      phone: s.phone,
      reason: s.reason,
      existing_lead_id: s.existing_lead_id,
    })
  }
  for (const e of apiJson.errors || []) {
    const meta = phoneToRow.get(e.phone)
    apiErrors.push({
      row: meta?.row ?? -1,
      raw: meta?.raw ?? {},
      reason: e.reason,
    })
  }

  // Combine our pre-validation errors with any errors returned by the API.
  const allErrors = [...errors, ...apiErrors]

  // Warn if any leads landed unassigned (pool empty).
  let assigneeWarning: string | null = null
  const unassignedCount = created.filter((c) => !c.assigned_to).length
  if (unassignedCount > 0) {
    assigneeWarning = `${unassignedCount} lead(s) were created UNASSIGNED — auto-assign pool may be empty.`
  }

  return NextResponse.json({
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: allErrors.length,
    total_rows: rows.length,
    created,
    skipped_duplicates: skipped,
    errors: allErrors,
    warning: assigneeWarning,
    detected_headers: rawHeaders,
    mapped_headers: headerMap,
    // Confirm DB target so manual testers can verify the fix landed.
    db_target: 'cloudsql:zuildup_sales_os',
  })
}
