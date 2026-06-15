import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ClipboardList, BarChart2, Eye, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getDashboardStats, getAdminSessions, updateSettings } from '../services/api'
import { formatIST } from '../utils/dateFormat'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-5">
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

const STATUS_BADGE = {
  submitted: 'badge-submitted',
  started: 'badge-started',
  suspended: 'badge-suspended',
  flagged: 'badge-flagged',
  invited: 'badge-invited',
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ time_limit_minutes: 60, max_attempts: 1, questions_per_test: 30 })

  useEffect(() => {
    getDashboardStats().then((r) => setStats(r.data)).catch(() => {})
    getAdminSessions().then((r) => setSessions(r.data.slice(0, 10))).catch(() => {})
  }, [])

  async function handleSaveSettings(e) {
    e.preventDefault()
    try {
      await updateSettings(settings)
      toast.success('Settings saved')
      setShowSettings(false)
    } catch {
      toast.error('Failed to save settings')
    }
  }

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={Users} label="Total Candidates" value={stats?.total_candidates ?? '—'} color="bg-blue-500" />
          <StatCard icon={ClipboardList} label="Tests Today" value={stats?.tests_today ?? '—'} color="bg-green-500" />
          <StatCard icon={BarChart2} label="Average Score" value={stats ? `${stats.average_score}%` : '—'} color="bg-purple-500" />
          <StatCard icon={Eye} label="Pending Reviews" value={stats?.pending_reviews ?? '—'} color="bg-orange-500" />
        </div>

        {/* Quick actions */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center gap-2">
            <Settings className="w-4 h-4" /> Global Settings
          </button>
          <Link to="/admin/invite" className="btn-primary flex items-center gap-2">
            Send Invites
          </Link>
        </div>

        {/* Recent sessions */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Recent Test Sessions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Candidate', 'Test Set', 'Status', 'Score', 'Warnings', 'Started At'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No sessions yet</td></tr>
                )}
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{s.candidate_name || '—'}</p>
                      <p className="text-gray-400 text-xs">{s.candidate_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{s.test_set_name || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={STATUS_BADGE[s.status] || 'badge-invited'}>{s.status}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {s.status === 'submitted' ? `${s.score}/${s.total_marks} (${s.percentage}%)` : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{s.warning_count}</td>
                    <td className="px-6 py-4 text-gray-500">{formatIST(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-semibold mb-6">Global Settings</h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (minutes)</label>
                <input type="number" className="input-field" value={settings.time_limit_minutes}
                  onChange={(e) => setSettings({ ...settings, time_limit_minutes: +e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                <input type="number" className="input-field" value={settings.max_attempts}
                  onChange={(e) => setSettings({ ...settings, max_attempts: +e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Questions Per Test</label>
                <input type="number" className="input-field" value={settings.questions_per_test}
                  onChange={(e) => setSettings({ ...settings, questions_per_test: +e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Save Settings</button>
                <button type="button" onClick={() => setShowSettings(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
