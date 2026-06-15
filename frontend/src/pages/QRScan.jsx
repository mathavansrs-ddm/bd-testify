import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { submitQREmail } from '../services/api'
import { ClipboardList, Mail, GraduationCap, Briefcase, CheckCircle } from 'lucide-react'

export default function QRScan() {
  const [params] = useSearchParams()
  const testSetId = params.get('test')
  const presetType = params.get('type') // 'student' | 'employee' | null

  const [type, setType] = useState(presetType || null)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [testLink, setTestLink] = useState(null)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = { ...form, candidate_type: type }
      if (testSetId) payload.test_set_id = parseInt(testSetId)
      const res = await submitQREmail(payload)
      setTestLink(res.data.test_link || null)
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 rounded-2xl mb-3">
            <ClipboardList className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BD Testify</h1>
          <p className="text-gray-500 text-sm mt-1">Building Doctor Assessment</p>
          {testSetId && (
            <span className="inline-block mt-2 bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">
              Test-specific registration
            </span>
          )}
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">You're Registered!</h2>
            <p className="text-gray-500 mb-4">
              A test link has been sent to <strong>{form.email}</strong>.
            </p>
            {testLink && (
              <a href={testLink}
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition">
                Start Test Now →
              </a>
            )}
          </div>
        ) : !type ? (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-1 text-center">Who are you?</h2>
            <p className="text-sm text-gray-500 mb-6 text-center">Select your category to continue</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setType('student')}
                className="flex flex-col items-center gap-3 border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl p-6 transition">
                <GraduationCap className="w-8 h-8 text-blue-600" />
                <span className="font-semibold text-gray-800">Student</span>
                <span className="text-xs text-gray-500 text-center">College / Institute candidate</span>
              </button>
              <button onClick={() => setType('employee')}
                className="flex flex-col items-center gap-3 border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 rounded-xl p-6 transition">
                <Briefcase className="w-8 h-8 text-purple-600" />
                <span className="font-semibold text-gray-800">Employee</span>
                <span className="text-xs text-gray-500 text-center">Internal staff member</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-5">
              {/* Hide back button if type was pre-set via QR URL */}
              {!presetType && (
                <>
                  <button onClick={() => { setType(null); setForm({}) }}
                    className="text-sm text-blue-600 hover:underline">← Back</button>
                  <span className="text-sm text-gray-400">|</span>
                </>
              )}
              <span className="text-sm font-medium text-gray-700">
                {type === 'student' ? '🎓 Student Registration' : '💼 Employee Registration'}
              </span>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input name="name" type="text" className="input-field" placeholder="Your full name"
                  onChange={handleChange} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input name="email" type="email" className="input-field" placeholder="your@email.com"
                  onChange={handleChange} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input name="phone" type="tel" className="input-field" placeholder="+91 XXXXX XXXXX"
                  onChange={handleChange} />
              </div>

              {type === 'student' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">College / Institute</label>
                    <input name="college" type="text" className="input-field" placeholder="College name"
                      onChange={handleChange} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
                      <input name="course" type="text" className="input-field" placeholder="B.Tech / MBA..."
                        onChange={handleChange} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                      <select name="year" className="input-field" onChange={handleChange}>
                        <option value="">Select</option>
                        <option>1st Year</option>
                        <option>2nd Year</option>
                        <option>3rd Year</option>
                        <option>4th Year</option>
                        <option>Passed Out</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {type === 'employee' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                    <input name="employee_id" type="text" className="input-field" placeholder="EMP-XXXX"
                      onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <input name="department" type="text" className="input-field" placeholder="Department name"
                      onChange={handleChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                    <input name="designation" type="text" className="input-field" placeholder="Your role / title"
                      onChange={handleChange} />
                  </div>
                </>
              )}

              <button type="submit" disabled={loading}
                className={`w-full py-3 rounded-xl font-semibold text-white transition ${type === 'student' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {loading ? 'Registering…' : 'Register & Get Test Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
