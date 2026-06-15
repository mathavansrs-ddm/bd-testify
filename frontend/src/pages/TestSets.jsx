import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit, Globe, Lock, CheckCircle, XCircle, ChevronRight, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getTestSets, createTestSet, updateTestSet } from '../services/api'

const BLANK = {
  set_name: '', description: '',
  questions_per_test: 30, time_limit_minutes: 60,
  max_attempts: 1, is_open: false,
}

export default function TestSets() {
  const [sets, setSets] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(BLANK)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await getTestSets()
      setSets(Array.isArray(r.data) ? r.data : [r.data])
    } catch { toast.error('Failed to load test sets') }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await createTestSet(form)
      toast.success('Test set created')
      setShowModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
  }

  async function toggleActive(s) {
    try {
      await updateTestSet(s.id, { is_active: !s.is_active })
      toast.success(`Set ${s.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch { toast.error('Failed') }
  }

  async function toggleOpen(s) {
    try {
      await updateTestSet(s.id, { is_open: !s.is_open })
      toast.success(`Set ${s.is_open ? 'closed' : 'opened for self-enroll'}`)
      load()
    } catch { toast.error('Failed') }
  }

  return (
    <AdminLayout title="Test Sets">
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Create and manage tests. Click a test to add sections and questions.
          </p>
          <button
            onClick={() => { setForm(BLANK); setShowModal(true) }}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Test Set
          </button>
        </div>

        {sets.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No test sets yet</p>
            <p className="text-sm mt-1">Create your first test set to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map(s => (
              <div key={s.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{s.set_name}</p>
                    {s.is_open && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Open
                      </span>
                    )}
                    {!s.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                        Inactive
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{s.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-400 mt-1">
                    <span>{s.question_count ?? 0} questions</span>
                    <span>{s.time_limit_minutes} min</span>
                    <span>{s.max_attempts} attempt{s.max_attempts !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Quick toggles */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(s)} title={s.is_active ? 'Deactivate' : 'Activate'}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                    {s.is_active ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <button onClick={() => toggleOpen(s)} title={s.is_open ? 'Make private' : 'Open enrollment'}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
                    {s.is_open ? <Globe className="w-4 h-4 text-blue-600" /> : <Lock className="w-4 h-4" />}
                  </button>
                </div>

                {/* Manage link */}
                <Link to={`/admin/test-sets/${s.id}`}
                  className="btn-primary flex items-center gap-1.5 flex-shrink-0 text-sm py-2">
                  <Edit className="w-3.5 h-3.5" /> Manage
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-semibold mb-6">Create Test Set</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Name</label>
                <input className="input-field" value={form.set_name}
                  onChange={e => setForm({ ...form, set_name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input-field" rows={2} value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (min)</label>
                  <input type="number" min={1} className="input-field" value={form.time_limit_minutes}
                    onChange={e => setForm({ ...form, time_limit_minutes: +e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input type="number" min={1} className="input-field" value={form.max_attempts}
                    onChange={e => setForm({ ...form, max_attempts: +e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_open}
                  onChange={e => setForm({ ...form, is_open: e.target.checked })}
                  className="w-4 h-4 accent-navy-900" />
                <span className="text-sm text-gray-700">Open enrollment (no invite needed)</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Create</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
