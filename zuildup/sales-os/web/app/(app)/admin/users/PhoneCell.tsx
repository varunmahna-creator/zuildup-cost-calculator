'use client'

import { useState, useTransition } from 'react'
import { updateUserPhone } from './actions'

export default function PhoneCell({
  userId,
  currentPhone,
}: {
  userId: string | null
  currentPhone: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentPhone || '')
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (!userId) {
    return <span className="text-xs text-gray-400 italic">not signed in yet</span>
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setEditing(true); setErr(null); setValue(currentPhone || '') }}
        className="text-sm text-left hover:bg-gray-50 px-1 py-0.5 rounded w-full"
        title="Click to edit"
      >
        {currentPhone || <span className="text-gray-400">—</span>}
      </button>
    )
  }

  const handleSave = () => {
    setErr(null)
    const fd = new FormData()
    fd.set('userId', userId)
    fd.set('phone', value.trim())
    startTransition(async () => {
      const res = await updateUserPhone(fd)
      if (res?.error) {
        setErr(res.error)
      } else {
        setEditing(false)
      }
    })
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+919876543210"
        autoFocus
        className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') { setEditing(false); setErr(null) }
        }}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setEditing(false); setErr(null) }}
        className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-700"
      >
        ✕
      </button>
      {err && <span className="text-xs text-red-600 ml-1">{err}</span>}
    </div>
  )
}
