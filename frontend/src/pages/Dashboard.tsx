import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'
import {
  Users, UserPlus, AlertTriangle, Briefcase, Star, Calendar,
  CheckCircle2, Loader2, Search, Upload, ArrowRight
} from 'lucide-react'
import { api } from '../lib/api'

interface Stats {
  total_candidates: number
  new_candidates: number
  needs_review: number
  shortlisted: number
  interviews: number
  selected: number
  requirements: number
  resumes_processing: number
  by_status?: { name: string; value: number }[]
  by_role?: { name: string; value: number }[]
  by_location?: { name: string; value: number }[]
}

const STATUS_COLORS = ['#3B82F6', '#F59E0B', '#06B6D4', '#10B981', '#8B5CF6', '#6366F1', '#22C55E', '#EF4444', '#64748B']
const ROLE_COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6']

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Stats>('/api/candidates/stats/overview')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Total Candidates', value: stats?.total_candidates, color: 'text-blue-400', bg: 'bg-blue-600/10', icon: Users, path: '/candidates' },
    { label: 'New Candidates', value: stats?.new_candidates, color: 'text-emerald-400', bg: 'bg-emerald-600/10', icon: UserPlus, path: '/candidates' },
    { label: 'Needs Review', value: stats?.needs_review, color: 'text-amber-400', bg: 'bg-amber-600/10', icon: AlertTriangle, path: '/candidates' },
    { label: 'Requirements', value: stats?.requirements, color: 'text-purple-400', bg: 'bg-purple-600/10', icon: Briefcase, path: '/requirements' },
    { label: 'Shortlisted', value: stats?.shortlisted, color: 'text-cyan-400', bg: 'bg-cyan-600/10', icon: Star, path: '/candidates' },
    { label: 'Interviews', value: stats?.interviews, color: 'text-orange-400', bg: 'bg-orange-600/10', icon: Calendar, path: '/candidates' },
    { label: 'Selected', value: stats?.selected, color: 'text-green-400', bg: 'bg-green-600/10', icon: CheckCircle2, path: '/candidates' },
    { label: 'Processing', value: stats?.resumes_processing, color: 'text-pink-400', bg: 'bg-pink-600/10', icon: Loader2, path: '/processing' },
  ]

  const byStatus = stats?.by_status?.length ? stats.by_status : []
  const byRole = stats?.by_role?.length ? stats.by_role : []
  const byLocation = stats?.by_location?.length ? stats.by_location : []

  const quickActions = [
    { label: 'Upload Resumes', desc: 'Add new candidates', icon: Upload, path: '/upload', color: 'text-blue-400' },
    { label: 'Search Candidates', desc: 'Quick or AI match', icon: Search, path: '/search', color: 'text-emerald-400' },
    { label: 'New Requirement', desc: 'Create & match', icon: Briefcase, path: '/requirements', color: 'text-purple-400' },
    { label: 'View Processing', desc: 'Track jobs', icon: Loader2, path: '/processing', color: 'text-pink-400' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Overview of your recruitment pipeline</p>
      </div>

      {/* Stat cards - clickable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-8">
        {cards.map((stat) => {
          const Icon = stat.icon
          return (
            <button
              key={stat.label}
              onClick={() => navigate(stat.path)}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition text-left group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{stat.label}</p>
                  <p className={`text-3xl font-bold mt-2 ${stat.color}`}>
                    {loading ? '—' : stat.value ?? 0}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center group-hover:scale-105 transition`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition text-left group"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white group-hover:text-blue-300 transition">{action.label}</p>
                <p className="text-xs text-slate-500">{action.desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition" />
            </button>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status pie */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Candidates by Status</h2>
          <p className="text-sm text-slate-500 mb-4">Distribution across recruitment pipeline</p>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : byStatus.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  stroke="none"
                >
                  {byStatus.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    color: '#e2e8f0',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && byStatus.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {byStatus.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }}
                  />
                  <span className="capitalize">{s.name.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500">({s.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Role bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Candidates by Role</h2>
          <p className="text-sm text-slate-500 mb-4">Top roles in your pool</p>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
          ) : byRole.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No role data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byRole} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={12} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={11}
                  width={100}
                  tick={{ fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    color: '#e2e8f0',
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
                  {byRole.map((_, i) => (
                    <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Location chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Candidates by Location</h2>
        <p className="text-sm text-slate-500 mb-4">Where your candidates are based</p>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
        ) : byLocation.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-slate-500 text-sm">No location data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byLocation} margin={{ left: 0, right: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#64748b"
                fontSize={11}
                angle={-25}
                textAnchor="end"
                interval={0}
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  color: '#e2e8f0',
                }}
              />
              <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]} barSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Welcome / tip strip */}
      <div className="bg-gradient-to-r from-blue-600/10 via-slate-900 to-purple-600/10 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Resume & Recruitment System</h2>
        <p className="text-slate-400 text-sm max-w-2xl">
          {stats?.total_candidates
            ? `You have ${stats.total_candidates} candidates in your pool. Use Search to match against requirements, or upload more resumes to grow the pool.`
            : 'Upload resumes to start building your candidate pool, then create requirements and match candidates with AI.'}
        </p>
      </div>
    </div>
  )
}