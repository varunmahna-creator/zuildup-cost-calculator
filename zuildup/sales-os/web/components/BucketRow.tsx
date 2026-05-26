'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markActionDone } from '@/app/(app)/leads/[id]/actions'

interface Props {
  id: string
  name: string | null
  phone?: string | null
  nextActionType: string | null
  nextActionDue: string | null
  relativeLabel: string
  relativeColorClass: string
}

export default function BucketRow({
  id, name, phone, nextActionType, relativeLabel, relativeColorClass,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [hidden, setHidden] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (hidden) return null

  const handleMarkDone = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setErr(null)
    const fd = new FormData()
    fd.set('leadId', id)
    startTransition(async () => {
      const r = await markActionDone(fd)
      if (r?.error) setErr(r.error)
      else { setHidden(true); router.refresh() }
    })
  }

  return (
    <li>
      <div className="bg-white rounded px-2 py-1.5 hover:shadow-sm border border-transparent hover:border-gray-200 transition flex items-center gap-2">
        <Link href={`/leads/${id}`} className="block flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              {name || '(no name)'}
            </span>
            <span className={`text-xs whitespace-nowrap ${relativeColorClass}`}>
              {relativeLabel}
            </span>
          </div>
          <div className="text-xs text-gray-600 truncate">
            {nextActionType} {phone ? `· ${phone}` : ''}
          </div>
        </Link>
        <button
          type="button"
          onClick={handleMarkDone}
          disabled={pending}
          className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          title="Mark next action done"
        >
          {pending ? '…' : '✓ Done'}
        </button>
      </div>
      {err && <p className="text-[10px] text-red-700 px-2">{err}</p>}
    </li>
  )
}
