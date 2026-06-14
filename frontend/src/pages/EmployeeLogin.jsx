import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { employeeLogin } from '../services/api'
import { Briefcase, ClipboardList } from 'lucide-react'

export default function EmployeeLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await employeeLogin({ email, password })
      // Store employee token + info for use in open-tests page
      localStorage.setItem('employee_token', r.data.access_token)
      localStorage.setItem('employee_info', JSON.stringify(r.data.candidate))
      toast.success(`Welcome, ${r.data.candidate.name}!`)
      navigate('/tests')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-purple-700 rounded-xl mb-3">
            <Briefcase className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Login</h1>
          <p className="text-gray-500 text-sm mt-1">BD Testify — Internal Assessment Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
            <input type="email" className="input-field" placeholder="you@buildingdoctor.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" className="input-field" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Not an employee?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">Register as external candidate</Link>
          </p>
          <p className="text-xs text-gray-400">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
