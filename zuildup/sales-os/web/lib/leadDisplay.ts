// QoL Sprint 2 (2026-05-23) — Lead field pretty-print helpers.
//
// Why this file exists:
//   Lead `fields` JSON values come from raw form submissions (Y2G Meta forms,
//   ZuildUp C1 forms, manual entry). Field NAMES differ across sources
//   ("what_is_your_budget?" for Y2G vs "budget" for ZU) and VALUES are
//   slugified ("1_crore_-_2_crore"). Sales team needs human-readable display.
//
// Public API:
//   getPlotSize(lead)  -> 'string' | null   (e.g. "201-400 sqyd")
//   getBudget(lead)    -> 'string' | null   (e.g. "₹1–2 Cr")
//   getTimeline(lead)  -> 'string' | null   (e.g. "Within 3 months")

type FieldsBag = Record<string, any> | null | undefined

interface LeadLike {
  lead_source?: string | null
  fields?: FieldsBag
  plot_size?: string | null    // also stored as a top-level column on `leads`
  budget_band?: string | null  // also stored as a top-level column
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickField(fields: FieldsBag, keys: string[]): string | null {
  if (!fields || typeof fields !== 'object') return null
  for (const k of keys) {
    const v = fields[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim()
    }
  }
  return null
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s_-])(\w)/g, (_, sep, ch) => (sep === '_' ? ' ' : sep) + ch.toUpperCase())
}

// ---------------------------------------------------------------------------
// Plot Size
// ---------------------------------------------------------------------------

const PLOT_SIZE_MAP: Record<string, string> = {
  // Y2G slugs
  '900_sq.ft_/_100_gaj':       '900 sq.ft / 100 gaj',
  '1800_sq.ft_/_200_gaj':      '1800 sq.ft / 200 gaj',
  '2700_sq.ft_/_300_gaj':      '2700 sq.ft / 300 gaj',
  '3600_sq.ft_/_400_gaj':      '3600 sq.ft / 400 gaj',
  '5400_sq.ft_/_600_gaj':      '5400 sq.ft / 600 gaj',
  '5400_+_sq.ft_/_600+_gaj':   '5400+ sq.ft / 600+ gaj',
  // ZU C1 slugs
  '0-200':       '0–200 sqyd',
  '200-400':     '200–400 sqyd',
  '201-400':     '201–400 sqyd',
  '400-600':     '400–600 sqyd',
  '600plus':     '600+ sqyd',
  '600+':        '600+ sqyd',
  '201_400_sqyd': '201–400 sqyd',
  '400_600_sqyd': '400–600 sqyd',
  '600plus_sqyd': '600+ sqyd',
}

export function getPlotSize(lead: LeadLike): string | null {
  const raw =
    pickField(lead.fields, ['plot_size', 'plot_size_sqyd', 'plotsize']) ||
    lead.plot_size ||
    null
  if (!raw) return null
  const lower = String(raw).toLowerCase()
  if (PLOT_SIZE_MAP[lower]) return PLOT_SIZE_MAP[lower]
  // Fallback: if it already contains digits, return as-is with title case on words.
  if (/\d/.test(raw)) return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return titleCase(raw)
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const BUDGET_MAP: Record<string, string> = {
  // Y2G ("what_is_your_budget?")
  'below_1_crore':      'Below ₹1 Cr',
  'under_1_crore':      'Below ₹1 Cr',
  '1_crore_-_2_crore':  '₹1–2 Cr',
  '2_crore_-_3_crore':  '₹2–3 Cr',
  '3_crore_-_5_crore':  '₹3–5 Cr',
  '5_crore_+':          '₹5 Cr+',
  '5_crore_plus':       '₹5 Cr+',
  'above_5_crore':      '₹5 Cr+',
  // ZU C1 ("budget")
  '1_2_cr':             '₹1–2 Cr',
  '2_3_cr':             '₹2–3 Cr',
  '3_5_cr':             '₹3–5 Cr',
  '5_plus_cr':          '₹5 Cr+',
  'below_1_cr':         'Below ₹1 Cr',
}

export function getBudget(lead: LeadLike): string | null {
  const raw =
    pickField(lead.fields, [
      'what_is_your_budget?',
      'whats_your_budget?',
      'budget',
      'budget_band',
    ]) ||
    lead.budget_band ||
    null
  if (!raw) return null
  const key = String(raw).toLowerCase()
  if (BUDGET_MAP[key]) return BUDGET_MAP[key]
  // Generic fallback for unmapped slugs like "x_crore_-_y_crore" or "x_y_cr"
  if (/^(\d+)_crore?_-_(\d+)_crore?$/.test(key)) {
    const m = key.match(/^(\d+)_crore?_-_(\d+)_crore?$/)!
    return `₹${m[1]}–${m[2]} Cr`
  }
  if (/^(\d+)_(\d+)_cr$/.test(key)) {
    const m = key.match(/^(\d+)_(\d+)_cr$/)!
    return `₹${m[1]}–${m[2]} Cr`
  }
  return titleCase(raw)
}

// ---------------------------------------------------------------------------
// Timeline / "when are you planning to construct"
// ---------------------------------------------------------------------------

const TIMELINE_MAP: Record<string, string> = {
  // Y2G
  'immediately':         'Immediately',
  'within_3_months':     'Within 3 months',
  'within_6_months':     'Within 6 months',
  'within_a_year':       'Within a year',
  'after_1_year':        'After 1 year',
  // ZU C1 ("build_readiness")
  '0_3_months':          '0–3 months',
  '3_6_months':          '3–6 months',
  '6_12_months':         '6–12 months',
  '12_plus_months':      '12+ months',
  'just_exploring':      'Just exploring',
}

export function getTimeline(lead: LeadLike): string | null {
  const raw =
    pickField(lead.fields, [
      'when_are_you_planning_to_construct?',
      'when_planning_to_construct?',
      'timeline',
      'build_readiness',
      'construction_timeline',
    ]) || null
  if (!raw) return null
  const key = String(raw).toLowerCase()
  if (TIMELINE_MAP[key]) return TIMELINE_MAP[key]
  return titleCase(raw)
}
