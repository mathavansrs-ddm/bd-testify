import { useEffect, useState, useRef } from 'react'
import { Plus, Edit, Trash2, X, Upload, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, getTestSets, bulkUploadQuestions, getSections } from '../services/api'

const BLANK = { test_set_id: '', question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a', marks: 1 }

export default function QuestionManager() {
  const [questions, setQuestions] = useState([])
  const [testSets, setTestSets] = useState([])
  const [filterSet, setFilterSet] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)

  useEffect(() => {
    loadQuestions()
    getTestSets().then((r) => setTestSets(r.data)).catch(() => {})
  }, [filterSet])

  async function loadQuestions() {
    try {
      const r = await getQuestions(filterSet || undefined)
      setQuestions(r.data)
    } catch { toast.error('Failed to load questions') }
  }

  function openCreate() { setEditing(null); setForm(BLANK); setShowModal(true) }
  function openEdit(q) {
    setEditing(q.id)
    setForm({ test_set_id: q.test_set_id, question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, correct_answer: q.correct_answer, marks: q.marks })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editing) {
        await updateQuestion(editing, form)
        toast.success('Question updated')
      } else {
        await createQuestion(form)
        toast.success('Question created')
      }
      setShowModal(false)
      loadQuestions()
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this question?')) return
    try {
      await deleteQuestion(id)
      toast.success('Deleted')
      loadQuestions()
    } catch { toast.error('Failed to delete') }
  }

  const fileRef = useRef()
  const [bulkTestSetId, setBulkTestSetId] = useState('')
  const [bulkSectionId, setBulkSectionId] = useState('')
  const [bulkSections, setBulkSections] = useState([])

  async function handleBulkTestSetChange(id) {
    setBulkTestSetId(id)
    setBulkSectionId('')
    if (id) {
      try {
        const r = await getSections(id)
        setBulkSections(r.data)
      } catch { setBulkSections([]) }
    } else {
      setBulkSections([])
    }
  }

  async function handleBulkUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!bulkTestSetId) {
      toast.error('Please select a test set before uploading.')
      e.target.value = ''
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await bulkUploadQuestions(fd, bulkTestSetId, bulkSectionId || null)
      const { created, errors } = r.data
      console.log('Bulk upload errors:', errors)
      if (errors.length > 0 && created === 0) {
        toast.error(`All rows failed. First error (row ${errors[0]?.row}): ${errors[0]?.error}`, { duration: 8000 })
      } else if (errors.length > 0) {
        toast.error(`${created} uploaded, ${errors.length} failed. First error: ${errors[0]?.error}`, { duration: 8000 })
      } else {
        toast.success(`${created} questions uploaded successfully!`)
      }
      loadQuestions()
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Upload failed'
      toast.error(`Upload error: ${detail}`, { duration: 8000 })
      console.error('Bulk upload error:', err.response?.data)
    }
    e.target.value = ''
  }

  function downloadTemplate() {
    const csv = 'question_text,option_a,option_b,option_c,option_d,correct_answer,marks,test_set_id\n' +
      '"What is 2+2?","1","2","4","8","c",1,\n' +
      '"Capital of India?","Mumbai","Delhi","Chennai","Kolkata","b",1,\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'questions_template.csv'; a.click()
  }

  const getSetName = (id) => testSets.find((s) => s.id === id)?.set_name || '—'

  return (
    <AdminLayout title="Question Manager">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select className="input-field w-48" value={filterSet} onChange={(e) => setFilterSet(e.target.value)}>
            <option value="">All Test Sets</option>
            {testSets.map((s) => <option key={s.id} value={s.id}>{s.set_name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            {/* Bulk upload */}
            <select className="input-field w-44 text-sm" value={bulkTestSetId} onChange={(e) => handleBulkTestSetChange(e.target.value)}>
              <option value="">— Assign to set —</option>
              {testSets.map((s) => <option key={s.id} value={s.id}>{s.set_name}</option>)}
            </select>
            {bulkSections.length > 0 && (
              <select className="input-field w-40 text-sm" value={bulkSectionId} onChange={(e) => setBulkSectionId(e.target.value)}>
                <option value="">— No section —</option>
                {bulkSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleBulkUpload} />
            <button onClick={() => fileRef.current.click()} className="btn-secondary flex items-center gap-2 text-sm">
              <Upload className="w-4 h-4" /> Bulk Upload
            </button>
            <button onClick={downloadTemplate} title="Download CSV template" className="btn-secondary p-2">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Question
            </button>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Question', 'Test Set', 'Correct', 'Marks', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {questions.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No questions yet. Click "Add Question" to start.</td></tr>
              )}
              {questions.map((q, i) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-3 text-gray-900 max-w-xs truncate">{q.question_text}</td>
                  <td className="px-5 py-3 text-gray-600">{getSetName(q.test_set_id)}</td>
                  <td className="px-5 py-3"><span className="uppercase font-bold text-navy-900 bg-navy-50 px-2 py-1 rounded">{q.correct_answer}</span></td>
                  <td className="px-5 py-3 text-gray-600">{q.marks}</td>
                  <td className="px-5 py-3 flex gap-2">
                    <button onClick={() => openEdit(q)} className="p-2 text-gray-400 hover:text-navy-900 rounded"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(q.id)} className="p-2 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">{editing ? 'Edit Question' : 'Add Question'}</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Set</label>
                <select className="input-field" value={form.test_set_id} onChange={(e) => setForm({ ...form, test_set_id: +e.target.value })} required>
                  <option value="">Select test set</option>
                  {testSets.map((s) => <option key={s.id} value={s.id}>{s.set_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <textarea rows={3} className="input-field" value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} required />
              </div>
              {['a', 'b', 'c', 'd'].map((opt) => (
                <div key={opt}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Option {opt.toUpperCase()}</label>
                  <input className="input-field" value={form[`option_${opt}`]} onChange={(e) => setForm({ ...form, [`option_${opt}`]: e.target.value })} required />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                  <select className="input-field" value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}>
                    {['a', 'b', 'c', 'd'].map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marks</label>
                  <input type="number" min={1} className="input-field" value={form.marks} onChange={(e) => setForm({ ...form, marks: +e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Create'} Question</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
