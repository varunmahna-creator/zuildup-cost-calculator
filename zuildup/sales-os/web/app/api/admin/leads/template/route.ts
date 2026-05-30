import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireRole(['admin', 'director'])
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'phone', 'email', 'city'],
    ['Rajesh Kumar', '+919876543210', 'rajesh@example.com', 'Gurugram'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Referrals')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  // Copy into a fresh ArrayBuffer so the type checker sees ArrayBuffer (not ArrayBufferLike/SharedArrayBuffer)
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="referral-leads-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
