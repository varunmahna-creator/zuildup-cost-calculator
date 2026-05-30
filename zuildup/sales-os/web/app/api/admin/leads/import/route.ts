import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow larger uploads (Vercel default body limit is 4 MB for serverless functions)
export const maxDuration = 60

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
    // Generic international number, keep with +
    return '+' + digits
  }
  return null
}

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

export async function POST(req: NextRequest) {
  // Auth gate
  try {
    await requireRole(['admin', 'director'])
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const user = (await requireRole(['admin', 'director']))
  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded (field name must be "file")' }, { status: 400 })
  }

  // Parse
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
  // Use raw rows with original header text so we can map aliases
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

  if (!rows.length) {
    return NextResponse.json({ error: 'No data rows found' }, { status: 400 })
  }

  // Detect headers (from first row keys)
  const rawHeaders = Object.keys(rows[0])
  const headerMap: Record<string, string> = {}
  for (const h of rawHeaders) {
    const norm = normalizeHeader(h)
    if (HEADER_ALIASES[norm]) {
      headerMap[h] = HEADER_ALIASES[norm]
    }
  }

  const supabase = createAdminClient()

  const created: CreatedRow[] = []
  const skipped: SkippedRow[] = []
  const errors: ErrorRow[] = []
  let assigneeWarning: string | null = null
  let noSpocCount = 0

  // Process rows
  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2 // Excel row 1 = headers, data starts at row 2
    const raw = rows[i]
    const mapped: Record<string, unknown> = {}
    for (const [rawKey, val] of Object.entries(raw)) {
      const std = headerMap[rawKey]
      if (std) mapped[std] = val
    }

    const name = cleanString(mapped.name)
    const phoneRaw = cleanString(mapped.phone) ?? (mapped.phone !== null && mapped.phone !== undefined ? String(mapped.phone) : null)
    const email = cleanString(mapped.email)
    const city = cleanString(mapped.city)

    if (!name) {
      errors.push({ row: sheetRow, raw, reason: 'Missing name' })
      continue
    }
    if (!phoneRaw) {
      errors.push({ row: sheetRow, raw, reason: 'Missing phone' })
      continue
    }
    const phone = cleanPhone(phoneRaw)
    if (!phone) {
      errors.push({ row: sheetRow, raw, reason: `Invalid phone: ${phoneRaw}` })
      continue
    }

    // Dedup
    const { data: existing, error: dedupErr } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle()

    if (dedupErr) {
      errors.push({ row: sheetRow, raw, reason: 'DB error (dedup): ' + dedupErr.message })
      continue
    }

    if (existing) {
      skipped.push({
        row: sheetRow,
        name,
        phone,
        reason: 'duplicate phone',
        existing_lead_id: existing.id,
      })
      continue
    }

    // Round-robin assignee
    let assignedTo: string | null = null
    const { data: pickData, error: pickErr } = await supabase.rpc('next_sales_assignee', {
      p_source: 'referral',
    })
    if (pickErr) {
      errors.push({ row: sheetRow, raw, reason: 'Assign RPC failed: ' + pickErr.message })
      continue
    }
    assignedTo = (pickData as string | null) ?? null
    if (!assignedTo) {
      noSpocCount++
    }

    // Build insert payload
    const payload: Record<string, unknown> = {
      source_row_id: 'referral_upload_' + crypto.randomUUID(),
      name,
      phone,
      email,
      location: city,
      lead_source: 'referral',
      tier: 'A',
      status: 'New',
      date_received: new Date().toISOString().slice(0, 10),
      assigned_to: assignedTo,
      assigned_by: assignedTo ? user.id : null,
      assigned_at: assignedTo ? new Date().toISOString() : null,
    }

    const { data: ins, error: insErr } = await supabase
      .from('leads')
      .insert(payload)
      .select('id')
      .single()

    if (insErr || !ins) {
      errors.push({
        row: sheetRow,
        raw,
        reason: 'Insert failed: ' + (insErr?.message ?? 'unknown'),
      })
      continue
    }

    created.push({
      row: sheetRow,
      lead_id: ins.id,
      name,
      phone,
      assigned_to: assignedTo,
    })
  }

  if (noSpocCount > 0) {
    assigneeWarning = `${noSpocCount} lead(s) were created UNASSIGNED because no sales/spoc users exist in the system.`
  }

  return NextResponse.json({
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    total_rows: rows.length,
    created,
    skipped_duplicates: skipped,
    errors,
    warning: assigneeWarning,
    detected_headers: rawHeaders,
    mapped_headers: headerMap,
  })
}
