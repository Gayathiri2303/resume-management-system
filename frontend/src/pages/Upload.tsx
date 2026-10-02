import { useState, useCallback } from 'react'
import {
  Upload as UploadIcon,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

interface UploadFile {
  id: string
  file: File
}

interface DuplicateInfo {
  id: number
  candidate_id: string
  name: string
  email?: string | null
  phone?: string | null
}

interface UploadResultItem {
  filename: string
  status: 'completed' | 'needs_review' | 'failed' | 'duplicate_found' | 'updated' | 'created' | 'cancelled'
  error?: string
  candidate_id?: string
  name?: string
  duplicates?: DuplicateInfo[]
  extraction_preview?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    current_role?: string | null
  }
  pending?: Record<string, unknown>
}

interface UploadSummary {
  total: number
  completed: number
  needs_review: number
  failed: number
  duplicates_found: number
  results: UploadResultItem[]
}

export default function Upload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)

  // Optional recruiter fields (separate from AI extraction)
  const [customRole, setCustomRole] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [customSpecs, setCustomSpecs] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState('manual_upload')

  // Duplicate modal state
  const [duplicateItem, setDuplicateItem] = useState<UploadResultItem | null>(null)
  const [selectedExistingId, setSelectedExistingId] = useState<number | null>(null)

  const addFiles = (fileList: FileList) => {
    const newFiles: UploadFile[] = Array.from(fileList)
      .filter((f) => /\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i.test(f.name))
      .map((file) => ({ id: `${file.name}-${Date.now()}-${Math.random()}`, file }))
    setFiles((prev) => [...prev, ...newFiles])
    setSummary(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const startUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError('')
    setSummary(null)
    setDuplicateItem(null)

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f.file))

    if (customRole.trim()) formData.append('custom_role', customRole.trim())
    if (customLocation.trim()) formData.append('custom_location', customLocation.trim())
    if (customSpecs.trim()) formData.append('custom_specifications', customSpecs.trim())
    if (notes.trim()) formData.append('notes', notes.trim())
    formData.append('source', source || 'manual_upload')

    try {
      const result = await api.post<UploadSummary>('/api/resumes/upload', formData)
      setSummary(result)
      setFiles([])

      // Open duplicate modal for first duplicate_found item
      const dup = result.results.find((r) => r.status === 'duplicate_found')
      if (dup && dup.duplicates && dup.duplicates.length > 0) {
        setDuplicateItem(dup)
        setSelectedExistingId(dup.duplicates[0].id)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const resolveDuplicate = async (action: 'update_existing' | 'create_new' | 'cancel') => {
    if (!duplicateItem?.pending) {
      setDuplicateItem(null)
      return
    }

    setResolving(true)
    setError('')
    try {
      const body = {
        action,
        existing_candidate_id: action === 'update_existing' ? selectedExistingId : null,
        pending: duplicateItem.pending,
        custom_options: {
          custom_role: customRole.trim() || undefined,
          custom_location: customLocation.trim() || undefined,
          custom_specifications: customSpecs.trim() || undefined,
          notes: notes.trim() || undefined,
          source,
        },
      }

      const res = await api.post<{
        status: string
        candidate_id?: string
        name?: string
        version?: number
      }>('/api/resumes/resolve-duplicate', body)

      // Update summary row
      setSummary((prev) => {
        if (!prev) return prev
        const results = prev.results.map((r) => {
          if (r.filename !== duplicateItem.filename || r.status !== 'duplicate_found') return r
          if (action === 'cancel') {
            return { ...r, status: 'cancelled' as const, name: 'Cancelled by recruiter' }
          }
          if (action === 'update_existing') {
            return {
              ...r,
              status: 'updated' as const,
              candidate_id: res.candidate_id,
              name: res.name || r.name,
            }
          }
          return {
            ...r,
            status: 'created' as const,
            candidate_id: res.candidate_id,
            name: res.name || r.name,
          }
        })

        const duplicates_found = results.filter((r) => r.status === 'duplicate_found').length
        const completed =
          results.filter((r) => r.status === 'completed' || r.status === 'created' || r.status === 'updated').length

        return {
          ...prev,
          results,
          duplicates_found,
          completed,
        }
      })

      // If more duplicates remain, open next one
      setDuplicateItem(null)
      setTimeout(() => {
        setSummary((prev) => {
          if (!prev) return prev
          const next = prev.results.find((r) => r.status === 'duplicate_found')
          if (next && next.duplicates?.length) {
            setDuplicateItem(next)
            setSelectedExistingId(next.duplicates[0].id)
          }
          return prev
        })
      }, 100)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve duplicate')
    } finally {
      setResolving(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const statusIcon = (status: string) => {
    if (status === 'completed' || status === 'created' || status === 'updated') {
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
    }
    if (status === 'needs_review' || status === 'duplicate_found') {
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    }
    if (status === 'failed') {
      return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
    }
    return <Copy className="w-4 h-4 text-slate-400 shrink-0" />
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white">Upload Resumes</h1>
        <p className="text-slate-400 mt-1">
          Upload PDF, Word or image resumes. AI extracts details. Your custom role/location stay separate.
        </p>
      </div>

      {/* Optional Recruiter Fields — separate from AI data */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">
          Optional Recruiter Information
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          These fields are stored separately and never overwrite AI-extracted resume data.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Custom Role</label>
            <input
              type="text"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="e.g. Backend Developer, Inside Sales"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Custom Location / City</label>
            <input
              type="text"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              placeholder="e.g. Chennai, Bangalore"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm text-slate-400 mb-1.5">Other Specifications</label>
            <input
              type="text"
              value={customSpecs}
              onChange={(e) => setCustomSpecs(e.target.value)}
              placeholder="e.g. Immediate joiner preferred, Night shift OK"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm text-slate-400 mb-1.5">Recruiter Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this batch of candidates..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
            >
              <option value="manual_upload">Manual Upload</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="referral">Referral</option>
              <option value="job_portal">Job Portal</option>
              <option value="linkedin">LinkedIn</option>
              <option value="website">Website</option>
              <option value="walk_in">Walk-in</option>
            </select>
          </div>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-2xl p-10 lg:p-14 text-center transition-all duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-600/10 scale-[1.01]'
              : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
          }
        `}
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-5">
          <UploadIcon className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Drag & drop resumes here</h3>
        <p className="text-slate-400 text-sm mb-5">PDF, DOC, DOCX, JPG, PNG — up to 15 MB each</p>
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium text-white transition cursor-pointer shadow-lg shadow-blue-600/20">
          Browse Files
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Selected Files */}
      {files.length > 0 && (
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <p className="text-sm font-medium text-slate-200">
              {files.length} file{files.length !== 1 ? 's' : ''} ready
            </p>
            <button
              onClick={startUpload}
              disabled={uploading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition shadow-lg shadow-blue-600/20"
            >
              {uploading
                ? 'Uploading & Processing…'
                : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-800/40 transition"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  <File className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{f.file.name}</p>
                  <p className="text-xs text-slate-500">{formatSize(f.file.size)}</p>
                </div>
                {!uploading && (
                  <button
                    onClick={() => removeFile(f.id)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 text-sm text-red-400 bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-800 border-b border-slate-800">
            <div className="px-4 py-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{summary.completed}</p>
              <p className="text-xs text-slate-400 mt-0.5">Completed</p>
            </div>
            <div className="px-4 py-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{summary.needs_review}</p>
              <p className="text-xs text-slate-400 mt-0.5">Needs Review</p>
            </div>
            <div className="px-4 py-4 text-center">
              <p className="text-2xl font-bold text-red-400">{summary.failed}</p>
              <p className="text-xs text-slate-400 mt-0.5">Failed</p>
            </div>
            <div className="px-4 py-4 text-center">
              <p className="text-2xl font-bold text-orange-300">{summary.duplicates_found}</p>
              <p className="text-xs text-slate-400 mt-0.5">Duplicates</p>
            </div>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
            {summary.results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                {statusIcon(r.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{r.filename}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {r.status.replace('_', ' ')}
                    {r.candidate_id ? ` · ${r.candidate_id}` : ''}
                    {r.name ? ` · ${r.name}` : ''}
                  </p>
                </div>
                {r.status === 'duplicate_found' && (
                  <button
                    onClick={() => {
                      setDuplicateItem(r)
                      setSelectedExistingId(r.duplicates?.[0]?.id ?? null)
                    }}
                    className="text-xs px-3 py-1.5 bg-amber-600/20 text-amber-300 rounded-lg hover:bg-amber-600/30 transition"
                  >
                    Resolve
                  </button>
                )}
                {r.error && (
                  <span className="text-xs text-red-400 max-w-[180px] truncate">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate decision modal */}
      {duplicateItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Copy className="w-5 h-5 text-amber-400" />
                Possible Duplicate Found
              </h2>
              <button
                onClick={() => setDuplicateItem(null)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-3">
              File: <span className="text-slate-200">{duplicateItem.filename}</span>
            </p>

            {duplicateItem.extraction_preview && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4 text-sm">
                <p className="text-slate-300">
                  <span className="text-slate-500">Extracted name:</span>{' '}
                  {duplicateItem.extraction_preview.name || '—'}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Email:</span>{' '}
                  {duplicateItem.extraction_preview.email || '—'}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">Phone:</span>{' '}
                  {duplicateItem.extraction_preview.phone || '—'}
                </p>
              </div>
            )}

            <p className="text-sm text-slate-400 mb-2">Matching existing candidate(s):</p>
            <div className="space-y-2 mb-5 max-h-40 overflow-y-auto">
              {(duplicateItem.duplicates || []).map((d) => (
                <label
                  key={d.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    selectedExistingId === d.id
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="existing"
                    checked={selectedExistingId === d.id}
                    onChange={() => setSelectedExistingId(d.id)}
                    className="mt-1 accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {d.candidate_id}
                      {d.email ? ` · ${d.email}` : ''}
                      {d.phone ? ` · ${d.phone}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => resolveDuplicate('update_existing')}
                disabled={resolving || !selectedExistingId}
                className="px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
              >
                {resolving ? 'Working…' : 'Update Existing'}
              </button>
              <button
                onClick={() => resolveDuplicate('create_new')}
                disabled={resolving}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
              >
                Create New
              </button>
              <button
                onClick={() => resolveDuplicate('cancel')}
                disabled={resolving}
                className="px-3 py-2.5 bg-slate-800 hover:bg-red-600/20 hover:text-red-300 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}