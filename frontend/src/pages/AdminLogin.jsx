import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { adminLogin } from '../services/api'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await adminLogin({ email, password })
      localStorage.setItem('admin_token', res.data.access_token)
      localStorage.setItem('admin_role', res.data.role || 'superadmin')
      localStorage.setItem('admin_name', res.data.name || email)
      toast.success('Welcome back!')
      navigate('/admin/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #ea580c 0%, #f97316 40%, #fb923c 70%, #fdba74 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute top-1/3 -right-16 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 left-1/3 w-80 h-80 rounded-full bg-white/10" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-wide">BD Testify</span>
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            Secure. Smart.<br />Scalable Assessments.
          </h2>
          <p className="text-white/80 text-lg leading-relaxed">
            AI-powered proctoring with real-time face detection, audio monitoring,
            and instant results — built for Building Doctor.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { label: 'AI Proctoring', desc: 'Face & audio detection' },
              { label: 'Role-Based Access', desc: 'Superadmin & Masters' },
              { label: 'Live Monitoring', desc: 'Real-time candidate view' },
              { label: 'Instant Results', desc: 'Auto-scored & emailed' },
            ].map(({ label, desc }) => (
              <div key={label} className="bg-white/15 backdrop-blur rounded-xl p-4">
                <p className="text-white font-semibold text-sm">{label}</p>
                <p className="text-white/70 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/50 text-xs">
          © {new Date().getFullYear()} Building Doctor. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-900">BD Testify</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Admin Portal</h1>
            <p className="text-gray-500 mt-1">Sign in to manage assessments</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@buildingdoctor.com"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
              style={{ background: loading ? '#f97316' : 'linear-gradient(135deg,#ea580c,#f97316)' }}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-3 p-4 bg-orange-50 rounded-xl border border-orange-100">
            <ShieldCheck className="w-5 h-5 text-orange-500 shrink-0" />
            <p className="text-xs text-orange-700 leading-relaxed">
              This portal is restricted to authorized Building Doctor admins only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
