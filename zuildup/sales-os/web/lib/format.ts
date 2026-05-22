export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.substring(0, n) + '…' : s
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export function formatDateRelative(d: string | Date | null | undefined): { text: string; className: string } {
  if (!d) return { text: '—', className: 'text-gray-400' }
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return { text: '—', className: 'text-gray-400' }
  const now = Date.now()
  const diffMs = date.getTime() - now
  const overdue = diffMs < 0
  const text = formatDateTime(date)
  if (overdue) return { text, className: 'text-red-600 font-semibold' }
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  if (date < tomorrowStart) return { text, className: 'text-amber-600 font-semibold' }
  return { text, className: 'text-gray-700' }
}

export function ageDays(d: string | Date | null | undefined): number {
  if (!d) return 0
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return 0
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export const LEAD_STATUSES = [
  'New', 'Assigned', 'Attempted', 'Contacted', 'SQL',
  'Quote Sent', 'Meeting Scheduled', 'Site Visit', 'Negotiation',
  'Won', 'Lost', 'Junk',
] as const

export const ACTIVITY_TYPES = [
  'call', 'whatsapp', 'email', 'meeting', 'note', 'quote_sent',
] as const

export const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞',
  whatsapp: '💬',
  email: '✉️',
  meeting: '👥',
  note: '📝',
  quote_sent: '💰',
  file_upload: '📎',
  status_change: '🔄',
  assignment: '👤',
}
