import { createClient } from './supabase/server'
import { redirect } from 'next/navigation'

export type Role = 'admin' | 'director' | 'spoc'

export interface User {
  id: string
  email: string
  name: string
  role: Role
}

export async function getUser(): Promise<User | null> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data: userData } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', authUser.id)
    .single()

  if (!userData) return null

  return userData as User
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
