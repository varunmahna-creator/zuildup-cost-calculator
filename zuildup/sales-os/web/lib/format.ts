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

// --- LEGACY status enum (kept for back-compat shadow column `leads.status`) -------
// New code should use the cascading STATUS_TOP / SUB_STATUS_BY_TOP model below.
export const LEAD_STATUSES = [
  'New', 'Assigned', 'Attempted', 'Contacted', 'SQL',
  'Quote Sent', 'Meeting Scheduled', 'Site Visit', 'Negotiation',
  'Won', 'Lost', 'Junk',
] as const
export type LegacyLeadStatus = typeof LEAD_STATUSES[number]

// --- NEW status model (QoL sprint 2026-05-22) -------------------------------------
// Top-level status (3 chips in the picker).
export const STATUS_TOP = ['Qualified', 'Not Qualified', 'Attempted'] as const
export type StatusTop = typeof STATUS_TOP[number]

// Sub-statuses gated by top-level choice.
export const SUB_STATUS_BY_TOP: Record<StatusTop, readonly string[]> = {
  Qualified: ['Quote Shared', 'Meeting Scheduled', 'Meeting Completed', 'Won', 'Lost'],
  'Not Qualified': ['Junk', 'Below Min Order', 'No Immediate Req', 'Other'],
  Attempted: ['Invalid No', 'Did not pick', 'Call back later'],
} as const

// Reason enums (server validates these too).
export const LOSS_REASONS = ['Price High', 'Low Confidence', 'Ghosted', 'Delayed', 'Other'] as const
export type LossReason = typeof LOSS_REASONS[number]

export const JUNK_REASONS = [
  'Out of Zone',
  'Contractor',
  'Channel Partner',
  'Project Already Started',
  'Invalid No',
  'Invalid Name',
] as const
export type JunkReason = typeof JUNK_REASONS[number]

export const NQR_REASONS = ['Below Min Order', 'No Immediate Req', 'Other'] as const
export type NqrReason = typeof NQR_REASONS[number]

// Tailwind class lookups for the status pill (Symptom #6 — visual cue).
// Keyed by status_top; null/unset falls back to the explicit 'unset' key.
export const STATUS_COLOR: Record<StatusTop | 'unset', string> = {
  Qualified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Not Qualified': 'bg-rose-100 text-rose-800 border-rose-200',
  Attempted: 'bg-amber-100 text-amber-800 border-amber-200',
  unset: 'bg-slate-100 text-slate-700 border-slate-200',
}

// 4px left border accent per row in /leads list, also keyed by status_top.
export const ROW_BORDER_COLOR: Record<StatusTop | 'unset', string> = {
  Qualified: 'border-l-4 border-l-emerald-500',
  'Not Qualified': 'border-l-4 border-l-rose-500',
  Attempted: 'border-l-4 border-l-amber-400',
  unset: 'border-l-4 border-l-slate-200',
}

// Tier badge color classes — admin/director can override.
// Tier values used by FilterBar / TierBadge dropdowns. PARTNER is admin-only.
export const TIER_VALUES = ['A', 'B', 'C', 'PARTNER'] as const
export type TierValue = typeof TIER_VALUES[number]

export const TIER_COLOR: Record<string, string> = {
  A: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  B: 'bg-slate-100 text-slate-800 border-slate-200',
  C: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  PARTNER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  unset: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Helper: pick the right STATUS_COLOR / ROW_BORDER_COLOR key.
export function statusTopKey(top: string | null | undefined): StatusTop | 'unset' {
  if (top && (STATUS_TOP as readonly string[]).includes(top)) return top as StatusTop
  return 'unset'
}

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
