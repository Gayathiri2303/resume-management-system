import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Briefcase, X, Search, Trash2, Users, Filter, ChevronDown,
  MapPin, Clock, Upload, FileText, Sparkles, Loader2, Building2
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

interface Requirement {
  id: number
  requirement_id: string
  name: string
  company_name?: string | null
  role: string | null
  location: string | null
  min_experience_months: number | null
  max_experience_months: number | null
  status: string
  required_skills: string[]
  preferred_skills: string[]
}

interface MatchItem {
  candidate_id: number
  candidate_code: string
  name: string
  role: string | null
  location: string | null
  experience: string
  skills: string[]
  notice_period: string | null
  status: string
  match_score: number
  explanations: Array<{ status: string; label: string; detail: string; source?: string } | string>
}

interface MatchResponse {
  requirement_id: string
  requirement_name: string
  total_matches: number
  matches: MatchItem[]
}

const STATUS_OPTIONS = ['open', 'on_hold', 'closed', 'filled']

const statusStyles: Record<string, string> = {
  open: 'bg-emerald-600/20 text-emerald-400',
  on_hold: 'bg-amber-600/20 text-amber-400',
  closed: 'bg-slate-800 text-slate-400',
  filled: 'bg-blue-600/20 text-blue-400',
}

const emptyForm = {
  name: '',
  company_name: '',
  role: '',
  location: '',
  min_years: '',
  max_years: '',
  required_skills: '',
  preferred_skills: '',
}

type CreateMode = 'manual' | 'paste' | 'upload'

function formatStatus(s: string) {
  return s.replace(/_/g, ' ')
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-slate-400'
}

function scoreBar(score: number) {
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-slate-500'
}

function formatExp(min: number | null, max: number | null) {
  if (!min && !max) return 'Any experience'
  const toYears = (m: number) => (m / 12).toFixed(1).replace('.0', '')
  if (min && max) return `${toYears(min)}–${toYears(max)} yrs`
  if (min) return `${toYears(min)}+ yrs`
  return `Up to ${toYears(max!)} yrs`
}

export default function Requirements() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>('manual')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)

  const [matchReq, setMatchReq] = useState<Requirement | null>(null)
  const [matchData, setMatchData] = useState<MatchResponse | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')

  const activeFilterCount = [statusFilter !== 'all', search.trim() !== ''].filter(Boolean).length

  const clearFilters = () => {
    setStatusFilter('all')
    setSearch('')
  }

  const fetchRequirements = async () => {
    setLoading(true)
    setListError('')
    try {
      const data = await api.get<Requirement[]>('/api/requirements')
      setRequirements(data)
    } catch {
      setListError('Could not load requirements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequirements()
  }, [])

  const filtered = requirements.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const hay = `${r.name} ${r.company_name || ''} ${r.role || ''} ${r.location || ''} ${r.required_skills.join(' ')} ${r.preferred_skills.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const resetCreateModal = () => {
    setForm(emptyForm)
    setJdText('')
    setJdFile(null)
    setError('')
    setCreateMode('manual')
    setAnalyzing(false)
  }

  const openCreateModal = () => {
    resetCreateModal()
    setShowModal(true)
  }

  const analyzeJd = async () => {
    if (createMode === 'paste' && !jdText.trim()) {
      setError('Please paste the job description text')
      return
    }
    if (createMode === 'upload' && !jdFile) {
      setError('Please select a JD file')
      return
    }

    setAnalyzing(true)
    setError('')
    try {
      const formData = new FormData()
      let data: any

      if (createMode === 'paste') {
        formData.append('jd_text', jdText.trim())
        data = await api.post('/api/requirements/analyze-jd', formData)
      } else {
        formData.append('file', jdFile!)
        const res = await api.post<{ analysis: any; extracted_text_preview?: string }>(
          '/api/requirements/analyze-jd-file',
          formData
        )
        data = res.analysis ?? res
      }

      const monthsToYears = (m: number | null | undefined) => {
        if (m == null || !Number.isFinite(Number(m))) return ''
        const y = Number(m) / 12
        return y % 1 === 0 ? String(y) : y.toFixed(1)
      }

      setForm({
        name: data.name || data.role || '',
        company_name: data.company_name || data.company || '',
        role: data.role || '',
        location: data.location || '',
        min_years: monthsToYears(data.min_experience_months),
        max_years: monthsToYears(data.max_experience_months),
        required_skills: Array.isArray(data.required_skills) ? data.required_skills.join(', ') : '',
        preferred_skills: Array.isArray(data.preferred_skills) ? data.preferred_skills.join(', ') : '',
      })

      setCreateMode('manual')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not analyze JD. You can still fill the form manually.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Requirement name is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('name', form.name.trim())
      if (form.company_name.trim()) formData.append('company_name', form.company_name.trim())
      if (form.role.trim()) formData.append('role', form.role.trim())
      if (form.location.trim()) formData.append('location', form.location.trim())
      if (form.min_years !== '' && Number.isFinite(Number(form.min_years)))
        formData.append('min_experience_months', String(Math.round(Number(form.min_years) * 12)))
      if (form.max_years !== '' && Number.isFinite(Number(form.max_years)))
        formData.append('max_experience_months', String(Math.round(Number(form.max_years) * 12)))
      if (form.required_skills.trim()) formData.append('required_skills', form.required_skills)
      if (form.preferred_skills.trim()) formData.append('preferred_skills', form.preferred_skills)

      await api.post('/api/requirements', formData)
      setShowModal(false)
      resetCreateModal()
      fetchRequirements()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create requirement')
    } finally {
      setSaving(false)
    }
  }

  const findCandidates = async (req: Requirement) => {
    setMatchReq(req)
    setMatchData(null)
    setMatchError('')
    setMatching(true)
    try {
      const data = await api.post<MatchResponse>(`/api/requirements/${req.id}/find-candidates`, {})
      setMatchData(data)
    } catch (err) {
      setMatchError(err instanceof ApiError ? err.message : 'Could not find candidates')
    } finally {
      setMatching(false)
    }
  }

  const changeStatus = async (req: Requirement, status: string) => {
    try {
      await api.post(`/api/requirements/${req.id}/status`, { status })
      setRequirements((prev) => prev.map((r) => (r.id === req.id ? { ...r, status } : r)))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update status')
    }
  }

  const deleteRequirement = async (req: Requirement) => {
    if (!window.confirm(`Delete "${req.name}"? Its saved matches will be removed too.`)) return
    try {
      await api.delete<void>(`/api/requirements/${req.id}`)
      setRequirements((prev) => prev.filter((r) => r.id !== req.id))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not delete requirement')
    }
  }

  const wantedSkills = new Set(
    [...(matchReq?.required_skills || []), ...(matchReq?.preferred_skills || [])].map((s) =>
      s.toLowerCase()
    )
  )

  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Requirements</h1>
          <p className="text-slate-400 mt-1">
            {loading ? 'Loading…' : `${filtered.length} requirement${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New Requirement
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, company, role, location, skills…"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {formatStatus(s)}
                  </option>
                ))}
              </select>
            </div>
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

      {listError && (
        <p className="mb-4 text-sm text-red-400 bg-red-600/10 border border-red-600/20 rounded-lg px-4 py-3">
          {listError}
        </p>
      )}

      {!loading && filtered.length === 0 && !listError ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl text-center py-20 px-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {requirements.length === 0 ? 'No requirements yet' : 'No matching requirements'}
          </h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
            {requirements.length === 0
              ? 'Create a requirement manually, paste a JD, or upload a JD file to start matching candidates.'
              : 'Try adjusting your search or filters.'}
          </p>
          {requirements.length === 0 ? (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Create Requirement
            </button>
          ) : (
            <button onClick={clearFilters} className="text-sm text-blue-400 hover:text-blue-300">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((req) => (
            <div
              key={req.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">{req.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {req.requirement_id}
                    {req.company_name ? ` · ${req.company_name}` : ''}
                    {` · ${req.role || 'No role'}`}
                  </p>
                </div>
                <button
                  onClick={() => deleteRequirement(req)}
                  className="p-1.5 hover:bg-red-600/20 rounded-lg transition shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-slate-500 hover:text-red-400" />
                </button>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 mb-3">
                {req.company_name && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {req.company_name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {req.location || 'Any location'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatExp(req.min_experience_months, req.max_experience_months)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4 min-h-[28px]">
                {req.required_skills.map((skill) => (
                  <span key={skill} className="px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-200">
                    {skill}
                  </span>
                ))}
                {req.preferred_skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 border border-slate-700 rounded-md text-xs text-slate-400"
                    title="Preferred"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-auto pt-3 border-t border-slate-800/60">
                <select
                  value={req.status}
                  onChange={(e) => changeStatus(req, e.target.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize border-0 focus:outline-none focus:ring-2 focus:ring-blue-600/50 cursor-pointer ${
                    statusStyles[req.status] || 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="bg-slate-900 text-white">
                      {formatStatus(s)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => findCandidates(req)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
                >
                  <Search className="w-4 h-4" />
                  Find Candidates
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">New Requirement</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex gap-2 mb-5">
              {[
                { id: 'manual' as const, label: 'Manual', icon: FileText },
                { id: 'paste' as const, label: 'Paste JD', icon: FileText },
                { id: 'upload' as const, label: 'Upload JD', icon: Upload },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setCreateMode(tab.id)
                    setError('')
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                    createMode === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {createMode === 'paste' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Paste Job Description</label>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={10}
                    placeholder="Paste the full job description here…"
                    className={`${inputClass} resize-none`}
                  />
                </div>
                <button
                  onClick={analyzeJd}
                  disabled={analyzing || !jdText.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyze with AI
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  After analysis the form will open so you can review & edit before creating.
                </p>
              </div>
            )}

            {createMode === 'upload' && (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-blue-600/50 rounded-2xl p-8 text-center cursor-pointer transition bg-slate-950/50"
                >
                  <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  {jdFile ? (
                    <>
                      <p className="text-sm font-medium text-white">{jdFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {(jdFile.size / 1024).toFixed(1)} KB · Click to change
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-white">Click to upload JD</p>
                      <p className="text-xs text-slate-500 mt-1">PDF, DOCX, or TXT (max 10 MB)</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        if (f.size > 10 * 1024 * 1024) {
                          setError('File must be under 10 MB')
                          return
                        }
                        setJdFile(f)
                        setError('')
                      }
                    }}
                  />
                </div>
                <button
                  onClick={analyzeJd}
                  disabled={analyzing || !jdFile}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyze with AI
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  After analysis the form will open so you can review & edit before creating.
                </p>
              </div>
            )}

            {createMode === 'manual' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Requirement Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Senior Backend Engineer - Q4"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Company Name</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="e.g. Acme Corp"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Role</label>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="e.g. Backend Engineer"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Chennai / Remote"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Min Exp (yrs)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={form.min_years}
                      onChange={(e) => setForm({ ...form, min_years: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Max Exp (yrs)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={form.max_years}
                      onChange={(e) => setForm({ ...form, max_years: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Required Skills</label>
                  <input
                    type="text"
                    value={form.required_skills}
                    onChange={(e) => setForm({ ...form, required_skills: e.target.value })}
                    placeholder="Python, SQL, AWS (comma separated)"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Preferred Skills</label>
                  <input
                    type="text"
                    value={form.preferred_skills}
                    onChange={(e) => setForm({ ...form, preferred_skills: e.target.value })}
                    placeholder="Docker, Kubernetes (comma separated)"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium transition"
              >
                Cancel
              </button>
              {createMode === 'manual' && (
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
                >
                  {saving ? 'Creating…' : 'Create'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Match results modal */}
      {matchReq && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  Matching candidates
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {matchReq.name}
                  {matchReq.company_name ? ` · ${matchReq.company_name}` : ''}
                  {matchData ? ` · ${matchData.total_matches} match${matchData.total_matches !== 1 ? 'es' : ''}` : ''}
                </p>
              </div>
              <button onClick={() => setMatchReq(null)} className="p-1.5 hover:bg-slate-800 rounded-lg transition">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3">
              {matching && (
                <div className="text-center py-16">
                  <p className="text-sm text-slate-400">Scoring candidates against requirement…</p>
                </div>
              )}
              {matchError && <p className="text-sm text-red-400 text-center py-10">{matchError}</p>}

              {matchData && matchData.matches.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-sm text-slate-400">No candidates scored above the minimum threshold.</p>
                </div>
              )}

              {matchData?.matches.map((m) => (
                <div
                  key={m.candidate_id}
                  onClick={() => navigate(`/candidates/${m.candidate_id}`)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-white">{m.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {m.role || '—'} · {m.location || 'No location'} · {m.experience}
                        {m.notice_period ? ` · Notice: ${m.notice_period}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 w-24">
                      <p className={`text-xl font-bold ${scoreColor(m.match_score)}`}>
                        {Math.round(m.match_score)}%
                      </p>
                      <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${scoreBar(m.match_score)}`}
                          style={{ width: `${Math.min(100, Math.max(0, m.match_score))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {m.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {m.skills.map((s) => (
                        <span
                          key={s}
                          className={`px-2 py-0.5 rounded-md text-xs ${
                            wantedSkills.has(s.toLowerCase())
                              ? 'bg-emerald-600/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {m.explanations?.length > 0 && (
                    <ul className="text-xs text-slate-400 space-y-1 border-t border-slate-800 pt-3">
                      {m.explanations.slice(0, 5).map((ex, i) => {
                        const text =
                          typeof ex === 'string'
                            ? ex
                            : `${ex.status === 'match' ? '✓' : ex.status === 'missing' ? '✗' : '•'} ${ex.label} — ${ex.detail}`
                        return <li key={i}>{text}</li>
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}