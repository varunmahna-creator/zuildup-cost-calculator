import { createClient } from './supabase/server'
import { redirect } from 'next/navigation'

export type Role = 'admin' | 'director' | 'spoc'
export type LeadScope = 'assigned_only' | 'all_leads' | 'team_leads'
export type Tab = 'dashboard' | 'inbox' | 'leads' | 'reports' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  // qol-sprint-2 2026-05-23 — RBAC fields. May be null on legacy rows; callers
  // should fall back to role defaults via roleDefaultScope() / roleDefaultTabs().
  lead_scope: LeadScope | null
  visible_tabs: Tab[] | null
}

export function roleDefaultScope(role: Role): LeadScope {
  if (role === 'admin' || role === 'director') return 'all_leads'
  return 'assigned_only'
}

export function roleDefaultTabs(role: Role): Tab[] {
  if (role === 'admin') return ['dashboard', 'inbox', 'leads', 'reports', 'admin']
  if (role === 'director') return ['dashboard', 'inbox', 'leads', 'reports']
  return ['dashboard', 'inbox', 'leads']
}

/** Returns the effective tab list (visible_tabs override OR role default). */
export function effectiveTabs(user: Pick<User, 'role' | 'visible_tabs'>): Tab[] {
  if (user.visible_tabs && user.visible_tabs.length > 0) return user.visible_tabs
  return roleDefaultTabs(user.role)
}

/** Returns the effective lead scope (lead_scope override OR role default). */
export function effectiveScope(user: Pick<User, 'role' | 'lead_scope'>): LeadScope {
  return user.lead_scope || roleDefaultScope(user.role)
}

export async function getUser(): Promise<User | null> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  // Supabase mirror table — has core fields (id/email/name/role/active) but
  // NOT the qol-sprint-2 RBAC columns (lead_scope, visible_tabs) which live
  // in Cloud SQL only. Pull RBAC fields lazily via the inbox-api below.
  const { data: userData } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', authUser.id)
    .single()

  if (!userData) return null

  // Try to enrich with RBAC fields from Cloud SQL via /me. If that call
  // fails (network, API down), fall back to role-derived defaults so the
  // UI keeps working with sensible permissions.
  let lead_scope: LeadScope | null = null
  let visible_tabs: Tab[] | null = null
  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_INBOX_API_URL ||
      'https://zuildup-inbox-api-oyrq7o3czq-el.a.run.app'
    const secret = process.env.INBOX_JWT_SECRET
    if (secret) {
      const { SignJWT } = await import('jose')
      const nowSec = Math.floor(Date.now() / 1000)
      const key = new TextEncoder().encode(secret)
      const token = await new SignJWT({ email: authUser.email ?? '', role: userData.role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(authUser.id)
        .setIssuedAt(nowSec)
        .setExpirationTime(nowSec + 60)
        .sign(key)
      const r = await fetch(`${apiUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (r.ok) {
        const body = await r.json()
        if (body?.user) {
          lead_scope = body.user.lead_scope || null
          visible_tabs = body.user.visible_tabs || null
        }
      }
    }
  } catch (e) {
    // Best-effort enrichment — leave nulls and fall back to role defaults.
  }

  return {
    ...(userData as { id: string; email: string; name: string; role: Role }),
    lead_scope,
    visible_tabs,
  }
}

export async function requireAuth(): Promise<User> {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export async function requireRole(allowedRoles: Role[]): Promise<User> {
  const user = await requireAuth()
  if (!allowedRoles.includes(user.role)) {
    redirect('/inbox')
  }
  return user
}

export async function getRole(): Promise<Role | null> {
  const user = await getUser()
  return user?.role || null
}
