'use client'

/**
 * LeadsClient — Lane E owns the filter/sort shell; Lane D owns the list body.
 *
 * To integrate, Lane D should:
 *   1. Drop its <LeadListInlineExpand /> component into the {/* LIST_SLOT */} marker
 *   2. Read URL filters via `useActiveFilters()` from '@/components/FilterBar'
 *   3. Read URL sort via `useActiveSort()` from '@/components/SortDropdown'
 *   4. Use `activeFiltersToQuery(filters)` to build the API query string.
 *
 * Until Lane D lands, this renders a placeholder list area so the page
 * doesn't 404 and so the filter UI can be QA'd in isolation.
 */

import { useEffect, useState } from 'react'
import { FilterBar, useActiveFilters, activeFiltersToQuery } from '@/components/FilterBar'
import { SortDropdown, useActiveSort } from '@/components/SortDropdown'
import { Plus } from 'lucide-react'

const INBOX_API = process.env.NEXT_PUBLIC_INBOX_API_URL || ''

export default function LeadsClient() {
  const filters = useActiveFilters()
  const sort = useActiveSort()
  const [sources, setSources] = useState<string[]>([])
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([])
  // Lane D will populate this with the live count once the list is wired in.
  const [leadCount] = useState<number | null>(null)

  // Lazy-load the dynamic dropdown lists from the inbox-api. We do this
  // client-side so we don't block the page render; on failure the bar still
  // works, just without source/assignee chips.
  useEffect(() => {
    if (!INBOX_API) return
    let cancelled = false
    const load = async () => {
      try {
        const [srcRes, asgRes] = await Promise.all([
          fetch(`${INBOX_API}/meta/lead-sources`).catch(() => null),
          fetch(`${INBOX_API}/meta/assignees`).catch(() => null),
        ])
        if (cancelled) return
        if (srcRes?.ok) {
          const j = await srcRes.json()
          if (Array.isArray(j.sources)) setSources(j.sources)
        }
        if (asgRes?.ok) {
          const j = await asgRes.json()
          if (Array.isArray(j.assignees)) setAssignees(j.assignees)
        }
      } catch {
        /* swallow — bar degrades gracefully */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Effective query that Lane D's list component should issue.
  const apiQuery = (() => {
    const q = new URLSearchParams(activeFiltersToQuery(filters))
    if (sort !== 'newest') q.set('sort', sort)
    return q.toString()
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500">
            Filter, sort, and triage incoming inquiries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SortDropdown />
          <button
            type="button"
            // Lane D wires this to the manual-lead modal (POST /leads/manual)
            data-action="new-lead"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            <Plus className="w-3 h-3" />
            New Lead
          </button>
        </div>
      </div>

      <FilterBar
        leadSources={sources}
        assignees={assignees}
        showDateRange
      />

      {/* LIST_SLOT — Lane D replaces this block with the inline-expand list.
          The list component should read filters/sort via the hooks exported
          from FilterBar.tsx + SortDropdown.tsx (single source of truth).      */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">Lead list pending Lane D wire-up.</p>
        <p className="text-xs text-gray-500">
          Filter/sort shell is live. Lane D plugs in the inline-expand row component here.
        </p>
        {apiQuery && (
          <pre className="mt-3 text-[11px] bg-gray-50 border border-gray-100 rounded p-2 overflow-auto">
            GET /leads?{apiQuery}
          </pre>
        )}
        {leadCount !== null && (
          <p className="text-xs text-gray-500 mt-2">{leadCount} leads matched.</p>
        )}
      </div>

    </div>
  )
}
