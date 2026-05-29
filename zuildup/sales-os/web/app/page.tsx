import { getUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  // Route based on role
  if (user.role === 'spoc') {
    redirect('/dashboard')
  } else {
    // admin and director go to leads
    redirect('/leads')
  }
}
