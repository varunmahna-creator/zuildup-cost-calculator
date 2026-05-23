import { NextResponse } from 'next/server'
import { API_URL, mintAdminJwt } from '../_jwt'

export const dynamic = 'force-dynamic'

export async function GET() {
  const minted = await mintAdminJwt()
  if (!minted) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }
  const r = await fetch(`${API_URL}/admin/wa-test/templates`, {
    headers: { Authorization: `Bearer ${minted.token}` },
    cache: 'no-store',
  })
  const text = await r.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return NextResponse.json(parsed ?? { ok: false, error: text }, { status: r.status })
}
