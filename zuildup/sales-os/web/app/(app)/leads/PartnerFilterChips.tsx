'use client'

/**
 * PartnerFilterChips — top-of-page Y2G / ZuildUp partner buckets.
 *
 * Sales-team feedback 2026-05-29: previously these were rendered as
 * <Link href={{query:...}}> which, with Next 15's Router Cache, served
 * the prefetched RSC payload on click without re-running the dynamic
 * /leads server component. Result: URL changed but list didn't filter.
 *
 * Migrated to a client component that explicitly calls router.replace()
 * + router.refresh() — the same pattern FilterBar.tsx uses for its
 * status / sub-status / tier chips, which always worked.
 */

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const PARTNER_FILTERS: { key: string; label: string }[] = [
  { key: 'y2g', label: 'Y2G' },
  { key: 'zu', label: 'ZuildUp' },
]

export default function PartnerFilterChips() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = searchParams.get('partner') || ''

  const apply = (key: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (key) next.set('partner', key)
    else next.delete('partner')
    next.delete('page') // reset pagination on filter change
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      router.refresh()
    })
  }

  const base = 'px-3 py-1 rounded-full text-xs font-medium border transition-colors'
  const off = 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
  const on = 'bg-blue-600 text-white border-blue-600'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="partner-chips">
      <button
        type="button"
        onClick={() => apply(null)}
        disabled={pending}
        aria-pressed={!current}
        className={`${base} ${!current ? on : off} disabled:opacity-60`}
      >
        All
      </button>
      {PARTNER_FILTERS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => apply(p.key)}
          disabled={pending}
          aria-pressed={current === p.key}
          className={`${base} ${current === p.key ? on : off} disabled:opacity-60`}
        >
          {p.label}
        </button>
      ))}
      {pending && <span className="text-[11px] text-gray-500 ml-1">Loading…</span>}
    </div>
  )
}
