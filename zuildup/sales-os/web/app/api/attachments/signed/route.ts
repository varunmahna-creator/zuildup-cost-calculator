import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 })

  // Auth check via session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Verify user can access this attachment via RLS-respecting select
  const { data: att, error } = await supabase
    .from('attachments')
    .select('id, lead_id')
    .eq('file_url', path)
    .single()
  if (error || !att) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Sign via admin client
  const admin = createAdminClient()
  const { data: signed, error: signErr } = await admin.storage.from('attachments').createSignedUrl(path, 600)
  if (signErr || !signed) return NextResponse.json({ error: 'sign failed' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
