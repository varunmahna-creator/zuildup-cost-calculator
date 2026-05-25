'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FilterBar } from '@/components/FilterBar'
import { SortDropdown } from '@/components/SortDropdown'
import ManualLeadModal from '@/components/ManualLeadModal'
import { Plus } from 'lucide-react'

interface Props {
  leadSources: string[]
  assignees: { id: string; name: string }[]
}

export default function LeadsHeaderClient({ leadSources, assignees }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-end gap-2">
        <SortDropdown />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Plus className="w-3 h-3" />
          New Lead
        </button>
      </div>
      <FilterBar
        leadSources={leadSources}
        assignees={assignees}
        showDateRange
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
