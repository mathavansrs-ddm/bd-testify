import { useEffect, useState } from 'react'
import { Plus, X, RotateCcw, Trash2, Activity, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getMasters, createMaster, updateMaster, deleteMaster, resetMasterPassword, getMasterActivity } from '../services/api'
import { formatIST } from '../utils/dateFormat'

const ACTION_LABELS = {
  login: 'Logged in',
  test_set_created: 'Created test set',
  question_created: 'Added question',
  master_created: 'Created master',
  master_updated: 'Updated master',
  master_deleted: 'Deleted master',
  password_reset_sent: 'Sent password reset',
}

export default function Masters() {
  const [masters, setMasters] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [expandedActivity, setExpandedActivity] = useState(null)
  const [activity, setActivity] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await getMasters()
      setMasters(r.data)
    } catch { toast.error('Failed to load masters') }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      await createMaster(form)
      toast.success(`Master account created and welcome email sent to ${form.email}`)
      setShowModal(false)
      setForm({ name: '', email: '', password: '' })
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(m) {
    try {
      await updateMaster(m.id, { is_active: !m.is_active })
      toast.success(m.is_active ? 'Master deactivated' : 'Master activated')
      load()
    } catch { toast.error('Failed to update') }
  }

  async function handleDelete(m) {
    if (!confirm(`Delete master "${m.name || m.email}"? This cannot be undone.`)) return
    try {
      await deleteMaster(m.id)
      toast.success('Master deleted')
      load()
    } catch { toast.error('Failed to delete') }
  }

  async function handleResetPassword(m) {
    if (!confirm(`Send a password reset email to ${m.email}?`)) return
    try {
      const r = await resetMasterPassword(m.id)
      toast.success(r.data.message)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send reset email')
    }
  }

  async function toggleActivity(m) {
    if (expandedActivity === m.id) {
      setExpandedActivity(null)
      return
    }
    setExpandedActivity(m.id)
    if (!activity[m.id]) {
      try {
        const r = await getMasterActivity(m.id)
        setActivity(prev => ({ ...prev, [m.id]: r.data }))
      } catch { toast.error('Failed to load activity') }
    }
  }

  return (
    <AdminLayout title="Masters">
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Masters can create tests, send invites, and monitor candidates — but cannot delete anything.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Master
          </button>
        </div>

        {masters.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="font-medium">No masters yet</p>
            <p className="text-sm mt-1">Add master accounts to delegate test management.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {masters.map(m => (
              <div key={m.id} className="card p-0 overflow-hidden">
                <div className="flex items-center gap-4 p-5">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-navy-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {(m.name || m.email)[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{m.name || '—'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{m.email}</p>
                    <p className="text-xs text-gray-300 mt-0.5">Added {formatIST(m.created_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleActivity(m)}
                      title="View activity"
                      className={`p-2 rounded-lg transition text-sm flex items-center gap-1 ${
                        expandedActivity === m.id
                          ? 'bg-navy-900 text-white'
                          : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
                      }`}>
                      <Activity className="w-4 h-4" />
                      {expandedActivity === m.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <button onClick={() => handleResetPassword(m)}
                      title="Send password reset email"
                      className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActive(m)}
                      title={m.is_active ? 'Deactivate' : 'Activate'}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                      {m.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-600" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => handleDelete(m)}
                      title="Delete master"
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Activity panel */}
                {expandedActivity === m.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Activity</p>
                    {!activity[m.id] ? (
                      <p className="text-sm text-gray-400">Loading…</p>
                    ) : activity[m.id].length === 0 ? (
                      <p className="text-sm text-gray-400">No activity recorded yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activity[m.id].map(log => (
                          <div key={log.id} className="flex items-start gap-3 text-sm">
                            <span className="text-gray-300 text-xs mt-0.5 w-32 flex-shrink-0">{formatIST(log.created_at)}</span>
                            <div>
                              <span className="font-medium text-gray-700">
                                {ACTION_LABELS[log.action] || log.action}
                              </span>
                              {log.detail && (
                                <span className="text-gray-400"> — {log.detail}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">Add Master</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input className="input-field" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" className="input-field" required value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                <input type="password" className="input-field" required minLength={8} value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">A welcome email with these credentials will be sent to the master.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                Masters can: create/edit tests, add questions, send invites, view monitoring.<br />
                Masters cannot: delete anything.
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Master'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
