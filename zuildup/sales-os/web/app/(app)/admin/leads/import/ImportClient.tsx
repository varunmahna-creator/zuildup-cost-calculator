'use client'

import { useRef, useState } from 'react'

interface SkippedRow {
  row: number
  name: string | null
  phone: string | null
  reason: string
  existing_lead_id?: string
}

interface ErrorRow {
  row: number
  raw: Record<string, unknown>
  reason: string
}

interface CreatedRow {
  row: number
  lead_id: string
  name: string
  phone: string
  assigned_to: string | null
}

interface ImportResponse {
  created_count: number
  skipped_count: number
  error_count: number
  total_rows: number
  created: CreatedRow[]
  skipped_duplicates: SkippedRow[]
  errors: ErrorRow[]
  warning: string | null
  detected_headers: string[]
  mapped_headers: Record<string, string>
}

export default function ImportClient({ userName }: { userName: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [dragging, setDragging] = useState(false)

  async function handleUpload(file: File) {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/leads/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || `HTTP ${res.status}`)
      } else {
        setResult(data as ImportResponse)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleUpload(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleUpload(f)
  }

  function downloadIssuesCsv() {
    if (!result) return
    const rows: string[] = ['type,row,name,phone,reason,existing_lead_id']
    for (const s of result.skipped_duplicates) {
      rows.push(
        [
          'skipped',
          s.row,
          csvEscape(s.name ?? ''),
          csvEscape(s.phone ?? ''),
          csvEscape(s.reason),
          csvEscape(s.existing_lead_id ?? ''),
        ].join(','),
      )
    }
    for (const er of result.errors) {
      rows.push(
        [
          'error',
          er.row,
          csvEscape((er.raw?.name as string) ?? ''),
          csvEscape((er.raw?.phone as string) ?? ''),
          csvEscape(er.reason),
          '',
        ].join(','),
      )
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `referral-import-issues-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function reset() {
    setResult(null)
    setErr(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (busy) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <div className="text-gray-700">Processing upload, please wait…</div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="space-y-6">
        {result.warning && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-4 text-sm">
            ⚠️ {result.warning}
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Created" value={result.created_count} tone="success" />
          <KpiCard label="Skipped (duplicates)" value={result.skipped_count} tone="warn" />
          <KpiCard label="Errors" value={result.error_count} tone="error" />
        </div>

        <div className="text-xs text-gray-500">
          Detected columns: {result.detected_headers.join(', ') || '(none)'} · Mapped:{' '}
          {Object.entries(result.mapped_headers)
            .map(([raw, std]) => `${raw} → ${std}`)
            .join(', ') || '(none)'}
        </div>

        <div className="flex gap-3">
          {(result.skipped_count > 0 || result.error_count > 0) && (
            <button
              onClick={downloadIssuesCsv}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-800 text-white rounded"
            >
              Download CSV of issues
            </button>
          )}
          <button
            onClick={reset}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Upload another file
          </button>
        </div>

        {result.skipped_duplicates.length > 0 && (
          <IssueTable
            title="Skipped (duplicate phone)"
            rows={result.skipped_duplicates.slice(0, 50).map((s) => ({
              row: s.row,
              name: s.name ?? '',
              phone: s.phone ?? '',
              reason: s.reason + (s.existing_lead_id ? ` (existing: ${s.existing_lead_id.slice(0, 8)}…)` : ''),
            }))}
            total={result.skipped_duplicates.length}
            tone="warn"
          />
        )}

        {result.errors.length > 0 && (
          <IssueTable
            title="Errors"
            rows={result.errors.slice(0, 50).map((e) => ({
              row: e.row,
              name: (e.raw?.name as string) ?? '',
              phone: (e.raw?.phone as string) ?? '',
              reason: e.reason,
            }))}
            total={result.errors.length}
            tone="error"
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 rounded-lg p-3 text-sm">
          Error: {err}
        </div>
      )}

      <div className="flex gap-3 mb-2">
        <a
          href="/api/admin/leads/template"
          className="px-4 py-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 rounded inline-flex items-center gap-2"
        >
          📥 Download template
        </a>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'
        }`}
      >
        <div className="text-gray-700 mb-2">
          <strong>Click to choose a file</strong> or drag &amp; drop here
        </div>
        <div className="text-xs text-gray-500">Accepts .xlsx and .csv · Logged in as {userName}</div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={onPick}
        />
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warn' | 'error'
}) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : tone === 'warn'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-rose-50 border-rose-200 text-rose-800'
  return (
    <div className={`border rounded-lg p-4 ${cls}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide mt-1">{label}</div>
    </div>
  )
}

function IssueTable({
  title,
  rows,
  total,
  tone,
}: {
  title: string
  rows: { row: number; name: string; phone: string; reason: string }[]
  total: number
  tone: 'warn' | 'error'
}) {
  const headBg = tone === 'warn' ? 'bg-amber-50' : 'bg-rose-50'
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 font-medium text-sm">
        {title} · showing {rows.length} of {total}
      </div>
      <table className="min-w-full text-sm">
        <thead className={headBg}>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium">Row</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Phone</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-2 text-xs">{r.row}</td>
              <td className="px-3 py-2 text-xs">{r.name}</td>
              <td className="px-3 py-2 text-xs">{r.phone}</td>
              <td className="px-3 py-2 text-xs">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
