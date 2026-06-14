import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { validateToken, registerCandidate } from '../services/api'
import { ClipboardList, AlertCircle, CheckCircle, Mail } from 'lucide-react'

export default function CandidateRegister() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')

  const [tokenInfo, setTokenInfo] = useState(null)
  const [tokenError, setTokenError] = useState('')
  const [validating, setValidating] = useState(!!token)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const [form, setForm] = useState({
    name: '', phone: '', email: '', degree: '', year_of_study: '', college_name: ''
  })

  useEffect(() => {
    if (!token) return
    validateToken(token)
      .then((r) => {
        setTokenInfo(r.data)
        setForm((f) => ({ ...f, email: r.data.candidate_email || '' }))
        if (r.data.candidate_registered) navigate(`/test/${token}`)
      })
      .catch((err) => setTokenError(err.response?.data?.detail || 'Invalid or expired invite link'))
      .finally(() => setValidating(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (tokenInfo && form.email !== tokenInfo.candidate_email) {
      toast.error('Email must match the invited email address')
      return
    }
    setLoading(true)
    try {
      await registerCandidate({ ...form })
      if (token) {
        toast.success('Registered! Starting your test…')
        navigate(`/test/${token}`)
      } else {
        setDone(true)
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Validating your invite link…</p>
        </div>
      </div>
    )
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md w-full text-center">
          <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite Link</h2>
          <p className="text-gray-500 mb-6">{tokenError}</p>
          <p className="text-sm text-gray-400">
            Please contact your exam coordinator for a valid link,<br />
            or scan the QR code at the exam venue.
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md w-full text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
          <p className="text-gray-500 mb-4">
            Welcome, <strong>{form.name}</strong>! Your registration is complete.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <Mail className="w-5 h-5 inline mr-2" />
            Your exam invite link will be sent to <strong>{form.email}</strong> once the admin schedules your test.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-900 rounded-xl mb-3">
            <ClipboardList className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BD Testify</h1>
          <p className="text-gray-500 text-sm mt-1">
            {token ? 'Complete your registration to begin the test' : 'Register to take the Building Doctor assessment'}
          </p>
          {tokenInfo && (
            <div className="mt-3 inline-block bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-1 rounded-full">
              Invite verified for {tokenInfo.candidate_email}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input className="input-field" placeholder="e.g. Arjun Kumar" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input type="tel" className="input-field" placeholder="9876543210" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <input type="email" className={`input-field ${tokenInfo?.candidate_email ? 'bg-gray-50 text-gray-500' : ''}`}
                placeholder="you@email.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                readOnly={!!tokenInfo?.candidate_email} required />
              {tokenInfo?.candidate_email && (
                <p className="text-xs text-gray-400 mt-0.5">Locked to invited address</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Degree / Course *</label>
              <input className="input-field" placeholder="B.E. Civil Engineering" value={form.degree}
                onChange={(e) => setForm({ ...form, degree: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study *</label>
              <select className="input-field" value={form.year_of_study}
                onChange={(e) => setForm({ ...form, year_of_study: e.target.value })} required>
                <option value="">Select year</option>
                {['1st Year', '2nd Year', '3rd Year', '4th Year', 'Final Year', 'Passed Out'].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">College / Institution *</label>
              <input className="input-field" placeholder="ABC Engineering College, Chennai" value={form.college_name}
                onChange={(e) => setForm({ ...form, college_name: e.target.value })} required />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registering…
              </span>
            ) : token ? 'Register & Start Test →' : 'Register Now →'}
          </button>

          {!token && (
            <p className="text-center text-xs text-gray-400 mt-2">
              Already registered? Use the invite link sent to your email to access the test.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
