import { useNavigate } from 'react-router-dom'
import { ClipboardList, ShieldCheck, Users, BarChart3, QrCode, ArrowRight, Globe, Briefcase } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg">BD Testify</span>
        </div>
        <button onClick={() => navigate('/admin/login')}
          className="text-sm text-white/70 hover:text-white border border-white/20 hover:border-white/50 px-4 py-2 rounded-lg transition">
          Admin Login
        </button>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-white/80 text-sm mb-6">
          <ShieldCheck className="w-4 h-4" /> AI-Powered Proctored Assessment
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 leading-tight">
          Building Doctor<br />
          <span className="text-blue-300">Assessment Platform</span>
        </h1>
        <p className="text-white/60 text-lg max-w-xl mb-10">
          Conduct secure, AI-proctored online exams with real-time face detection,
          audio monitoring, and instant results.
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 mb-16">
          <button onClick={() => navigate('/register')}
            className="flex items-center gap-2 bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition">
            Register as Student <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/employee/login')}
            className="flex items-center gap-2 bg-purple-500/80 border border-purple-400/50 text-white font-semibold px-6 py-3 rounded-xl hover:bg-purple-500 transition">
            <Briefcase className="w-4 h-4" /> Employee Login
          </button>
          <button onClick={() => navigate('/tests')}
            className="flex items-center gap-2 bg-blue-500/80 border border-blue-400/50 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-500 transition">
            <Globe className="w-4 h-4" /> Open Tests
          </button>
          <button onClick={() => navigate('/qr-landing')}
            className="flex items-center gap-2 bg-white/10 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition">
            <QrCode className="w-4 h-4" /> QR Code Login
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full">
          {[
            { icon: ShieldCheck, title: 'AI Proctoring', desc: 'Face identity verification, audio monitoring, and anti-cheat enforcement in real time.' },
            { icon: Users, title: 'Candidate Management', desc: 'Invite candidates via email or QR code. Track registrations and block fraud attempts.' },
            { icon: BarChart3, title: 'Instant Results', desc: 'Auto-scored tests with pass/fail, percentage, and detailed admin review dashboard.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left">
              <Icon className="w-6 h-6 text-blue-300 mb-3" />
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-white/50 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center text-white/30 text-xs pb-6">
        © {new Date().getFullYear()} Building Doctor. All rights reserved.
      </footer>
    </div>
  )
}
