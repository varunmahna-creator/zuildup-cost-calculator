import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect routes
  const path = request.nextUrl.pathname

  // Public routes
  if (path === '/login' || path === '/auth/callback') {
    return supabaseResponse
  }

  // Require auth for app routes
  if (path.startsWith('/inbox') || path.startsWith('/leads') || path.startsWith('/unassigned') || path.startsWith('/dashboard') || path.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Admin-only routes
  if (path.startsWith('/admin')) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user!.id)
      .single()

    if (userData?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Director/Admin-only routes
  // Note (2026-05-29): /dashboard used to be admin/director-only, which
  // bounced SPOCs (like Vaishali) to /inbox every time they clicked the
  // "Dashboard" nav link. /dashboard now renders a SPOC-scoped view with
  // KPI cards + personal buckets, so all roles can land on it.
  if (path.startsWith('/unassigned')) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user!.id)
      .single()

    if (userData?.role !== 'admin' && userData?.role !== 'director') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
