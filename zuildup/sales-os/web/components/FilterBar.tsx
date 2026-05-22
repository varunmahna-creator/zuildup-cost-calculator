'use client'

/**
 * FilterBar — Lane E (QoL sprint 2026-05-22).
 *
 * Chip-style multi-select filter bar used on /leads and /inbox.
 * Filters: status_top, sub_status, tier_hint, lead_source, assigned_to + date range.
 * State is synced to the URL query string so filter views are shareable + reload-stable.
 *
 * Wired against Lane B's listLeadsPaginated extensions:
 *   status_top, sub_status, tier_hint, lead_source, assigned_to,
 *   created_from, created_to (ISO date)
 *
 * Sort dropdown is a sibling component (SortDropdown.tsx).
 */

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown, X } from 'lucide-react'
import {
  STATUS_TOP,
  SUB_STATUS_BY_TOP,
  TIER_VALUES,
} from '@/lib/format'

export interface FilterBarProps {
  // Optional dynamic lists supplied by parent (sources, assignees come from the API).
  leadSources?: string[]
  assignees?: { id: string; name: string }[]
  /**
   * If true, the bar exposes the date range picker for created_at.
   * Inbox doesn't need it (always "active conversations"); leads page does.
   */
  showDateRange?: boolean
  className?: string
}

const QS_KEYS = {
  statusTop: 'status_top',
  subStatus: 'sub_status',
  tier: 'tier',
  source: 'source',
  assignee: 'assignee',
  from: 'from',
  to: 'to',
} as const

interface ReadableParams {
  getAll(name: string): string[]
}

function readMulti(params: ReadableParams, key: string): string[] {
  const v = params.getAll(key)
  if (v.length > 1) return v
  if (v.length === 1 && v[0].includes(',')) return v[0].split(',').filter(Boolean)
  return v
}

export function FilterBar({
  leadSources = [],
  assignees = [],
  showDateRange = true,
  className = '',
}: FilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Derived selected sets straight from URL — single source of truth.
  const selStatusTop = useMemo(
    () => new Set(readMulti(searchParams, QS_KEYS.statusTop)),
    [searchParams],
  )
  const selSubStatus = useMemo(
    () => new Set(readMulti(searchParams, QS_KEYS.subStatus)),
    [searchParams],
  )
  const selTier = useMemo(() => new Set(readMulti(searchParams, QS_KEYS.tier)), [searchParams])
  const selSource = useMemo(
    () => new Set(readMulti(searchParams, QS_KEYS.source)),
    [searchParams],
  )
  const selAssignee = useMemo(
    () => new Set(readMulti(searchParams, QS_KEYS.assignee)),
    [searchParams],
  )
  const fromDate = searchParams.get(QS_KEYS.from) ?? ''
  const toDate = searchParams.get(QS_KEYS.to) ?? ''

  const updateQs = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString())
      mutator(next)
      const qs = next.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const toggleMulti = (key: string, value: string) => {
    updateQs((next) => {
      const current = readMulti(next, key)
      const has = current.includes(value)
      next.delete(key)
      const updated = has ? current.filter((v) => v !== value) : [...current, value]
      updated.forEach((v) => next.append(key, v))
    })
  }

  const setDate = (key: string, value: string) => {
    updateQs((next) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
  }

  const clearAll = () => {
    updateQs((next) => {
      Object.values(QS_KEYS).forEach((k) => next.delete(k))
    })
  }

  // Sub-status options: only show ones valid for currently-selected top statuses;
  // if nothing selected, show the full union so the user can drill from any angle.
  const subStatusOptions = useMemo(() => {
    const tops = selStatusTop.size
      ? Array.from(selStatusTop)
      : (STATUS_TOP as readonly string[])
    const acc: string[] = []
    tops.forEach((t) => {
      const subs = SUB_STATUS_BY_TOP[t as keyof typeof SUB_STATUS_BY_TOP]
      if (subs) subs.forEach((s) => { if (!acc.includes(s)) acc.push(s) })
    })
    return acc
  }, [selStatusTop])

  const anyActive =
    selStatusTop.size +
      selSubStatus.size +
      selTier.size +
      selSource.size +
      selAssignee.size +
      (fromDate ? 1 : 0) +
      (toDate ? 1 : 0) >
    0

  return (
    <div
      className={`flex flex-wrap gap-2 items-center border border-gray-200 rounded-lg bg-white px-3 py-2 ${className}`}
      data-testid="filter-bar"
    >
      <FilterGroup label="Status">
        {(STATUS_TOP as readonly string[]).map((s) => (
          <Chip
            key={s}
            label={s}
            active={selStatusTop.has(s)}
            color={statusColor(s)}
            onClick={() => toggleMulti(QS_KEYS.statusTop, s)}
          />
        ))}
      </FilterGroup>

      {subStatusOptions.length > 0 && (
        <FilterGroup label="Sub-status">
          <DropdownMulti
            placeholder="Any"
            options={subStatusOptions}
            selected={selSubStatus}
            onToggle={(v) => toggleMulti(QS_KEYS.subStatus, v)}
          />
        </FilterGroup>
      )}

      <FilterGroup label="Tier">
        {(TIER_VALUES as readonly string[]).map((t) => (
          <Chip
            key={t}
            label={t}
            active={selTier.has(t)}
            color={tierColor(t)}
            onClick={() => toggleMulti(QS_KEYS.tier, t)}
          />
        ))}
      </FilterGroup>

      {leadSources.length > 0 && (
        <FilterGroup label="Source">
          <DropdownMulti
            placeholder="Any"
            options={leadSources}
            selected={selSource}
            onToggle={(v) => toggleMulti(QS_KEYS.source, v)}
          />
        </FilterGroup>
      )}

      {assignees.length > 0 && (
        <FilterGroup label="Assignee">
          <DropdownMulti
            placeholder="Anyone"
            options={assignees.map((a) => a.id)}
            labels={Object.fromEntries(assignees.map((a) => [a.id, a.name]))}
            selected={selAssignee}
            onToggle={(v) => toggleMulti(QS_KEYS.assignee, v)}
          />
        </FilterGroup>
      )}

      {showDateRange && (
        <FilterGroup label="Created">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setDate(QS_KEYS.from, e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
            aria-label="From date"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setDate(QS_KEYS.to, e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
            aria-label="To date"
          />
        </FilterGroup>
      )}

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
        >
          <X className="w-3 h-3" />
          Clear all
        </button>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] uppercase tracking-wide text-gray-500 mr-1">
        {label}
      </span>
      {children}
    </div>
  )
}

function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? `${color} border-transparent`
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function DropdownMulti({
  placeholder,
  options,
  labels,
  selected,
  onToggle,
}: {
  placeholder: string
  options: string[]
  labels?: Record<string, string>
  selected: Set<string>
  onToggle: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const summary =
    selected.size === 0
      ? placeholder
      : selected.size === 1
        ? labels?.[Array.from(selected)[0]] ?? Array.from(selected)[0]
        : `${selected.size} selected`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
      >
        {summary}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute z-20 mt-1 min-w-[180px] max-h-64 overflow-auto bg-white border border-gray-200 rounded shadow-lg py-1">
            {options.map((opt) => {
              const isSelected = selected.has(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onToggle(opt)}
                  className={`w-full flex items-center gap-2 text-left text-xs px-3 py-1.5 hover:bg-gray-50 ${
                    isSelected ? 'font-semibold text-indigo-700' : 'text-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block w-3 h-3 border rounded-sm flex-shrink-0 ${
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                    }`}
                  />
                  <span className="truncate">{labels?.[opt] ?? opt}</span>
                </button>
              )
            })}
            {options.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-gray-400">No options</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function statusColor(s: string): string {
  switch (s) {
    case 'Qualified':
      return 'bg-emerald-500 text-white'
    case 'Not Qualified':
      return 'bg-rose-500 text-white'
    case 'Attempted':
      return 'bg-amber-400 text-amber-950'
    default:
      return 'bg-slate-200 text-slate-700'
  }
}

function tierColor(t: string): string {
  switch (t) {
    case 'A':
      return 'bg-indigo-600 text-white'
    case 'B':
      return 'bg-slate-500 text-white'
    case 'C':
      return 'bg-zinc-400 text-white'
    default:
      return 'bg-gray-200 text-gray-700'
  }
}

// ─── Hook export so Lane D / inbox can read the active filters without re-parsing ───

export interface ActiveFilters {
  status_top: string[]
  sub_status: string[]
  tier_hint: string[]
  lead_source: string[]
  assigned_to: string[]
  created_from: string | null
  created_to: string | null
}

export function useActiveFilters(): ActiveFilters {
  const sp = useSearchParams()
  return {
    status_top: readMulti(sp, QS_KEYS.statusTop),
    sub_status: readMulti(sp, QS_KEYS.subStatus),
    tier_hint: readMulti(sp, QS_KEYS.tier),
    lead_source: readMulti(sp, QS_KEYS.source),
    assigned_to: readMulti(sp, QS_KEYS.assignee),
    created_from: sp.get(QS_KEYS.from),
    created_to: sp.get(QS_KEYS.to),
  }
}

/**
 * Serialise active filters into a query-string suitable for Lane B's
 * listLeadsPaginated endpoint. Empty arrays are omitted.
 */
export function activeFiltersToQuery(f: ActiveFilters): string {
  const q = new URLSearchParams()
  f.status_top.forEach((v) => q.append('status_top', v))
  f.sub_status.forEach((v) => q.append('sub_status', v))
  f.tier_hint.forEach((v) => q.append('tier_hint', v))
  f.lead_source.forEach((v) => q.append('lead_source', v))
  f.assigned_to.forEach((v) => q.append('assigned_to', v))
  if (f.created_from) q.set('created_from', f.created_from)
  if (f.created_to) q.set('created_to', f.created_to)
  return q.toString()
}
