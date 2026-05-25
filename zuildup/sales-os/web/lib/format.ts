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

// ─── Status model (Lane A schema, Lane B API) ──────────────────────────────────
// Source of truth: chk_status_sub constraint on public.leads (Cloud SQL).
//
// Sprint 2026-05-25 feedback additions:
//   • Item 1: 'Call Done' is FIRST sub-option under Qualified (default selection).
//   • Item 3: Attempted adds 'Phone Switched Off' and 'Out of Network Area'.
//   • Item 7: Not Qualified adds 'No Plot' and 'Did Not Enquire'.
// NOTE: For these new sub-statuses to round-trip to the DB, the CHECK
// constraint on the leads table must be widened by the backend (Lane A).
// Until backend ships, picking these will currently 4xx — the UI surfaces
// the error message.
export const STATUS_TOP = ['Qualified', 'Not Qualified', 'Attempted'] as const
export type StatusTop = typeof STATUS_TOP[number]

export const SUB_STATUS_BY_TOP: Record<StatusTop, readonly string[]> = {
  // 'Call Done' goes FIRST (item 1, default for Qualified).
  Qualified: ['Call Done', 'Quote Shared', 'Meeting Scheduled', 'Meeting Completed', 'Won', 'Lost'],
  // Item 3 adds 'Phone Switched Off' and 'Out of Network Area'.
  Attempted: ['Did not pick', 'Phone Switched Off', 'Out of Network Area', 'Call back later', 'Invalid No'],
  // Item 7 adds 'No Plot' and 'Did Not Enquire'.
  'Not Qualified': ['Junk', 'Below Min Order', 'No Immediate Req', 'No Plot', 'Did Not Enquire', 'Other'],
}

export const LOSS_REASONS = [
  'Price too high',
  'Went with competitor',
  'Project delayed',
  'Lost interest',
  'Other',
] as const
export type LossReason = typeof LOSS_REASONS[number]

export const JUNK_REASONS = [
  'Channel Partner',
  'Invalid No',
  'Out of Zone',
  'Builder himself',
  'Other',
] as const
export type JunkReason = typeof JUNK_REASONS[number]

export const NQR_REASONS = [
  'Below Min Order',
  'No Immediate Req',
  'Other',
] as const
export type NqrReason = typeof NQR_REASONS[number]

// Tier values used by FilterBar.
export const TIER_VALUES = ['A', 'B', 'C', 'PARTNER'] as const

// Tailwind classes for tier pills.
export const TIER_COLOR: Record<string, string> = {
  A: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  B: 'bg-slate-100 text-slate-800 border-slate-200',
  C: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  PARTNER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  unset: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Tailwind class string for the top-status pill on the lead detail header.
export const STATUS_COLOR: Record<string, string> = {
  qualified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  attempted: 'bg-amber-100 text-amber-800 border-amber-200',
  not_qualified: 'bg-rose-100 text-rose-800 border-rose-200',
  unknown: 'bg-gray-100 text-gray-700 border-gray-200',
}

// Normalize a status_top string to a STATUS_COLOR key.
export function statusTopKey(s: string | null | undefined): string {
  if (!s) return 'unknown'
  const k = s.toLowerCase().replace(/\s+/g, '_')
  if (k in STATUS_COLOR) return k
  return 'unknown'
}
