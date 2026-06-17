import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Layers, Users,
  Monitor, Mail, LogOut, ClipboardList, ShieldCheck, Activity, KeyRound, X
} from 'lucide-react'
import { useAdminRole } from '../hooks/useAdminRole'
import { changePassword } from '../services/api'
import toast from 'react-hot-toast'

const baseNavItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/test-sets', icon: Layers, label: 'Test Sets' },
  { to: '/admin/candidates', icon: Users, label: 'Candidates' },
  { to: '/admin/monitoring', icon: Monitor, label: 'Monitoring' },
  { to: '/admin/invite', icon: Mail, label: 'Invite' },
  { to: '/admin/my-activity', icon: Activity, label: 'My Activity' },
]

const superAdminItems = [
  { to: '/admin/masters', icon: ShieldCheck, label: 'Masters' },
]

export default function AdminLayout({ children, title }) {
  const navigate = useNavigate()
  const { isSuperAdmin, name, role } = useAdminRole()
  const navItems = isSuperAdmin ? [...baseNavItems, ...superAdminItems] : baseNavItems
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwdLoading, setPwdLoading] = useState(false)

  function logout() {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_role')
    localStorage.removeItem('admin_name')
    navigate('/admin/login')
  }

  async function handleChangePwd(e) {
    e.preventDefault()
    if (pwdForm.new_password !== pwdForm.confirm) {
      toast.error('New passwords do not match')
      return
    }
    if (pwdForm.new_password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setPwdLoading(true)
    try {
      await changePassword({ current_password: pwdForm.current_password, new_password: pwdForm.new_password })
      toast.success('Password changed successfully')
      setShowChangePwd(false)
      setPwdForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-navy-900 flex flex-col">
        <div className="p-6 border-b border-navy-800">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-white w-7 h-7" />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">BD Testify</h1>
              <p className="text-navy-300 text-xs">Building Doctor</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-navy-900'
                    : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-navy-800 space-y-1">
          <div className="px-3 py-2">
            <p className="text-white text-sm font-medium truncate">{name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isSuperAdmin ? 'bg-yellow-500 text-yellow-900' : 'bg-navy-700 text-navy-200'
            }`}>
              {isSuperAdmin ? 'Super Admin' : 'Master'}
            </span>
          </div>
          <button
            onClick={() => setShowChangePwd(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Change Password Modal */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Change Password</h3>
              <button onClick={() => setShowChangePwd(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleChangePwd} className="space-y-3">
              <input
                type="password"
                placeholder="Current password"
                value={pwdForm.current_password}
                onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="password"
                placeholder="New password (min 8 characters)"
                value={pwdForm.new_password}
                onChange={e => setPwdForm(f => ({ ...f, new_password: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={pwdForm.confirm}
                onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={pwdLoading}
                className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {pwdLoading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
