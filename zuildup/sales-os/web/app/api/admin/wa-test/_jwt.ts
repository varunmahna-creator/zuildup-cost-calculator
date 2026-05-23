// Shared helper for /admin/wa-test/* proxy routes.
// Mints a short-lived HS256 JWT with role==='admin' and returns the JWT +
// the API base URL. Returns null if the caller is not an admin.
//
// IMPORTANT: server-only — must not be imported from client components.

import { SignJWT } from 'jose'
import { createClient } from '@/lib/supabase/server'

export const API_URL =
  process.env.NEXT_PUBLIC_INBOX_API_URL ||
  'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'

export async function mintAdminJwt(): Promise<{ token: string; userId: string; email: string } | null> {
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
  if (userRow?.role !== 'admin') return null // hard gate: only admins
  const nowSec = Math.floor(Date.now() / 1000)
  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({
    email: authUser.email ?? '',
    role: 'admin',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(authUser.id)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 600)
    .sign(key)
  return { token, userId: authUser.id, email: authUser.email ?? '' }
}
