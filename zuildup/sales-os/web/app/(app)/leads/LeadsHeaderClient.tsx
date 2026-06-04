'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { FilterBar } from '@/components/FilterBar'
import { SortDropdown } from '@/components/SortDropdown'
import ManualLeadModal from '@/components/ManualLeadModal'
import { Plus, Search, Download } from 'lucide-react'
import { downloadLeadsXlsx } from '@/lib/leadApi'

interface Props {
  leadSources: string[]
  assignees: { id: string; name: string }[]
  // Bucket-A 2026-06-04 (item 13): role for assignee-filter gating.
  currentUserRole?: 'admin' | 'director' | 'spoc' | string
}

export default function LeadsHeaderClient({ leadSources, assignees, currentUserRole }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Item 6 (feedback 2026-05-26): inline search across name/phone/email.
  // Backend listLeadsPaginated already does ILIKE %q% — we just wire the
  // URL ?q= param with a debounced controlled input.
  const [q, setQ] = useState(searchParams.get('q') || '')

  // Bucket-C (2026-06-04) item 14 — admin-only Excel export.
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    const r = await downloadLeadsXlsx()
    setExporting(false)
    if (!r.ok) {
      setExportError(r.error || 'Export failed')
      setTimeout(() => setExportError(null), 5000)
    }
  }
  // Sales feedback 2026-05-29 (Bug 6): show a tiny spinner inside the search
  // box while the debounced search is firing, so SPOCs know typing
  // registered. Uses startTransition around the router.refresh() so the
  // pending bit reflects the actual list-refetch round-trip.
  const [searchPending, startSearchTransition] = useTransition()

  useEffect(() => {
    // Keep local state in sync if URL changes third-partyly (back/forward).
    setQ(searchParams.get('q') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    const t = setTimeout(() => {
      const cur = searchParams.get('q') || ''
      if (q.trim() === cur) return
      const next = new URLSearchParams(searchParams.toString())
      if (q.trim()) next.set('q', q.trim())
      else next.delete('q')
      // Reset to page 1 when search changes.
      next.delete('page')
      const qs = next.toString()
      startSearchTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        router.refresh()
      })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search leads"
          />
          {searchPending && (
            <span
              className="absolute right-7 top-1/2 -translate-y-1/2 inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
              aria-label="Searching"
            />
          )}
          {q && !searchPending && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SortDropdown />
          {/* Bucket-C item 14 — admin-only Excel download. */}
          {currentUserRole === 'admin' && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
              title="Download all leads (admin only). Excludes soft-deleted rows."
            >
              <Download className="w-3 h-3" />
              {exporting ? 'Preparing…' : 'Download Excel'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            <Plus className="w-3 h-3" />
            New Lead
          </button>
        </div>
        {exportError && (
          <span className="text-xs text-rose-600 ml-2">{exportError}</span>
        )}
      </div>
      <FilterBar
        leadSources={leadSources}
        assignees={assignees}
        showDateRange
        currentUserRole={currentUserRole}
      />
      <ManualLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(lead) => {
          // Navigate to /leads with the new lead inline-opened (Lane D URL convention).
          // Item 11 (feedback 2026-05-25): SPA transition rather than full doc reload.
          router.push(`/leads?open=${encodeURIComponent(lead.id)}`)
          router.refresh()
        }}
      />
    </div>
  )
}
