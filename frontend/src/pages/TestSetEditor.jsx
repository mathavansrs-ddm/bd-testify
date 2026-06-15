import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Edit, Trash2, X, Upload, Download, Save, Clock, BookOpen, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { useAdminRole } from '../hooks/useAdminRole'
import {
  getTestSet, updateTestSet,
  getSections, createSection, updateSection, deleteSection,
  getQuestions, createQuestion, updateQuestion, deleteQuestion, bulkUploadQuestions,
} from '../services/api'

const TABS = ['Settings', 'Sections', 'Questions']

const BLANK_SECTION = { name: '', time_limit_minutes: '', questions_per_section: '' }
const BLANK_Q = { question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a', marks: 1, section_id: '' }

export default function TestSetEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const testSetId = Number(id)
  const { isSuperAdmin } = useAdminRole()

  const [tab, setTab] = useState('Settings')
  const [testSet, setTestSet] = useState(null)
  const [sections, setSections] = useState([])
  const [questions, setQuestions] = useState([])
  const [filterSection, setFilterSection] = useState('')
  const [loading, setLoading] = useState(true)

  // Settings form
  const [settings, setSettings] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)

  // Section modal
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [sectionForm, setSectionForm] = useState(BLANK_SECTION)

  // Question modal
  const [showQModal, setShowQModal] = useState(false)
  const [editingQ, setEditingQ] = useState(null)
  const [qForm, setQForm] = useState(BLANK_Q)

  const fileRef = useRef()

  useEffect(() => { loadAll() }, [testSetId])
  useEffect(() => { if (tab === 'Questions') loadQuestions() }, [tab, filterSection])

  async function loadAll() {
    setLoading(true)
    try {
      const [tsRes, secRes] = await Promise.all([getTestSet(testSetId), getSections(testSetId)])
      setTestSet(tsRes.data.test_set)
      setSettings({
        set_name: tsRes.data.test_set.set_name,
        description: tsRes.data.test_set.description || '',
        questions_per_test: tsRes.data.test_set.questions_per_test,
        time_limit_minutes: tsRes.data.test_set.time_limit_minutes,
        max_attempts: tsRes.data.test_set.max_attempts,
        is_open: tsRes.data.test_set.is_open,
        is_active: tsRes.data.test_set.is_active,
      })
      setSections(secRes.data)
    } catch {
      toast.error('Failed to load test set')
    } finally {
      setLoading(false)
    }
  }

  async function loadQuestions() {
    try {
      const r = await getQuestions(testSetId, filterSection || undefined)
      setQuestions(r.data)
    } catch { toast.error('Failed to load questions') }
  }

  // ── Settings ────────────────────────────────────────────────────────────
  async function saveSettings(e) {
    e.preventDefault()
    setSavingSettings(true)
    try {
      await updateTestSet(testSetId, settings)
      toast.success('Settings saved')
      setTestSet(prev => ({ ...prev, ...settings }))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSavingSettings(false)
    }
  }

  // ── Sections ────────────────────────────────────────────────────────────
  function openCreateSection() {
    setEditingSection(null)
    setSectionForm({ name: '', time_limit_minutes: '', questions_per_section: '' })
    setShowSectionModal(true)
  }

  function openEditSection(s) {
    setEditingSection(s.id)
    setSectionForm({
      name: s.name,
      time_limit_minutes: s.time_limit_minutes ?? '',
      questions_per_section: s.questions_per_section ?? '',
    })
    setShowSectionModal(true)
  }

  async function handleSectionSubmit(e) {
    e.preventDefault()
    const payload = {
      name: sectionForm.name,
      order: editingSection
        ? sections.find(s => s.id === editingSection)?.order ?? 0
        : sections.length,
      time_limit_minutes: sectionForm.time_limit_minutes !== '' ? Number(sectionForm.time_limit_minutes) : null,
      questions_per_section: sectionForm.questions_per_section !== '' ? Number(sectionForm.questions_per_section) : null,
    }
    try {
      if (editingSection) {
        await updateSection(testSetId, editingSection, payload)
        toast.success('Section updated')
      } else {
        await createSection(testSetId, payload)
        toast.success('Section created')
      }
      setShowSectionModal(false)
      const r = await getSections(testSetId)
      setSections(r.data)
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
  }

  async function handleDeleteSection(s) {
    if (!confirm(`Delete section "${s.name}"? Questions in it will become unsectioned.`)) return
    try {
      await deleteSection(testSetId, s.id)
      toast.success('Section deleted')
      const r = await getSections(testSetId)
      setSections(r.data)
      if (filterSection === String(s.id)) setFilterSection('')
    } catch { toast.error('Failed to delete') }
  }

  // ── Questions ───────────────────────────────────────────────────────────
  function openCreateQ() {
    setEditingQ(null)
    setQForm({ ...BLANK_Q, section_id: filterSection ? Number(filterSection) : '' })
    setShowQModal(true)
  }

  function openEditQ(q) {
    setEditingQ(q.id)
    setQForm({
      question_text: q.question_text, option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d, correct_answer: q.correct_answer,
      marks: q.marks, section_id: q.section_id ?? '',
    })
    setShowQModal(true)
  }

  async function handleQSubmit(e) {
    e.preventDefault()
    const payload = {
      ...qForm,
      test_set_id: testSetId,
      section_id: qForm.section_id !== '' ? Number(qForm.section_id) : null,
    }
    try {
      if (editingQ) { await updateQuestion(editingQ, payload); toast.success('Question updated') }
      else { await createQuestion(payload); toast.success('Question created') }
      setShowQModal(false)
      loadQuestions()
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
  }

  async function handleDeleteQ(id) {
    if (!confirm('Delete this question?')) return
    try { await deleteQuestion(id); toast.success('Deleted'); loadQuestions() }
    catch { toast.error('Failed') }
  }

  async function handleBulkUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const sectionParam = filterSection ? Number(filterSection) : undefined
      const r = await bulkUploadQuestions(fd, testSetId, sectionParam)
      const { created, errors } = r.data
      if (errors.length > 0 && created === 0) {
        toast.error(`All rows failed. First error (row ${errors[0]?.row}): ${errors[0]?.error}`, { duration: 8000 })
      } else if (errors.length > 0) {
        toast.error(`${created} uploaded, ${errors.length} failed.`, { duration: 5000 })
      } else {
        toast.success(`${created} questions uploaded!`)
      }
      loadQuestions()
      const r2 = await getSections(testSetId); setSections(r2.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed', { duration: 8000 })
    }
    e.target.value = ''
  }

  function downloadTemplate() {
    const csv = 'question_text,option_a,option_b,option_c,option_d,correct_answer,marks\n' +
      '"What is 2+2?","1","2","4","8","c",1\n' +
      '"Capital of India?","Mumbai","Delhi","Chennai","Kolkata","b",1\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'questions_template.csv'; a.click()
  }

  const getSectionName = (sid) => sections.find(s => s.id === sid)?.name || 'Unsectioned'

  if (loading) {
    return (
      <AdminLayout title="Test Set Editor">
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title={testSet?.set_name || 'Test Set Editor'}>
      <div className="space-y-6 max-w-5xl">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/test-sets')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{testSet?.set_name}</h2>
            <p className="text-sm text-gray-400">
              {testSet?.question_count ?? 0} questions · {sections.length} sections ·{' '}
              {testSet?.time_limit_minutes} min
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition ${
                tab === t
                  ? 'bg-white border border-b-white border-gray-200 text-navy-900 -mb-px'
                  : 'text-gray-500 hover:text-gray-800'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── SETTINGS TAB ── */}
        {tab === 'Settings' && settings && (
          <form onSubmit={saveSettings} className="card max-w-lg space-y-5">
            <h3 className="font-semibold text-gray-800">Test Settings</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Name</label>
              <input className="input-field" value={settings.set_name}
                onChange={e => setSettings({ ...settings, set_name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea className="input-field" rows={2} value={settings.description}
                onChange={e => setSettings({ ...settings, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (min)</label>
                <input type="number" min={1} className="input-field" value={settings.time_limit_minutes}
                  onChange={e => setSettings({ ...settings, time_limit_minutes: +e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Used when sections have no time set</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Questions / Test</label>
                <input type="number" min={1} className="input-field" value={settings.questions_per_test}
                  onChange={e => setSettings({ ...settings, questions_per_test: +e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Used when there are no sections</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                <input type="number" min={1} className="input-field" value={settings.max_attempts}
                  onChange={e => setSettings({ ...settings, max_attempts: +e.target.value })} />
              </div>
              <div className="flex flex-col gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.is_open}
                    onChange={e => setSettings({ ...settings, is_open: e.target.checked })}
                    className="w-4 h-4 accent-navy-900" />
                  <span className="text-sm text-gray-700">Open enrollment (no invite)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.is_active}
                    onChange={e => setSettings({ ...settings, is_active: e.target.checked })}
                    className="w-4 h-4 accent-navy-900" />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>
            <button type="submit" disabled={savingSettings}
              className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </button>
          </form>
        )}

        {/* ── SECTIONS TAB ── */}
        {tab === 'Sections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Each section can have its own time limit and question count drawn from its question pool.
                If no sections exist, the test uses the global settings above.
              </p>
              <button onClick={openCreateSection} className="btn-primary flex items-center gap-2 flex-shrink-0">
                <Plus className="w-4 h-4" /> Add Section
              </button>
            </div>

            {sections.length === 0 ? (
              <div className="card text-center py-16 text-gray-400">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No sections yet</p>
                <p className="text-sm mt-1">Add sections to organise questions and set per-section time limits.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sections.map((s, i) => (
                  <div key={s.id} className="card flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-navy-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <div className="flex gap-4 text-xs text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {s.time_limit_minutes ? `${s.time_limit_minutes} min` : `${testSet.time_limit_minutes} min (inherited)`}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {s.questions_per_section
                            ? `${s.questions_per_section} of ${s.question_count} questions`
                            : `All ${s.question_count} questions`}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditSection(s)}
                        className="p-2 text-gray-400 hover:text-navy-900 rounded-lg hover:bg-gray-100">
                        <Edit className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={() => handleDeleteSection(s)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                  Total time: <strong>
                    {sections.reduce((sum, s) => sum + (s.time_limit_minutes || testSet.time_limit_minutes), 0)} min
                  </strong> across {sections.length} sections
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── QUESTIONS TAB ── */}
        {tab === 'Questions' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select className="input-field w-48 text-sm" value={filterSection}
                  onChange={e => setFilterSection(e.target.value)}>
                  <option value="">All sections</option>
                  <option value="none">Unsectioned</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span className="text-sm text-gray-400">{questions.length} questions</span>
              </div>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleBulkUpload} />
                <button onClick={() => fileRef.current.click()}
                  className="btn-secondary flex items-center gap-2 text-sm">
                  <Upload className="w-4 h-4" /> Bulk Upload
                </button>
                <button onClick={downloadTemplate} title="Download CSV template" className="btn-secondary p-2">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={openCreateQ} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Question
                </button>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['#', 'Question', 'Section', 'Correct', 'Marks', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {questions.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No questions yet. Click "Add Question" or bulk upload.</td></tr>
                  )}
                  {questions.map((q, i) => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3 text-gray-900 max-w-xs">
                        <p className="truncate">{q.question_text}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          q.section_id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {q.section_id ? getSectionName(q.section_id) : 'Unsectioned'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="uppercase font-bold text-navy-900 bg-navy-50 px-2 py-1 rounded text-xs">
                          {q.correct_answer}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{q.marks}</td>
                      <td className="px-5 py-3 flex gap-1">
                        <button onClick={() => openEditQ(q)}
                          className="p-2 text-gray-400 hover:text-navy-900 rounded-lg hover:bg-gray-100">
                          <Edit className="w-4 h-4" />
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => handleDeleteQ(q.id)}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Section modal ── */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">{editingSection ? 'Edit Section' : 'Add Section'}</h3>
              <button onClick={() => setShowSectionModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSectionSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section Name</label>
                <input className="input-field" placeholder="e.g. Technical, Aptitude, English"
                  value={sectionForm.name} onChange={e => setSectionForm({ ...sectionForm, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Limit (minutes) <span className="text-gray-400 font-normal">— leave blank to use test default ({testSet?.time_limit_minutes} min)</span>
                </label>
                <input type="number" min={1} className="input-field"
                  placeholder={`Default: ${testSet?.time_limit_minutes} min`}
                  value={sectionForm.time_limit_minutes}
                  onChange={e => setSectionForm({ ...sectionForm, time_limit_minutes: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Questions per candidate <span className="text-gray-400 font-normal">— leave blank to use all</span>
                </label>
                <input type="number" min={1} className="input-field"
                  placeholder="All questions"
                  value={sectionForm.questions_per_section}
                  onChange={e => setSectionForm({ ...sectionForm, questions_per_section: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editingSection ? 'Update' : 'Create'} Section</button>
                <button type="button" onClick={() => setShowSectionModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Question modal ── */}
      {showQModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">{editingQ ? 'Edit Question' : 'Add Question'}</h3>
              <button onClick={() => setShowQModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleQSubmit} className="space-y-4">
              {sections.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <select className="input-field" value={qForm.section_id}
                    onChange={e => setQForm({ ...qForm, section_id: e.target.value })}>
                    <option value="">— Unsectioned —</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <textarea rows={3} className="input-field" value={qForm.question_text}
                  onChange={e => setQForm({ ...qForm, question_text: e.target.value })} required />
              </div>
              {['a', 'b', 'c', 'd'].map(opt => (
                <div key={opt}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Option {opt.toUpperCase()}</label>
                  <input className="input-field" value={qForm[`option_${opt}`]}
                    onChange={e => setQForm({ ...qForm, [`option_${opt}`]: e.target.value })} required />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                  <select className="input-field" value={qForm.correct_answer}
                    onChange={e => setQForm({ ...qForm, correct_answer: e.target.value })}>
                    {['a', 'b', 'c', 'd'].map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marks</label>
                  <input type="number" min={1} className="input-field" value={qForm.marks}
                    onChange={e => setQForm({ ...qForm, marks: +e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editingQ ? 'Update' : 'Create'} Question</button>
                <button type="button" onClick={() => setShowQModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
