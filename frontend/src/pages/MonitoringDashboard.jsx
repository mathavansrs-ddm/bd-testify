import { useEffect, useState, useRef } from 'react'
import { RefreshCw, AlertTriangle, Eye, X, CheckCircle, StopCircle, ShieldOff, Activity, Clock, Camera, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getActiveSessions, getAdminSession, markSessionReviewed, suspendTest, getFraudLog, deleteSession } from '../services/api'
import { formatIST, formatISTTime } from '../utils/dateFormat'
import { useAdminRole } from '../hooks/useAdminRole'

const EVENT_LABELS = {
  face_not_detected: 'No face detected',
  multiple_faces:    'Multiple faces / Impersonator',
  tab_switch:        'Tab switch',
  fullscreen_exit:   'Fullscreen exit',
  copy_attempt:      'Copy attempt',
  suspicious_audio:  'Suspicious audio',
}

const MAX_WARNINGS = 5

export default function MonitoringDashboard() {
  const { isSuperAdmin } = useAdminRole()
  const [tab, setTab] = useState('ongoing')
  const [cameraRefresh, setCameraRefresh] = useState(0)
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [fraudLog, setFraudLog] = useState([])
  const liveTimerRef = useRef(null)

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (tab === 'ongoing' || tab === 'cameras') load()
    }, 10000)
    return () => clearInterval(id)
  }, [tab])

  // Auto-refresh selected session snapshot every 5s while drawer is open on a live session
  useEffect(() => {
    clearInterval(liveTimerRef.current)
    if (selected?.status === 'started') {
      liveTimerRef.current = setInterval(async () => {
        try {
          const r = await getActiveSessions(null)
          const fresh = r.data.find(s => s.session_id === selected.session_id)
          if (fresh) setSelected(fresh)
        } catch {}
      }, 5000)
    }
    return () => clearInterval(liveTimerRef.current)
  }, [selected?.session_id, selected?.status])

  async function load() {
    try {
      const r = await getActiveSessions(tab === 'completed' ? 'completed' : null)
      setSessions(r.data)
    } catch {}
  }

  async function openDetail(session) {
    setSelected(session)
    setDetail(null)
    setFraudLog([])
    try {
      const [dr, fr] = await Promise.all([
        getAdminSession(session.session_id),
        getFraudLog(session.session_id),
      ])
      setDetail(dr.data)
      setFraudLog(fr.data || [])
    } catch { toast.error('Failed to load session detail') }
  }

  async function handleReview() {
    try {
      await markSessionReviewed(selected.session_id)
      toast.success('Marked as reviewed')
    } catch { toast.error('Failed') }
  }

  async function handleSuspend() {
    if (!confirm('Suspend this test session?')) return
    try {
      await suspendTest(selected.session_id)
      toast.success('Session suspended')
      setSelected(null); setDetail(null)
      load()
    } catch { toast.error('Failed') }
  }

  async function handleDelete(sessionId, e) {
    e.stopPropagation()
    if (!confirm('Delete this session record? This cannot be undone.')) return
    try {
      await deleteSession(sessionId)
      toast.success('Session deleted')
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
      if (selected?.session_id === sessionId) { setSelected(null); setDetail(null) }
    } catch { toast.error('Failed to delete') }
  }

  const warningColor = (count) => {
    if (count >= MAX_WARNINGS) return 'text-red-600'
    if (count >= 3) return 'text-orange-500'
    return 'text-gray-900'
  }

  return (
    <AdminLayout title="Monitoring">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button onClick={() => { setTab('ongoing'); setSelected(null) }}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === 'ongoing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Activity className="w-4 h-4 text-green-500" /> Ongoing
              {tab === 'ongoing' && sessions.length > 0 && (
                <span className="bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {sessions.length}
                </span>
              )}
            </button>
            <button onClick={() => { setTab('completed'); setSelected(null) }}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === 'completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Clock className="w-4 h-4 text-blue-500" /> Completed
            </button>
            <button onClick={() => { setTab('cameras'); setSelected(null) }}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === 'cameras' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Camera className="w-4 h-4 text-purple-500" /> Camera View
            </button>
          </div>
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {sessions.length === 0 && tab !== 'cameras' && (
          <div className="text-center py-20 text-gray-400">
            <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{tab === 'ongoing' ? 'No active test sessions right now' : 'No completed sessions yet'}</p>
          </div>
        )}

        {/* ── Camera CCTV View ── */}
        {tab === 'cameras' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Live camera snapshots — auto-refreshes every 10s. Candidates upload frames every 5s.</p>
              <button onClick={() => { load(); setCameraRefresh(r => r + 1) }} className="btn-secondary flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            {sessions.filter(s => s.status === 'started').length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No active test sessions right now</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sessions.filter(s => s.status === 'started').map((s) => (
                  <div key={s.session_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Video frame */}
                    <div className="bg-slate-900 aspect-video flex items-center justify-center relative">
                      {s.latest_snapshot ? (
                        <img src={s.latest_snapshot} alt={s.candidate_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-white/40">
                          <Camera className="w-8 h-8 mx-auto mb-1 opacity-40" />
                          <p className="text-xs">Waiting for snapshot…</p>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> LIVE
                      </div>
                      {s.warning_count >= 3 && (
                        <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                          ⚠ {s.warning_count}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <p className="font-semibold text-sm text-gray-900 truncate">{s.candidate_name}</p>
                      <p className="text-xs text-gray-400 truncate">{s.candidate_email}</p>
                      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                        <span>{s.elapsed_minutes}m elapsed</span>
                        <span className={s.warning_count >= 3 ? 'text-red-600 font-bold' : ''}>
                          {s.warning_count}/5 warns
                        </span>
                      </div>
                      {s.snapshot_at && (
                        <p className="text-xs text-gray-300 mt-1">
                          Last frame: {formatISTTime(s.snapshot_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={tab === 'cameras' ? 'hidden' : ''}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions
            .filter(s => tab === 'ongoing' ? s.status === 'started' : true)
            .map((s) => (
            <div key={s.session_id}
              className={`card cursor-pointer hover:shadow-md transition-shadow border-l-4 relative
                ${s.is_blocked || s.status === 'suspended' ? 'border-l-red-500 bg-red-50'
                  : s.warning_count >= 3 ? 'border-l-orange-400'
                  : s.status === 'submitted' ? 'border-l-green-400'
                  : 'border-l-blue-400'}`}
              onClick={() => openDetail(s)}>
              {/* Delete button — superadmin only */}
              {isSuperAdmin && (
                <button
                  onClick={(e) => handleDelete(s.session_id, e)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition z-10"
                  title="Delete session">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex justify-between items-start mb-3 pr-6">
                <div className="flex items-center gap-3">
                  {/* Candidate photo */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                    {s.photo_data
                      ? <img src={s.photo_data} alt={s.candidate_name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-gray-300"><Camera className="w-5 h-5" /></div>
                    }
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{s.candidate_name}</p>
                    <p className="text-xs text-gray-400">{s.candidate_email}</p>
                  </div>
                </div>
                {s.status === 'suspended' ? (
                  <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                    <ShieldOff className="w-3 h-3" /> Suspended
                  </span>
                ) : s.status === 'submitted' ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle className="w-3 h-3" /> Submitted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <p className="font-bold text-gray-900">{s.elapsed_minutes}m</p>
                  <p className="text-gray-400">Elapsed</p>
                </div>
                <div className={`rounded p-2 ${s.warning_count >= 3 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`font-bold ${warningColor(s.warning_count)}`}>{s.warning_count}/{MAX_WARNINGS}</p>
                  <p className="text-gray-400">Warnings</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="font-bold text-gray-900">{s.score ?? '—'}</p>
                  <p className="text-gray-400">Score</p>
                </div>
              </div>
              {s.warning_count >= 3 && s.status === 'started' && (
                <div className="flex items-center gap-1 mt-3 text-xs text-orange-600">
                  <AlertTriangle className="w-3 h-3" /> {s.warning_count}/{MAX_WARNINGS} warnings — review now
                </div>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-semibold leading-tight">{selected.candidate_name}</h3>
                <p className="text-sm text-gray-400">{selected.candidate_email}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${selected.status === 'submitted' ? 'bg-green-100 text-green-700'
                    : selected.status === 'suspended' ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'}`}>
                    {selected.status}
                  </span>
                  <span className={`text-xs font-semibold ${warningColor(selected.warning_count)}`}>
                    {selected.warning_count}/{MAX_WARNINGS} warnings
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  {selected.started_at && (
                    <span>Started: <span className="text-gray-600 font-medium">{formatIST(selected.started_at)}</span></span>
                  )}
                  {selected.submitted_at && (
                    <span>Ended: <span className="text-gray-600 font-medium">{formatIST(selected.submitted_at)}</span></span>
                  )}
                </div>
              </div>
              <button onClick={() => { setSelected(null); setDetail(null); setFraudLog([]) }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Images row — pre-test photo + last snapshot */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Pre-test captured photo */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pre-test Photo</p>
                <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
                  {(detail?.session?.photo_data || selected.photo_data)
                    ? <img src={detail?.session?.photo_data || selected.photo_data} alt="pre-test" className="w-full h-full object-cover" />
                    : <div className="text-center text-white/40">
                        <Camera className="w-8 h-8 mx-auto mb-1 opacity-40" />
                        <p className="text-xs">No photo captured</p>
                      </div>
                  }
                </div>
              </div>

              {/* Last camera snapshot */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {selected.status === 'started' ? 'Live Camera' : 'Last Snapshot'}
                  </p>
                  {selected.snapshot_at && (
                    <span className="text-xs text-gray-400">{formatISTTime(selected.snapshot_at)}</span>
                  )}
                </div>
                <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center relative">
                  {selected.latest_snapshot
                    ? <img src={selected.latest_snapshot} alt="snapshot" className="w-full h-full object-cover" />
                    : <div className="text-center text-white/40">
                        <Camera className="w-8 h-8 mx-auto mb-1 opacity-40" />
                        <p className="text-xs">{selected.status === 'started' ? 'Waiting for first frame…' : 'No snapshot saved'}</p>
                      </div>
                  }
                  {selected.status === 'started' && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> LIVE · 5s
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Violations */}
            <div className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3">Proctoring Violations</h4>
              {fraudLog.length === 0
                ? <p className="text-gray-400 text-sm">No violations detected</p>
                : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {fraudLog.map((l, i) => (
                      <div key={l.id}
                        className={`flex items-start gap-3 text-xs rounded-lg px-3 py-2 border
                          ${l.auto_action_taken === 'block' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <span className="font-bold text-gray-500">#{i + 1}</span>
                        <div className="flex-1">
                          <span className="font-medium">{EVENT_LABELS[l.event_type] || l.event_type}</span>
                          <span className="ml-2 text-gray-400">{formatISTTime(l.detected_at)}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded font-medium
                          ${l.auto_action_taken === 'block' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {l.auto_action_taken}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {detail && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">All Events Timeline</h4>
                  {detail.cheating_logs.length === 0 && <p className="text-gray-400 text-sm">No events logged</p>}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {detail.cheating_logs.map((log, i) => (
                      <div key={log.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
                        <span className="text-xs text-gray-400 w-6">#{i+1}</span>
                        <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                        <span className="font-medium text-gray-700">{EVENT_LABELS[log.event_type] || log.event_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-auto
                          ${log.auto_action_taken === 'block' ? 'bg-red-100 text-red-700'
                          : log.auto_action_taken === 'suspend' ? 'bg-orange-100 text-orange-700'
                          : 'bg-yellow-100 text-yellow-700'}`}>
                          {log.auto_action_taken}
                        </span>
                        <span className="text-gray-400 text-xs">{formatISTTime(log.detected_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Answer Review</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {detail.answers.map((a, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${a.is_correct ? 'bg-green-50' : 'bg-red-50'}`}>
                        <span className={`font-bold ${a.is_correct ? 'text-green-600' : 'text-red-600'}`}>{a.is_correct ? '✓' : '✗'}</span>
                        <div className="flex-1">
                          <p className="text-gray-800">{a.question_text}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Selected: <strong>{a.selected_option?.toUpperCase()}</strong> | Correct: <strong>{a.correct_answer?.toUpperCase()}</strong>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.status === 'started' && (
                  <div className="flex gap-3">
                    <button onClick={handleReview} className="btn-primary flex-1 flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Mark Reviewed
                    </button>
                    <button onClick={handleSuspend} className="btn-danger flex-1 flex items-center justify-center gap-2">
                      <StopCircle className="w-4 h-4" /> Suspend Test
                    </button>
                  </div>
                )}
                {isSuperAdmin && <button onClick={(e) => handleDelete(selected.session_id, e)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition mt-2">
                  <Trash2 className="w-4 h-4" /> Delete Session Record
                </button>}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
