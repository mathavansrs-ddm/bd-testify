import { useEffect, useState } from 'react'
import { Plus, Edit, X, CheckCircle, XCircle, Globe, Lock } from 'lucide-react'
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
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)

  useEffect(() => { load() }, [])

  async function load() {
    try { const r = await getTestSets(); setSets(Array.isArray(r.data) ? r.data : [r.data]) }
    catch { toast.error('Failed to load test sets') }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editing) { await updateTestSet(editing, form); toast.success('Test set updated') }
      else { await createTestSet(form); toast.success('Test set created') }
      setShowModal(false); load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
  }

  async function toggleActive(s) {
    try { await updateTestSet(s.id, { is_active: !s.is_active }); toast.success(`Set ${s.is_active ? 'deactivated' : 'activated'}`); load() }
    catch { toast.error('Failed') }
  }

  async function toggleOpen(s) {
    try { await updateTestSet(s.id, { is_open: !s.is_open }); toast.success(`Set ${s.is_open ? 'closed' : 'opened for self-enroll'}`); load() }
    catch { toast.error('Failed') }
  }

  function openEdit(s) {
    setEditing(s.id)
    setForm({ set_name: s.set_name, description: s.description || '', questions_per_test: s.questions_per_test, time_limit_minutes: s.time_limit_minutes, max_attempts: s.max_attempts ?? 1, is_open: s.is_open ?? false })
    setShowModal(true)
  }

  return (
    <AdminLayout title="Test Sets">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Manage tests — set time limit, attempts, and open enrollment per test.</p>
          <button onClick={() => { setEditing(null); setForm(BLANK); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Test Set
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sets.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">No test sets yet. Create one to get started.</div>
          )}
          {sets.map((s) => (
            <div key={s.id} className="card space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 text-lg truncate">{s.set_name}</h3>
                  {s.description && <p className="text-gray-500 text-sm mt-0.5 line-clamp-2">{s.description}</p>}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium text-center ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {s.is_open && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 text-center flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Open
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  [s.question_count ?? 0, 'Questions'],
                  [s.questions_per_test, 'Per Test'],
                  [`${s.time_limit_minutes}m`, 'Duration'],
                  [s.max_attempts ?? 1, 'Attempts'],
                ].map(([val, label]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-gray-900">{val}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => openEdit(s)} className="btn-secondary flex items-center gap-1 text-sm flex-1 justify-center">
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => toggleActive(s)}
                  className={`flex items-center gap-1 text-sm flex-1 justify-center px-3 py-2 rounded-lg border font-medium transition-colors ${s.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                  {s.is_active ? <><XCircle className="w-3.5 h-3.5" /> Deactivate</> : <><CheckCircle className="w-3.5 h-3.5" /> Activate</>}
                </button>
                <button onClick={() => toggleOpen(s)}
                  className={`flex items-center gap-1 text-sm flex-1 justify-center px-3 py-2 rounded-lg border font-medium transition-colors ${s.is_open ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                  {s.is_open ? <><Lock className="w-3.5 h-3.5" /> Close</> : <><Globe className="w-3.5 h-3.5" /> Open</>}
                </button>
              </div>

              {s.is_open && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                  <Globe className="w-3 h-3 flex-shrink-0" />
                  Candidates can self-enroll at <strong>/tests</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">{editing ? 'Edit Test Set' : 'Create Test Set'}</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Set Name *</label>
                <input className="input-field" placeholder="e.g. Civil Engineering Aptitude" value={form.set_name}
                  onChange={(e) => setForm({ ...form, set_name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea rows={2} className="input-field" placeholder="Optional description shown to candidates"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Questions Per Test</label>
                  <input type="number" min={1} className="input-field" value={form.questions_per_test}
                    onChange={(e) => setForm({ ...form, questions_per_test: +e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (mins)</label>
                  <input type="number" min={1} className="input-field" value={form.time_limit_minutes}
                    onChange={(e) => setForm({ ...form, time_limit_minutes: +e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input type="number" min={1} className="input-field" value={form.max_attempts}
                    onChange={(e) => setForm({ ...form, max_attempts: +e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <input type="checkbox" id="is_open" checked={form.is_open}
                  onChange={(e) => setForm({ ...form, is_open: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600" />
                <label htmlFor="is_open" className="text-sm text-blue-800 cursor-pointer">
                  <strong>Open enrollment</strong> — candidates can self-register and attend without an invite link
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editing ? 'Save Changes' : 'Create Test Set'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
