'use server'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SignJWT } from 'jose'

// Cloud SQL is source of truth as of 2026-05-14. We continue to also write
// to Supabase for backward compat with the existing user_allowlist trigger
// that auto-creates auth.users on login.

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

async function apiPost(meUserId: string, meEmail: string, meRole: string, path: string, body: any) {
  try {
    const token = await mintJwt(meUserId, meEmail, meRole)
    const res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) console.warn(`[admin-users] inbox-api ${path} -> ${res.status}`)
  } catch (e: any) {
    console.warn('[admin-users] inbox-api error:', e.message)
  }
}

export async function addUser(formData: FormData): Promise<void> {
  const me = await requireRole(['admin'])
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const name = (formData.get('name') as string)?.trim()
  const role = formData.get('role') as string

  if (!email || !name || !['admin', 'director', 'spoc'].includes(role)) return

  // Write to both Cloud SQL (source of truth) and Supabase (legacy)
  await apiPost(me.id, me.email, me.role, '/admin/users/add', { email, name, role })

  const supabase = await createClient()
  await supabase.from('user_allowlist').upsert({ email, name, role, active: true })

  revalidatePath('/admin/users')
}

export async function removeUser(formData: FormData): Promise<void> {
  const me = await requireRole(['admin'])
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email) return
  if (email === me.email.toLowerCase()) return

  await apiPost(me.id, me.email, me.role, '/admin/users/remove', { email })

  const supabase = await createClient()
  await supabase.from('user_allowlist').delete().eq('email', email)

  revalidatePath('/admin/users')
}

export async function toggleActive(formData: FormData): Promise<void> {
  const me = await requireRole(['admin'])
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const active = formData.get('active') === 'true'
  if (!email) return
  if (email === me.email.toLowerCase() && !active) return

  await apiPost(me.id, me.email, me.role, '/admin/users/active', { email, active })

  const supabase = await createClient()
  await supabase.from('user_allowlist').update({ active }).eq('email', email)

  revalidatePath('/admin/users')
}

export async function updateUserPhone(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireRole(['admin'])
  const userId = formData.get('userId') as string
  const phoneRaw = (formData.get('phone') as string)?.trim() || null

  if (!userId) return { error: 'Missing userId' }

  let phone: string | null = null
  if (phoneRaw) {
    if (!/^\+\d{8,16}$/.test(phoneRaw)) {
      return { error: 'Phone must start with + followed by 8-16 digits (E.164)' }
    }
    phone = phoneRaw
  }

  await apiPost(me.id, me.email, me.role, '/admin/users/phone', { userId, phone })

  // Best-effort Supabase mirror — non-blocking, skip-fail
  try {
    const supabase = await createClient()
    await supabase.from('users').update({ phone }).eq('id', userId)
  } catch {}

  revalidatePath('/admin/users')
  return { ok: true }
}
