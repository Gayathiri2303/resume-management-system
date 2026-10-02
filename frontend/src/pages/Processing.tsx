import { useEffect, useState } from 'react'
import {
  CheckCircle2, Loader2, XCircle, Clock, AlertTriangle, Search, Filter, ChevronDown, RefreshCw, Trash2
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

interface Job {
  id: number
  filename: string
  status: string
  error: string | null
  candidate_id: number | null
  retry_count: number
  created_at: string
}

const STATUS_OPTIONS = [
  'uploaded', 'processing', 'text_extracted', 'ai_processing',
  'completed', 'needs_review', 'failed'
]

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  uploaded: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-800', label: 'Uploaded' },
  processing: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-600/20', label: 'Processing' },
  text_extracted: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-600/20', label: 'Extracting' },
  ai_processing: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-600/20', label: 'AI Processing' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-600/20', label: 'Completed' },
  needs_review: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-600/20', label: 'Needs Review' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-600/20', label: 'Failed' },
}

export default function Processing() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [retrying, setRetrying] = useState<number | null>(null)

  const activeFilterCount = [statusFilter !== 'all', search.trim() !== ''].filter(Boolean).length

  const clearFilters = () => {
    setStatusFilter('all')
    setSearch('')
  }

  const fetchJobs = async () => {
    try {
      const data = await api.get<Job[]>('/api/resumes/jobs')
      setJobs(data)
      setError('')
    } catch {
      setJobs([])
      setError('Could not load processing jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 4000)
    return () => clearInterval(interval)
  }, [])

  const filtered = jobs.filter((j) => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false
    if (search.trim() && !j.filename.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    queued: jobs.filter((j) => j.status === 'uploaded').length,
    processing: jobs.filter((j) => ['processing', 'text_extracted', 'ai_processing'].includes(j.status)).length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed' || j.status === 'needs_review').length,
  }

  const retryJob = async (jobId: number) => {
    setRetrying(jobId)
    try {
      await api.post(`/api/resumes/jobs/${jobId}/retry`)
      await fetchJobs()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }

  const retryAllFailed = async () => {
    const failed = jobs.filter((j) => j.status === 'failed' || j.status === 'needs_review')
    for (const job of failed) {
      try {
        await api.post(`/api/resumes/jobs/${job.id}/retry`)
      } catch {
        // continue
      }
    }
    fetchJobs()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Processing</h1>
          <p className="text-slate-400 mt-1">Track resume parsing and AI processing jobs</p>
        </div>
        {counts.failed > 0 && (
          <button
            onClick={retryAllFailed}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium transition"
          >
            <RefreshCw className="w-4 h-4" />
            Retry all failed ({counts.failed})
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Queued', value: counts.queued, color: 'text-slate-400' },
          { label: 'Processing', value: counts.processing, color: 'text-blue-400' },
          { label: 'Completed', value: counts.completed, color: 'text-emerald-400' },
          { label: 'Failed / Review', value: counts.failed, color: 'text-red-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-400 text-sm">{stat.label}</p>
            <p className={`text-2xl font-bold mt-2 ${stat.color}`}>{loading ? '—' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
            showFilters || activeFilterCount > 0
              ? 'bg-blue-600/15 border-blue-600/40 text-blue-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{statusConfig[s]?.label || s}</option>
              ))}
            </select>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
              <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white transition">
                Clear All
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-400 bg-red-600/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {!loading && filtered.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {jobs.length === 0 ? 'No processing jobs' : 'No matching jobs'}
            </h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              {jobs.length === 0
                ? 'Jobs appear here when resumes are uploaded and queued for AI processing.'
                : 'Try adjusting your search or filters.'}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mt-4 text-sm text-blue-400 hover:text-blue-300">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filtered.map((job) => {
              const config = statusConfig[job.status] || statusConfig.uploaded
              const Icon = config.icon
              const isSpinning = ['processing', 'text_extracted', 'ai_processing'].includes(job.status)
              return (
                <div key={job.id} className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-slate-800/30 transition">
                  <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color} ${isSpinning ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{job.filename}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(job.created_at).toLocaleString()}
                      {job.retry_count > 0 && ` · Retries: ${job.retry_count}`}
                      {job.error && <span className="text-red-400"> — {job.error}</span>}
                    </p>
                  </div>
                  <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  {(job.status === 'failed' || job.status === 'needs_review') && (
                    <button
                      onClick={() => retryJob(job.id)}
                      disabled={retrying === job.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition"
                    >
                      {retrying === job.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Retry
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}