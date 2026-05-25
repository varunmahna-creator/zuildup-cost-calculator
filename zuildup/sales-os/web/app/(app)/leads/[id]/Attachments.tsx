'use client'

import { useState, useTransition } from 'react'
import { uploadAttachment } from './actions'

export default function Attachments({ leadId, attachments }: {
  leadId: string
  attachments: any[]
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMsg(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('leadId', leadId)
    startTransition(async () => {
      const res = await uploadAttachment(fd)
      if (res?.error) setMsg('Error: ' + res.error)
      else { setMsg('Uploaded'); form.reset() }
    })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2 bg-gray-50 p-3 rounded">
        <div className="flex items-center gap-2">
          <select name="kind" className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="quote">Quote</option>
            <option value="floor_plan">Floor Plan</option>
            <option value="photo">Photo</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
          <input type="file" name="file" required className="text-sm flex-1" />
          <button type="submit" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded disabled:opacity-50">
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </form>
      <div className="space-y-1">
        {attachments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No attachments yet.</p>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded text-sm">
              <div>
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mr-2">{a.kind}</span>
                <span className="font-medium">{a.file_name}</span>
                <span className="text-gray-400 text-xs ml-2">{a.file_size ? Math.round(a.file_size / 1024) + ' KB' : ''}</span>
              </div>
              <a href={"/api/attachments/signed?path=" + encodeURIComponent(a.file_url)} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-xs">Download</a>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
