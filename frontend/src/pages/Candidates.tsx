import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, Eye, Mail, Phone, Trash2, X, ChevronDown } from 'lucide-react'
import { api, ApiError } from '../lib/api'

interface Candidate {
  id: number
  candidate_id: string
  name: string
  current_role: string | null
  location: string | null
  total_experience_months: number
  experience_display: string | null
  notice_period: string | null
  status: string
  needs_review: boolean
  skills: string[]
  primary_email: string | null
  primary_phone: string | null
}

interface CandidateListResponse {
  items: Candidate[]
  total: number
  page: number
  page_size: number
  pages: number
}

const STATUS_OPTIONS = [
  'new', 'under_review', 'contacted', 'shortlisted',
  'interview_scheduled', 'interviewed', 'selected', 'rejected', 'on_hold',
]

const statusStyles: Record<string, string> = {
  new: 'bg-blue-600/20 text-blue-400',
  under_review: 'bg-amber-600/20 text-amber-400',
  contacted: 'bg-cyan-600/20 text-cyan-400',
  shortlisted: 'bg-emerald-600/20 text-emerald-400',
  interview_scheduled: 'bg-purple-600/20 text-purple-400',
  interviewed: 'bg-indigo-600/20 text-indigo-400',
  selected: 'bg-green-600/20 text-green-400',
  rejected: 'bg-red-600/20 text-red-400',
  on_hold: 'bg-slate-700 text-slate-300',
}

function formatStatus(s: string) {
  return s.replace(/_/g, ' ')
}

export default function Candidates() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [minExp, setMinExp] = useState('')
  const [maxExp, setMaxExp] = useState('')
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<{ ids: number[]; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const activeFilterCount = [
    statusFilter !== 'all',
    locationFilter.trim() !== '',
    skillFilter.trim() !== '',
    minExp !== '',
    maxExp !== '',
    needsReviewOnly,
  ].filter(Boolean).length

  const clearAllFilters = () => {
    setStatusFilter('all')
    setLocationFilter('')
    setSkillFilter('')
    setMinExp('')
    setMaxExp('')
    setNeedsReviewOnly(false)
    setSearch('')
  }

  const fetchCandidates = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (locationFilter.trim()) params.set('location', locationFilter.trim())
      if (skillFilter.trim()) params.set('skill', skillFilter.trim())
      if (minExp !== '') params.set('min_experience', String(Number(minExp) * 12))
      if (maxExp !== '') params.set('max_experience', String(Number(maxExp) * 12))
      if (needsReviewOnly) params.set('needs_review', 'true')
      params.set('page', '1')
      params.set('page_size', '50')

      const data = await api.get<CandidateListResponse>(`/api/candidates?${params}`)
      setCandidates(data.items)
      setTotal(data.total)
      setSelected((prev) => new Set([...prev].filter((id) => data.items.some((c) => c.id === id))))
    } catch {
      setError('Could not load candidates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = setTimeout(fetchCandidates, 300)
    return () => clearTimeout(timeout)
  }, [search, statusFilter, locationFilter, skillFilter, minExp, maxExp, needsReviewOnly])

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === candidates.length) setSelected(new Set())
    else setSelected(new Set(candidates.map((c) => c.id)))
  }

  const askDeleteOne = (c: Candidate) => setConfirmTarget({ ids: [c.id], label: c.name })
  const askDeleteSelected = () => {
    if (selected.size === 0) return
    setConfirmTarget({ ids: [...selected], label: `${selected.size} candidate${selected.size !== 1 ? 's' : ''}` })
  }

  const confirmDelete = async () => {
    if (!confirmTarget) return
    setDeleting(true)
    try {
      if (confirmTarget.ids.length === 1) {
        await api.delete(`/api/candidates/${confirmTarget.ids[0]}`)
      } else {
        await api.post('/api/candidates/bulk-delete', confirmTarget.ids)
      }
      setConfirmTarget(null)
      setSelected(new Set())
      fetchCandidates()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed')
      setConfirmTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Candidates</h1>
          <p className="text-slate-400 mt-1">
            {loading ? 'Loading…' : `${total} candidate${total !== 1 ? 's' : ''} found`}
          </p>
        </div>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, role, company, location..."
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

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Location</label>
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="e.g. Chennai, Nagercoil"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Skill</label>
              <input
                type="text"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                placeholder="e.g. Python, Sales"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Min Experience (years)</label>
              <input
                type="number"
                min="0"
                value={minExp}
                onChange={(e) => setMinExp(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Max Experience (years)</label>
              <input
                type="number"
                min="0"
                value={maxExp}
                onChange={(e) => setMaxExp(e.target.value)}
                placeholder="10"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 pb-2">
                <input
                  type="checkbox"
                  checked={needsReviewOnly}
                  onChange={(e) => setNeedsReviewOnly(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                Needs Review only
              </label>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {statusFilter !== 'all' && (
                  <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-lg text-xs flex items-center gap-1">
                    Status: {formatStatus(statusFilter)}
                    <button onClick={() => setStatusFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {locationFilter && (
                  <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-lg text-xs flex items-center gap-1">
                    Location: {locationFilter}
                    <button onClick={() => setLocationFilter('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {skillFilter && (
                  <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-lg text-xs flex items-center gap-1">
                    Skill: {skillFilter}
                    <button onClick={() => setSkillFilter('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {(minExp || maxExp) && (
                  <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 rounded-lg text-xs flex items-center gap-1">
                    Exp: {minExp || '0'}–{maxExp || '∞'} yrs
                    <button onClick={() => { setMinExp(''); setMaxExp('') }}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {needsReviewOnly && (
                  <span className="px-2.5 py-1 bg-amber-600/20 text-amber-300 rounded-lg text-xs flex items-center gap-1">
                    Needs Review
                    <button onClick={() => setNeedsReviewOnly(false)}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
              <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-white transition">
                Clear All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-blue-600/10 border border-blue-600/30 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-blue-300">
            {selected.size} candidate{selected.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition">
              Clear
            </button>
            <button
              onClick={askDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {error ? (
          <div className="text-center py-20 px-4"><p className="text-red-400 text-sm">{error}</p></div>
        ) : !loading && candidates.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No candidates found</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Try adjusting filters or upload more resumes.
            </p>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="mt-4 text-sm text-blue-400 hover:text-blue-300">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="px-4 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={candidates.length > 0 && selected.size === candidates.length}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 font-medium">Candidate</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Experience</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Skills</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40 transition cursor-pointer ${
                      selected.has(c.id) ? 'bg-blue-600/5' : ''
                    }`}
                    onClick={() => navigate(`/candidates/${c.id}`)}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{c.name}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        {c.primary_email && (
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.primary_email}</span>
                        )}
                        {c.primary_phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.primary_phone}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {c.current_role || '—'}
                      {c.location && <p className="text-xs text-slate-500">{c.location}</p>}
                    </td>
                    <td className="px-6 py-4 text-slate-300">{c.experience_display || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize ${statusStyles[c.status] || 'bg-slate-800 text-slate-300'}`}>
                        {formatStatus(c.status)}
                      </span>
                      {c.needs_review && (
                        <span className="ml-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-amber-600/20 text-amber-400">
                          Review
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {c.skills.slice(0, 3).map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-300">{s}</span>
                        ))}
                        {c.skills.length > 3 && <span className="text-xs text-slate-500">+{c.skills.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => navigate(`/candidates/${c.id}`)} className="p-2 hover:bg-slate-700 rounded-lg transition">
                          <Eye className="w-4 h-4 text-slate-400" />
                        </button>
                        <button onClick={() => askDeleteOne(c)} className="p-2 hover:bg-red-600/20 rounded-lg transition">
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Delete {confirmTarget.ids.length > 1 ? 'candidates' : 'candidate'}?
              </h2>
              <button onClick={() => setConfirmTarget(null)} className="p-1.5 hover:bg-slate-800 rounded-lg transition">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              This will permanently remove <span className="text-white font-medium">{confirmTarget.label}</span> and all associated data.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium transition">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}