import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { createClient } from '@/lib/supabase/server'

// QoL Sprint 2 (2026-05-23) — admin permissions proxy.
// Browser PATCHes here; we mint a JWT (admin role required server-side) and
// forward to the inbox-api which is the source of truth.

export const dynamic = 'force-dynamic'

const API_URL =
  process.env.NEXT_PUBLIC_INBOX_API_URL ||
  'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'

async function mintAdminJwt(): Promise<{ token: string; userId: string } | null> {
  const secret = process.env.INBOX_JWT_SECRET
  if (!secret) return null
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()
  if (userRow?.role !== 'admin') return null  // hard gate: only admins
  const nowSec = Math.floor(Date.now() / 1000)
  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({ email: authUser.email ?? '', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(authUser.id)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600)
    .sign(key)
  return { token, userId: authUser.id }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const minted = await mintAdminJwt()
  if (!minted) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const r = await fetch(`${API_URL}/admin/permissions/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${minted.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await r.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch { /* ignore */ }
  return NextResponse.json(parsed ?? { ok: false, error: text }, { status: r.status })
}
