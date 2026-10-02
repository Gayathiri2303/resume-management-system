import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Search, ChevronDown, Filter, Eye
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

interface Requirement {
  id: number
  requirement_id: string
  name: string
  role: string | null
}

interface Match {
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
  matches: Match[]
}

interface CandidateItem {
  id: number
  candidate_id: string
  name: string
  current_role: string | null
  location: string | null
  experience_display: string | null
  notice_period: string | null
  status: string
  needs_review: boolean
  skills: string[]
  primary_email: string | null
  primary_phone: string | null
}

type SearchMode = 'quick' | 'requirement' | 'natural'

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

function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-slate-400'
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<SearchMode>('quick')

  // Quick search filters
  const [keyword, setKeyword] = useState('')
  const [location, setLocation] = useState('')
  const [skill, setSkill] = useState('')
  const [minExp, setMinExp] = useState('')
  const [maxExp, setMaxExp] = useState('')
  const [status, setStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  // Requirement mode
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [selectedReqId, setSelectedReqId] = useState('')
  const [loadingReqs, setLoadingReqs] = useState(true)

  // Natural language
  const [nlQuery, setNlQuery] = useState('')

  // Results
  const [quickResults, setQuickResults] = useState<CandidateItem[]>([])
  const [quickTotal, setQuickTotal] = useState(0)
  const [matchResults, setMatchResults] = useState<MatchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    api
      .get<Requirement[]>('/api/requirements')
      .then(setRequirements)
      .catch(() => setRequirements([]))
      .finally(() => setLoadingReqs(false))
  }, [])

  const activeFilterCount = [
    location.trim() !== '',
    skill.trim() !== '',
    minExp !== '',
    maxExp !== '',
    status !== 'all',
  ].filter(Boolean).length

  const clearFilters = () => {
    setLocation('')
    setSkill('')
    setMinExp('')
    setMaxExp('')
    setStatus('all')
  }

  const runQuickSearch = async () => {
    setSearching(true)
    setError('')
    setHasSearched(true)
    setMatchResults(null)
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('q', keyword.trim())
      if (location.trim()) params.set('location', location.trim())
      if (skill.trim()) params.set('skill', skill.trim())
      if (minExp !== '') params.set('min_experience', String(Number(minExp) * 12))
      if (maxExp !== '') params.set('max_experience', String(Number(maxExp) * 12))
      if (status !== 'all') params.set('status', status)
      params.set('page', '1')
      params.set('page_size', '50')

      const data = await api.get<{ items: CandidateItem[]; total: number }>(
        `/api/candidates?${params}`
      )
      setQuickResults(data.items)
      setQuickTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed')
      setQuickResults([])
    } finally {
      setSearching(false)
    }
  }

  const runRequirementSearch = async () => {
    if (!selectedReqId) return
    setSearching(true)
    setError('')
    setHasSearched(true)
    setQuickResults([])
    try {
      const data = await api.post<MatchResponse>(
        `/api/requirements/${selectedReqId}/find-candidates`
      )
      setMatchResults(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Matching failed')
      setMatchResults(null)
    } finally {
      setSearching(false)
    }
  }

  const runNaturalSearch = async () => {
    if (!nlQuery.trim()) return
    setSearching(true)
    setError('')
    setHasSearched(true)
    setMatchResults(null)
    try {
      // Use keyword search with the full natural language text
      // (Backend AI can be connected later for structured conversion)
      const params = new URLSearchParams()
      params.set('q', nlQuery.trim())
      params.set('page', '1')
      params.set('page_size', '50')

      const data = await api.get<{ items: CandidateItem[]; total: number }>(
        `/api/candidates?${params}`
      )
      setQuickResults(data.items)
      setQuickTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed')
      setQuickResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSearch = () => {
    if (mode === 'quick') runQuickSearch()
    else if (mode === 'requirement') runRequirementSearch()
    else runNaturalSearch()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold">Candidate Search</h1>
        <p className="text-slate-400 mt-1">
          Search by filters, match to a requirement, or use natural language
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'quick' as const, label: 'Quick Search', icon: Search },
          { id: 'requirement' as const, label: 'Match Requirement', icon: Sparkles },
          { id: 'natural' as const, label: 'Natural Language', icon: Sparkles },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setMode(tab.id)
              setHasSearched(false)
              setError('')
              setQuickResults([])
              setMatchResults(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== QUICK SEARCH ========== */}
      {mode === 'quick' && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search name, role, company, skills..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border transition ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-600/15 border-blue-600/40 text-blue-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {showFilters && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Chennai, Bangalore..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Skill</label>
                  <input
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                    placeholder="Python, Sales..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Min Exp (years)</label>
                  <input
                    type="number"
                    min="0"
                    value={minExp}
                    onChange={(e) => setMinExp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Max Exp (years)</label>
                  <input
                    type="number"
                    min="0"
                    value={maxExp}
                    onChange={(e) => setMaxExp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              {activeFilterCount > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
                  <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white">
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== REQUIREMENT MATCH ========== */}
      {mode === 'requirement' && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <select
              value={selectedReqId}
              onChange={(e) => setSelectedReqId(e.target.value)}
              disabled={loadingReqs || requirements.length === 0}
              className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50 disabled:opacity-50"
            >
              <option value="">
                {loadingReqs
                  ? 'Loading requirements…'
                  : requirements.length === 0
                  ? 'No requirements yet — create one first'
                  : 'Select a requirement…'}
              </option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.role ? `(${r.role})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !selectedReqId}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition"
          >
            <Sparkles className="w-4 h-4" />
            {searching ? 'Matching…' : 'Find Candidates'}
          </button>
        </div>
      )}

      {/* ========== NATURAL LANGUAGE ========== */}
      {mode === 'natural' && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder='e.g. "Chennai candidates with 2+ years Python who can join immediately"'
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !nlQuery.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
            >
              <Sparkles className="w-4 h-4" />
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Tip: Mention location, skills, experience, and notice period in one sentence.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mb-6 text-sm text-red-400 bg-red-600/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {/* Empty state */}
      {!hasSearched && !searching && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl text-center py-20 px-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Start searching</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Use Quick Search with filters, match candidates to a requirement, or type a natural language query.
          </p>
        </div>
      )}

      {/* Loading */}
      {searching && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl text-center py-20 px-4">
          <p className="text-slate-400 text-sm">Searching candidates…</p>
        </div>
      )}

      {/* Quick / Natural results */}
      {hasSearched && !searching && (mode === 'quick' || mode === 'natural') && (
        <div>
          <p className="text-sm text-slate-400 mb-4">
            {quickTotal} candidate{quickTotal !== 1 ? 's' : ''} found
          </p>
          {quickResults.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl text-center py-16">
              <p className="text-slate-400 text-sm">No candidates matched your search.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quickResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/candidates/${c.id}`)}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-white">{c.name}</h3>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {c.current_role || '—'}
                        {c.location ? ` · ${c.location}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {c.experience_display || '0 months'}
                        {c.notice_period ? ` · Notice: ${c.notice_period}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize ${
                          statusStyles[c.status] || 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {formatStatus(c.status)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/candidates/${c.id}`)
                        }}
                        className="p-2 hover:bg-slate-800 rounded-lg"
                      >
                        <Eye className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>
                  {c.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {c.skills.slice(0, 6).map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-300">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requirement match results */}
      {hasSearched && !searching && mode === 'requirement' && matchResults && (
        <div>
          <p className="text-sm text-slate-400 mb-4">
            {matchResults.total_matches} match{matchResults.total_matches !== 1 ? 'es' : ''} for{' '}
            <span className="text-white font-medium">{matchResults.requirement_name}</span>
          </p>

          {matchResults.matches.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl text-center py-16">
              <p className="text-slate-400 text-sm">No candidates scored above the match threshold.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matchResults.matches.map((m) => (
                <div
                  key={m.candidate_id}
                  onClick={() => navigate(`/candidates/${m.candidate_id}`)}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-white">{m.name}</h3>
                      <p className="text-sm text-slate-400">
                        {m.role || '—'} · {m.location || 'No location'}
                      </p>
                    </div>
                    <span className={`text-xl font-bold ${scoreColor(m.match_score)}`}>
                      {m.match_score}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-3">
                    {m.experience} experience
                    {m.notice_period ? ` · Notice: ${m.notice_period}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {m.skills.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-300">
                        {s}
                      </span>
                    ))}
                  </div>

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
          )}
        </div>
      )}
    </div>
  )
}