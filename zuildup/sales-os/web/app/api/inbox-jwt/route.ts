import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { createClient } from '@/lib/supabase/server'

// Mints a short-lived HS256 JWT for the Lane D inbox API + comms-send service.
// Claims: { sub, email, role, iat, exp(+24h) }
// Secret: INBOX_JWT_SECRET (server-only, same value as zuildup-sales-os-jwt-secret in GCP).

export const dynamic = 'force-dynamic'

export async function GET() {
  const secret = process.env.INBOX_JWT_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'INBOX_JWT_SECRET not configured' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return NextResponse.json({ ok: false, error: 'not authenticated' }, { status: 401 })
  }

  // Look up role from app users table (mirrors lib/auth.ts).
  let role: string = 'spoc'
  let name: string | null = null
  const { data: userRow } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', authUser.id)
    .single()
  if (userRow?.role) role = userRow.role
  if (userRow?.name) name = userRow.name

  const nowSec = Math.floor(Date.now() / 1000)
  const exp = nowSec + 60 * 60 * 24 // 24h

  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({
    email: authUser.email ?? '',
    role,
    name,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(authUser.id)
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(key)

  return NextResponse.json(
    {
      ok: true,
      token,
      exp,
      user: { id: authUser.id, email: authUser.email, role, name },
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
