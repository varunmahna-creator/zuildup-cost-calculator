'use client'

/**
 * SortDropdown — Lane E (QoL sprint 2026-05-22).
 *
 * Companion to FilterBar. Sort selection is URL-synced under ?sort=<key>.
 *
 * Wired against Lane B's listLeadsPaginated extension:
 *   sort=newest | oldest | recent_activity | callback_soon | restart_soon
 *
 * Default (no ?sort param) = "newest".
 */

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, ChevronDown } from 'lucide-react'

export type SortKey =
  | 'newest'
  | 'oldest'
  | 'recent_activity'
  | 'callback_soon'
  | 'restart_soon'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'recent_activity', label: 'Recent activity' },
  { value: 'callback_soon', label: 'Callback due soon' },
  { value: 'restart_soon', label: 'Restart due soon' },
]

export function SortDropdown({ className = '' }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  const current: SortKey = useMemo(() => {
    const v = searchParams.get('sort')
    return (SORT_OPTIONS.find((o) => o.value === v)?.value ?? 'newest') as SortKey
  }, [searchParams])

  const setSort = useCallback(
    (v: SortKey) => {
      const next = new URLSearchParams(searchParams.toString())
      if (v === 'newest') next.delete('sort')
      else next.set('sort', v)
      const qs = next.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
      setOpen(false)
    },
    [router, pathname, searchParams],
  )

  const label = SORT_OPTIONS.find((o) => o.value === current)?.label ?? 'Newest first'

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ArrowUpDown className="w-3 h-3" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="listbox"
            className="absolute right-0 z-20 mt-1 min-w-[180px] bg-white border border-gray-200 rounded shadow-lg py-1"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={current === opt.value}
                onClick={() => setSort(opt.value)}
                className={`w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 ${
                  current === opt.value
                    ? 'font-semibold text-indigo-700 bg-indigo-50'
                    : 'text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function useActiveSort(): SortKey {
  const sp = useSearchParams()
  const v = sp.get('sort')
  return (SORT_OPTIONS.find((o) => o.value === v)?.value ?? 'newest') as SortKey
}
