import { useEffect, useState, useRef } from 'react'
import { Search, Download, Upload, UserPlus, RefreshCw, ChevronRight, X, ShieldOff, ShieldCheck, Users, GraduationCap, Briefcase } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getCandidates, getCandidate, addCandidate, bulkUploadCandidates, downloadCandidateTemplate, allowReattempt, exportCandidates, unblockCandidate, getFraudLog } from '../services/api'

const STATUS_BADGE = { submitted: 'badge-submitted', started: 'badge-started', suspended: 'badge-suspended', flagged: 'badge-flagged' }
const EVENT_LABELS = { face_not_detected: 'No face', multiple_faces: 'Multiple faces / Impersonator', tab_switch: 'Tab switch', fullscreen_exit: 'Fullscreen exit', copy_attempt: 'Copy attempt', suspicious_audio: 'Suspicious audio' }

const BLANK_EXTERNAL = { candidate_type: 'external', name: '', phone: '', email: '', degree: '', year_of_study: '', college_name: '', max_attempts: 1 }
const BLANK_INTERNAL = { candidate_type: 'internal', name: '', phone: '', email: '', password: '', department: '', employee_id: '', max_attempts: 1 }

export default function CandidateList() {
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterBlocked, setFilterBlocked] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [fraudLog, setFraudLog] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(BLANK_EXTERNAL)
  const [addLoading, setAddLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef()

  useEffect(() => { load() }, [search, filterType, filterBlocked])

  async function load() {
    try {
      const params = { search: search || undefined, candidate_type: filterType || undefined, is_blocked: filterBlocked || undefined }
      const r = await getCandidates(params)
      setCandidates(r.data)
    } catch { toast.error('Failed to load candidates') }
  }

  async function openDetail(c) {
    setSelected(c); setDetail(null); setFraudLog([])
    try {
      const r = await getCandidate(c.id)
      setDetail(r.data)
      const logs = []
      for (const s of r.data.sessions) {
        try { const lr = await getFraudLog(s.id); logs.push(...lr.data) } catch {}
      }
      setFraudLog(logs)
    } catch { toast.error('Failed to load details') }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setAddLoading(true)
    try {
      await addCandidate(addForm)
      toast.success('Candidate added')
      setShowAdd(false)
      setAddForm(addForm.candidate_type === 'internal' ? BLANK_INTERNAL : BLANK_EXTERNAL)
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add') }
    finally { setAddLoading(false) }
  }

  async function handleBulkUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await bulkUploadCandidates(formData)
      setUploadResult(r.data)
      toast.success(`Added ${r.data.added} candidate(s)`)
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed') }
    e.target.value = ''
  }

  async function handleDownloadTemplate() {
    try {
      const r = await downloadCandidateTemplate()
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'candidate_template.csv'; a.click()
    } catch { toast.error('Download failed') }
  }

  async function handleReattempt(id) {
    try { await allowReattempt(id); toast.success('Reattempt allowed'); load(); if (detail) { const r = await getCandidate(id); setDetail(r.data) } }
    catch { toast.error('Failed') }
  }

  async function handleUnblock(id) {
    try {
      const r = await unblockCandidate(id)
      toast.success(r.data.session_reopened ? 'Unblocked and session reopened' : 'Candidate unblocked')
      load(); if (selected?.id === id) { const r2 = await getCandidate(id); setDetail(r2.data) }
    } catch { toast.error('Unblock failed') }
  }

  async function handleExport() {
    try {
      const r = await exportCandidates()
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'candidates.csv'; a.click()
    } catch { toast.error('Export failed') }
  }

  const typeIcon = (t) => t === 'internal' ? <Briefcase className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />

  return (
    <AdminLayout title="Candidates">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input-field pl-9" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input-field w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="external">External (Student)</option>
            <option value="internal">Internal (Employee)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={filterBlocked} onChange={(e) => setFilterBlocked(e.target.checked)} className="rounded border-gray-300 text-red-500" />
            Blocked only
          </label>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => { setShowAdd(true); setAddForm(BLANK_EXTERNAL) }} className="btn-primary flex items-center gap-2 text-sm">
              <UserPlus className="w-4 h-4" /> Add Candidate
            </button>
            <button onClick={() => fileRef.current.click()} className="btn-secondary flex items-center gap-2 text-sm">
              <Upload className="w-4 h-4" /> Bulk Upload
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
            <button onClick={handleDownloadTemplate} className="btn-secondary flex items-center gap-2 text-sm" title="Download CSV template">
              <Download className="w-4 h-4" /> Template
            </button>
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between text-sm">
            <span className="text-green-700">
              Added <strong>{uploadResult.added}</strong> candidates, skipped <strong>{uploadResult.skipped}</strong> duplicates
              {uploadResult.errors.length > 0 && `, ${uploadResult.errors.length} errors`}
            </span>
            <button onClick={() => setUploadResult(null)}><X className="w-4 h-4 text-green-500" /></button>
          </div>
        )}

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Email', 'Type', 'College / Dept', 'Attempts', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {candidates.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No candidates found</td></tr>
              )}
              {candidates.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50 ${c.is_blocked ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${c.candidate_type === 'internal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {typeIcon(c.candidate_type)} {c.candidate_type === 'internal' ? 'Employee' : 'Student'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {c.candidate_type === 'internal' ? (c.department || '—') : (c.college_name || '—')}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.attempt_count}/{c.max_attempts}</td>
                  <td className="px-4 py-3">
                    {c.is_blocked
                      ? <span className="badge-suspended">Blocked</span>
                      : c.attempt_count > 0 ? <span className="badge-submitted">Attempted</span>
                      : <span className="badge-invited">Pending</span>}
                  </td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => openDetail(c)} title="View detail" className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    {c.is_blocked
                      ? <button onClick={() => handleUnblock(c.id)} title="Unblock" className="p-1.5 text-gray-400 hover:text-green-600 rounded"><ShieldCheck className="w-4 h-4" /></button>
                      : <button onClick={() => handleReattempt(c.id)} title="Allow reattempt" className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><RefreshCw className="w-4 h-4" /></button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Candidate Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold">Add Candidate</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {/* Type switcher */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
              {[['external', 'Student (External)', GraduationCap], ['internal', 'Employee (Internal)', Briefcase]].map(([val, label, Icon]) => (
                <button key={val} type="button"
                  onClick={() => { setAddForm(val === 'internal' ? BLANK_INTERNAL : BLANK_EXTERNAL) }}
                  className={`flex items-center gap-2 flex-1 justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${addForm.candidate_type === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input className="input-field" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input className="input-field" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" className="input-field" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input type="number" min={1} className="input-field" value={addForm.max_attempts} onChange={(e) => setAddForm({ ...addForm, max_attempts: +e.target.value })} />
                </div>
              </div>

              {addForm.candidate_type === 'external' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Degree / Course</label>
                    <input className="input-field" placeholder="B.E. Civil" value={addForm.degree} onChange={(e) => setAddForm({ ...addForm, degree: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study</label>
                    <select className="input-field" value={addForm.year_of_study} onChange={(e) => setAddForm({ ...addForm, year_of_study: e.target.value })}>
                      <option value="">Select…</option>
                      {['1st Year','2nd Year','3rd Year','4th Year','Final Year','Passed Out'].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">College Name</label>
                    <input className="input-field" placeholder="ABC Engineering College" value={addForm.college_name} onChange={(e) => setAddForm({ ...addForm, college_name: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                    <input type="password" className="input-field" placeholder="Login password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                    <input className="input-field" placeholder="EMP001" value={addForm.employee_id} onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <input className="input-field" placeholder="Engineering / HR / Sales…" value={addForm.department} onChange={(e) => setAddForm({ ...addForm, department: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={addLoading} className="btn-primary flex-1">
                  {addLoading ? 'Adding…' : 'Add Candidate'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                After adding, go to Invite Manager to send them a test link.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-8">
            <div className="flex justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold">{selected.name}</h3>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${selected.candidate_type === 'internal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {typeIcon(selected.candidate_type)} {selected.candidate_type === 'internal' ? 'Employee' : 'Student'}
                  </span>
                </div>
                {selected.is_blocked && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    <ShieldOff className="w-3 h-3" /> BLOCKED
                  </span>
                )}
              </div>
              <button onClick={() => { setSelected(null); setDetail(null); setFraudLog([]) }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {detail && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ['Email', detail.candidate.email],
                    ['Phone', detail.candidate.phone],
                    ...(detail.candidate.candidate_type === 'internal'
                      ? [['Department', detail.candidate.department || '—'], ['Employee ID', detail.candidate.employee_id || '—']]
                      : [['Degree', detail.candidate.degree || '—'], ['Year', detail.candidate.year_of_study || '—'], ['College', detail.candidate.college_name || '—']]),
                    ['Registered', new Date(detail.candidate.registered_at).toLocaleDateString()],
                  ].map(([k, v]) => (
                    <div key={k}><p className="text-gray-400 text-xs">{k}</p><p className="font-medium text-gray-900">{v}</p></div>
                  ))}
                </div>

                {detail.candidate.block_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-red-700 mb-1">Block Reason</p>
                    <p className="text-sm text-red-600">{detail.candidate.block_reason}</p>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Test Sessions</h4>
                  {detail.sessions.length === 0 && <p className="text-gray-400 text-sm">No sessions yet</p>}
                  {detail.sessions.map((s) => (
                    <div key={s.id} className="border border-gray-100 rounded-lg p-4 mb-3">
                      <div className="flex justify-between mb-2">
                        <span className={STATUS_BADGE[s.status] || 'badge-invited'}>{s.status}</span>
                        <span className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString()}</span>
                      </div>
                      {s.status === 'submitted' && <p className="text-sm">Score: <strong>{s.score}/{s.total_marks}</strong> ({s.percentage}%)</p>}
                      <p className="text-xs text-gray-500 mt-1">Warnings: {s.warning_count} | Tab switches: {s.tab_switch_count}</p>
                    </div>
                  ))}
                </div>

                {fraudLog.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">Proctoring Violations</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {fraudLog.map((l) => (
                        <div key={l.id} className={`flex items-start gap-3 text-xs rounded-lg px-3 py-2 border ${l.auto_action_taken === 'block' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${l.auto_action_taken === 'block' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                          <div className="flex-1">
                            <span className="font-medium">{EVENT_LABELS[l.event_type] || l.event_type}</span>
                            {l.block_reason && <span className="ml-2 text-red-600">— {l.block_reason}</span>}
                            <span className="ml-2 text-gray-400">{new Date(l.detected_at).toLocaleTimeString()}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded font-medium ${l.auto_action_taken === 'block' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{l.auto_action_taken}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  {detail.candidate.is_blocked
                    ? <button onClick={() => handleUnblock(selected.id)} className="btn-primary flex-1 flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Unblock</button>
                    : <button onClick={() => handleReattempt(selected.id)} className="btn-primary flex-1">Allow Reattempt</button>
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
