import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  Award,
  FolderKanban,
  StickyNote,
  Clock,
  Download,
  Eye,
  Bot,
  UserCog,
  Pencil,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

const API_BASE = import.meta.env.VITE_API_URL || 'https://resume-management-backend-docker.onrender.com'

interface Contact {
  email: string | null
  phone: string | null
  alternate_phone: string | null
}

interface Skill {
  skill: string
  category: string | null
}

interface Experience {
  company: string
  role: string
  start_date: string | null
  end_date: string | null
  duration_months: number | null
  responsibilities: string | null
}

interface Education {
  qualification: string | null
  specialization: string | null
  institution: string | null
  graduation_year: number | null
  is_highest: boolean
}

interface Internship {
  organization: string
  role: string
  duration_months: number | null
}

interface ProjectItem {
  project_name: string
  description: string | null
  technologies: string | null
}

interface Certification {
  name: string
  issuer: string | null
}

interface Note {
  id: number
  note: string
  created_at: string
  author_name: string | null
}

interface StatusHistoryItem {
  old_status: string | null
  new_status: string
  note: string | null
  created_at: string
  changed_by_name?: string | null
}

interface CandidateDetail {
  id: number
  candidate_id: string
  name: string
  location: string | null
  current_role: string | null
  current_company: string | null
  employment_status: string | null
  total_experience_months: number
  notice_period: string | null
  status: string
  needs_review: boolean
  custom_role: string | null
  custom_location: string | null
  custom_specifications: string | null
  source: string | null
  contacts: Contact[]
  skills: Skill[]
  experiences: Experience[]
  education: Education[]
  internships: Internship[]
  projects: ProjectItem[]
  certifications: Certification[]
  notes: Note[]
  status_history: StatusHistoryItem[]
}

const STATUS_OPTIONS = [
  'new',
  'under_review',
  'contacted',
  'shortlisted',
  'interview_scheduled',
  'interviewed',
  'selected',
  'rejected',
  'on_hold',
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

function monthsToYears(months: number) {
  if (!months) return '0 months'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} month${m !== 1 ? 's' : ''}`
  if (m === 0) return `${y} year${y !== 1 ? 's' : ''}`
  return `${y} year${y !== 1 ? 's' : ''} ${m} month${m !== 1 ? 's' : ''}`
}

function formatStatus(s: string) {
  return s.replace(/_/g, ' ')
}

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Status
  const [newStatus, setNewStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Note
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Resume
  const [resumeLoading, setResumeLoading] = useState(false)

  // Recruiter custom fields (edit mode)
  const [editing, setEditing] = useState(false)
  const [editRole, setEditRole] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editSpecs, setEditSpecs] = useState('')
  const [savingFields, setSavingFields] = useState(false)

  const loadCandidate = (showSpinner = false) => {
    if (!id) return
    if (showSpinner) setLoading(true)
    api
      .get<CandidateDetail>(`/api/candidates/${id}`)
      .then((data) => {
        setCandidate(data)
        setNewStatus(data.status)
        setError('')
      })
      .catch(() => setError('Could not load this candidate'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadCandidate(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const startEditing = () => {
    if (!candidate) return
    setEditRole(candidate.custom_role || '')
    setEditLocation(candidate.custom_location || '')
    setEditSpecs(candidate.custom_specifications || '')
    setEditing(true)
  }

  const handleSaveFields = async () => {
    if (!candidate) return
    setSavingFields(true)
    try {
      const updated = await api.post<CandidateDetail>(
        `/api/candidates/${candidate.id}/recruiter-fields`,
        {
          custom_role: editRole,
          custom_location: editLocation,
          custom_specifications: editSpecs,
        }
      )
      setCandidate(updated)
      setEditing(false)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to save recruiter fields')
    } finally {
      setSavingFields(false)
    }
  }

  const handleStatusUpdate = async () => {
    if (!candidate || newStatus === candidate.status) return
    setUpdatingStatus(true)
    try {
      await api.post(`/api/candidates/${candidate.id}/status`, {
        status: newStatus,
        note: statusNote || null,
      })
      setStatusNote('')
      loadCandidate()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleAddNote = async () => {
    if (!candidate || !noteText.trim()) return
    setAddingNote(true)
    try {
      await api.post(`/api/candidates/${candidate.id}/notes`, {
        note: noteText.trim(),
      })
      setNoteText('')
      loadCandidate()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to add note')
    } finally {
      setAddingNote(false)
    }
  }

  const handleResume = async (action: 'view' | 'download') => {
    if (!candidate) return
    setResumeLoading(true)
    try {
      if (action === 'view') {
        const data = await api.get<{ url: string; filename: string }>(
          `/api/candidates/${candidate.id}/resume-url`
        )
        window.open(data.url, '_blank')
      } else {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE}/api/candidates/${candidate.id}/resume-download`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Download failed')
        }

        const blob = await res.blob()
        const disposition = res.headers.get('Content-Disposition') || ''
        let filename = 'resume.pdf'
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Resume action failed')
    } finally {
      setResumeLoading(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm">Loading candidate…</p>
  }

  if (error || !candidate) {
    return (
      <div>
        <button
          onClick={() => navigate('/candidates')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Candidates
        </button>
        <p className="text-red-400 text-sm">{error || 'Candidate not found'}</p>
      </div>
    )
  }

  const contact = candidate.contacts?.[0]
  const displayRole = candidate.custom_role || candidate.current_role
  const displayLocation = candidate.custom_location || candidate.location
  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500'

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => navigate('/candidates')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Candidates
      </button>

      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">{candidate.candidate_id}</p>
            <h1 className="text-2xl font-bold text-white">{candidate.name}</h1>
            <p className="text-slate-400 mt-1">
              {displayRole || 'Role not specified'}
              {candidate.current_company ? ` at ${candidate.current_company}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                statusStyles[candidate.status] || 'bg-slate-800 text-slate-300'
              }`}
            >
              {formatStatus(candidate.status)}
            </span>
            {candidate.needs_review && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-600/20 text-amber-400">
                Needs Review
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-400">
          {contact?.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> {contact.email}
            </span>
          )}
          {contact?.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-4 h-4" /> {contact.phone}
            </span>
          )}
          {displayLocation && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> {displayLocation}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> {monthsToYears(candidate.total_experience_months)} experience
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-slate-800">
          <button
            onClick={() => handleResume('view')}
            disabled={resumeLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
          >
            <Eye className="w-4 h-4" />
            {resumeLoading ? 'Loading…' : 'View Resume'}
          </button>

          <button
            onClick={() => handleResume('download')}
            disabled={resumeLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
          >
            <Download className="w-4 h-4" />
            Download Resume
          </button>
        </div>
      </div>

      {/* AI Extracted vs Recruiter Custom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-white">AI Extracted</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Read from the resume. Not changed by recruiter fields.</p>
          <div className="space-y-3">
            <Field label="Role" value={candidate.current_role} />
            <Field label="Company" value={candidate.current_company} />
            <Field label="Location" value={candidate.location} />
            <Field label="Experience" value={monthsToYears(candidate.total_experience_months)} />
            <Field label="Notice period" value={candidate.notice_period} />
            <Field
              label="Employment status"
              value={candidate.employment_status ? formatStatus(candidate.employment_status) : null}
            />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-white">Recruiter Custom</h2>
            </div>
            {!editing && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-4">Added by you. Shown first in lists and charts.</p>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Custom role</label>
                <input
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Backend Developer"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Custom location</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  maxLength={150}
                  placeholder="e.g. Chennai"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Specifications</label>
                <textarea
                  value={editSpecs}
                  onChange={(e) => setEditSpecs(e.target.value)}
                  rows={3}
                  placeholder="e.g. Immediate joiner preferred"
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveFields}
                  disabled={savingFields}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl text-sm font-medium transition"
                >
                  {savingFields ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={savingFields}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Custom role" value={candidate.custom_role} />
              <Field label="Custom location" value={candidate.custom_location} />
              <Field label="Specifications" value={candidate.custom_specifications} />
              <Field
                label="Source"
                value={candidate.source ? formatStatus(candidate.source) : null}
              />
            </div>
          )}
        </div>
      </div>

      {/* Change Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" /> Change Status
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatStatus(s)}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Optional note for this status change"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={handleStatusUpdate}
            disabled={updatingStatus || newStatus === candidate.status}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition"
          >
            {updatingStatus ? 'Updating…' : 'Update Status'}
          </button>
        </div>
      </div>

      {/* Skills */}
      {candidate.skills.length > 0 && (
        <Section title="Skills" icon={<Award className="w-4 h-4 text-blue-400" />}>
          <div className="flex flex-wrap gap-2">
            {candidate.skills.map((s, i) => (
              <span
                key={`${s.skill}-${i}`}
                className="px-3 py-1 bg-slate-800 rounded-lg text-sm text-slate-300"
              >
                {s.skill}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Experience */}
      {candidate.experiences.length > 0 && (
        <Section title="Experience" icon={<Briefcase className="w-4 h-4 text-blue-400" />}>
          <div className="space-y-4">
            {candidate.experiences.map((e, i) => (
              <div key={i} className="border-l-2 border-slate-700 pl-4">
                <p className="font-medium text-white">
                  {e.role} · {e.company}
                </p>
                <p className="text-xs text-slate-500">{monthsToYears(e.duration_months || 0)}</p>
                {e.responsibilities && (
                  <p className="text-sm text-slate-400 mt-1">{e.responsibilities}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Education */}
      {candidate.education.length > 0 && (
        <Section title="Education" icon={<GraduationCap className="w-4 h-4 text-blue-400" />}>
          <div className="space-y-3">
            {candidate.education.map((ed, i) => (
              <div key={i}>
                <p className="font-medium text-white">
                  {ed.qualification}
                  {ed.specialization ? ` — ${ed.specialization}` : ''}
                </p>
                <p className="text-sm text-slate-400">
                  {ed.institution} {ed.graduation_year ? `(${ed.graduation_year})` : ''}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Projects */}
      {candidate.projects.length > 0 && (
        <Section title="Projects" icon={<FolderKanban className="w-4 h-4 text-blue-400" />}>
          <div className="space-y-3">
            {candidate.projects.map((p, i) => (
              <div key={i}>
                <p className="font-medium text-white">{p.project_name}</p>
                {p.description && <p className="text-sm text-slate-400">{p.description}</p>}
                {p.technologies && <p className="text-xs text-slate-500 mt-1">{p.technologies}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Certifications */}
      {candidate.certifications.length > 0 && (
        <Section title="Certifications" icon={<Award className="w-4 h-4 text-blue-400" />}>
          <div className="space-y-2">
            {candidate.certifications.map((c, i) => (
              <p key={i} className="text-sm text-slate-300">
                {c.name}
                {c.issuer ? ` — ${c.issuer}` : ''}
              </p>
            ))}
          </div>
        </Section>
      )}

      {/* Add Note */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-blue-400" /> Add Note
        </h2>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write a note about this candidate..."
          rows={3}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none mb-3"
        />

        <button
          onClick={handleAddNote}
          disabled={addingNote || !noteText.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition"
        >
          {addingNote ? 'Saving…' : 'Save Note'}
        </button>
      </div>

      {/* Recruiter Notes History */}
      <Section title="Recruiter Notes" icon={<StickyNote className="w-4 h-4 text-blue-400" />}>
        {candidate.notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {candidate.notes.map((n) => (
              <div key={n.id} className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {n.author_name ? `${n.author_name} · ` : ''}
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Status History */}
      {candidate.status_history.length > 0 && (
        <Section title="Status History" icon={<Clock className="w-4 h-4 text-blue-400" />}>
          <div className="space-y-2">
            {candidate.status_history.map((h, i) => (
              <p key={i} className="text-sm text-slate-400">
                {h.old_status
                  ? `${formatStatus(h.old_status)} → ${formatStatus(h.new_status)}`
                  : formatStatus(h.new_status)}
                <span className="text-xs text-slate-600">
                  {' '}
                  · {new Date(h.created_at).toLocaleDateString()}
                  {h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                </span>
                {h.note && <span className="block text-xs text-slate-500 mt-0.5">{h.note}</span>}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm capitalize-first ${value ? 'text-slate-200' : 'text-slate-600'}`}>
        {value || 'Not set'}
      </p>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}