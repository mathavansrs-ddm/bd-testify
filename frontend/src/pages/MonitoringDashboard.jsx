import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, Eye, X, CheckCircle, StopCircle, ShieldOff } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getActiveSessions, getAdminSession, markSessionReviewed, suspendTest, getFraudLog } from '../services/api'

const EVENT_LABELS = {
  face_not_detected: 'No face detected',
  multiple_faces:    'Multiple faces / Impersonator',
  tab_switch:        'Tab switch',
  fullscreen_exit:   'Fullscreen exit',
  copy_attempt:      'Copy attempt',
  suspicious_audio:  'Suspicious audio',
}

export default function MonitoringDashboard() {
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [fraudLog, setFraudLog] = useState([])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  async function load() {
    try { const r = await getActiveSessions(); setSessions(r.data) } catch {}
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

  return (
    <AdminLayout title="Live Monitoring">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{sessions.length} active session{sessions.length !== 1 ? 's' : ''} — auto-refreshes every 10s</p>
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {sessions.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No active test sessions right now</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <div key={s.session_id}
              className={`card cursor-pointer hover:shadow-md transition-shadow border-l-4
                ${s.is_blocked ? 'border-l-red-500 bg-red-50' : s.warning_count > 2 ? 'border-l-orange-400' : 'border-l-blue-400'}`}
              onClick={() => openDetail(s)}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{s.candidate_name}</p>
                  <p className="text-xs text-gray-400">{s.candidate_email}</p>
                </div>
                {s.is_blocked ? (
                  <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                    <ShieldOff className="w-3 h-3" /> Blocked
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
                <div className={`rounded p-2 ${s.warning_count > 2 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`font-bold ${s.warning_count > 2 ? 'text-red-600' : 'text-gray-900'}`}>{s.warning_count}</p>
                  <p className="text-gray-400">Warnings</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="font-bold text-gray-900">{s.tab_switch_count}</p>
                  <p className="text-gray-400">Tab sw.</p>
                </div>
              </div>
              {s.is_blocked && s.block_reason && (
                <p className="mt-2 text-xs text-red-600 truncate">{s.block_reason}</p>
              )}
              {!s.is_blocked && s.warning_count > 2 && (
                <div className="flex items-center gap-1 mt-3 text-xs text-orange-600">
                  <AlertTriangle className="w-3 h-3" /> High warning count — review now
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-8">
            <div className="flex justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold">{selected.candidate_name}</h3>
                <p className="text-sm text-gray-400">{selected.candidate_email}</p>
                {selected.is_blocked && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    <ShieldOff className="w-3 h-3" /> BLOCKED — {selected.block_reason}
                  </span>
                )}
              </div>
              <button onClick={() => { setSelected(null); setDetail(null); setFraudLog([]) }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Proctoring fraud log */}
            <div className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3">Proctoring Violations</h4>
              {fraudLog.length === 0
                ? <p className="text-gray-400 text-sm">No violations detected</p>
                : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {fraudLog.map((l) => (
                      <div key={l.id}
                        className={`flex items-start gap-3 text-xs rounded-lg px-3 py-2 border
                          ${l.auto_action_taken === 'block' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0
                          ${l.auto_action_taken === 'block' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                        <div className="flex-1">
                          <span className="font-medium">{EVENT_LABELS[l.event_type] || l.event_type}</span>
                          {l.block_reason && <span className="ml-2 text-red-600">— {l.block_reason}</span>}
                          <span className="ml-2 text-gray-400">{new Date(l.detected_at).toLocaleTimeString()}</span>
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
                {/* Cheating log timeline */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">All Events Timeline</h4>
                  {detail.cheating_logs.length === 0 && <p className="text-gray-400 text-sm">No events logged</p>}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {detail.cheating_logs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                        <span className="font-medium text-gray-700">{EVENT_LABELS[log.event_type] || log.event_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full
                          ${log.auto_action_taken === 'block' ? 'bg-red-100 text-red-700'
                          : log.auto_action_taken === 'suspend' ? 'bg-orange-100 text-orange-700'
                          : 'bg-yellow-100 text-yellow-700'}`}>
                          {log.auto_action_taken}
                        </span>
                        <span className="text-gray-400 ml-auto">{new Date(log.detected_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Answer review */}
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

                <div className="flex gap-3">
                  <button onClick={handleReview} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Mark Reviewed
                  </button>
                  <button onClick={handleSuspend} className="btn-danger flex-1 flex items-center justify-center gap-2">
                    <StopCircle className="w-4 h-4" /> Suspend Test
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
