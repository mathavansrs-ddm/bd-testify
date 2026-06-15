import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Layers, Users,
  Monitor, Mail, LogOut, ClipboardList
} from 'lucide-react'

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/test-sets', icon: Layers, label: 'Test Sets' },
  { to: '/admin/candidates', icon: Users, label: 'Candidates' },
  { to: '/admin/monitoring', icon: Monitor, label: 'Monitoring' },
  { to: '/admin/invite', icon: Mail, label: 'Invite' },
]

export default function AdminLayout({ children, title }) {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('admin_token')
    navigate('/admin/login')
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
        <div className="p-3 border-t border-navy-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

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
