import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { ClipboardList, ShieldCheck, Users, Trophy, Globe } from 'lucide-react'
import api from '../services/api'

function useCountUp(target, duration = 2000) {
  const [count, setCount] = useState(0)
  const started = useRef(false)

  const start = useCallback(() => {
    if (started.current) return
    started.current = true
    if (target === 0) return
    const t0 = performance.now()
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setCount(Math.floor(eased * target))
      if (p < 1) requestAnimationFrame(tick)
      else setCount(target)
    }
    requestAnimationFrame(tick)
  }, [target, duration])

  return [count, start]
}

function StatCard({ icon: Icon, value, label, color, onVisible }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { onVisible(); observer.disconnect() } },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible])

  return (
    <div ref={ref} className="flex flex-col items-center gap-3 bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <span className="text-5xl font-extrabold text-white tabular-nums">{value.toLocaleString()}</span>
      <span className="text-white/70 text-sm font-medium uppercase tracking-wider text-center">{label}</span>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [candidateTarget, setCandidateTarget] = useState(0)
  const [sessionTarget, setSessionTarget] = useState(0)
  const [visitorTarget, setVisitorTarget] = useState(0)

  const [candidateCount, startCandidates] = useCountUp(candidateTarget)
  const [sessionCount, startSessions] = useCountUp(sessionTarget)
  const [visitorCount, startVisitors] = useCountUp(visitorTarget)

  useEffect(() => {
    const key = 'bd_visitor_count'
    const next = parseInt(localStorage.getItem(key) || '0', 10) + 1
    localStorage.setItem(key, String(next))
    setVisitorTarget(next)
  }, [])

  useEffect(() => {
    api.get('/public/stats').then(r => {
      setCandidateTarget(r.data.candidates || 0)
      setSessionTarget(r.data.sessions_completed || 0)
    }).catch(() => {})
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 30%, #f97316 60%, #fb923c 100%)' }}
    >
      <div className="fixed -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white/5 pointer-events-none" />
      <div className="fixed bottom-0 -left-40 w-[400px] h-[400px] rounded-full bg-white/5 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-lg leading-tight block">BD Testify</span>
            <span className="text-white/60 text-xs">Building Doctor</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/admin/login')}
          className="text-sm text-white/80 hover:text-white border border-white/30 hover:border-white/60 hover:bg-white/10 px-5 py-2 rounded-xl transition font-medium"
        >
          Admin Login
        </button>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pt-8 pb-16">
        <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-5 py-2 text-white/90 text-sm mb-8 font-medium">
          <ShieldCheck className="w-4 h-4" /> AI-Powered Proctored Assessment
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-5 leading-tight tracking-tight">
          Building Doctor<br />
          <span className="text-white/50">Assessment Platform</span>
        </h1>

        <p className="text-white/70 text-lg max-w-lg mb-10 leading-relaxed">
          Secure, AI-proctored online exams with real-time face detection,
          audio monitoring, and instant results.
        </p>

        {/* Animated stat counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl w-full">
          <StatCard icon={Users} value={candidateCount} label="Candidates Registered" color="bg-orange-500/80" onVisible={startCandidates} />
          <StatCard icon={Trophy} value={sessionCount} label="Tests Completed" color="bg-amber-500/80" onVisible={startSessions} />
          <StatCard icon={Globe} value={visitorCount} label="Portal Visitors" color="bg-rose-500/80" onVisible={startVisitors} />
        </div>
      </div>

      <footer className="relative z-10 text-center text-white/40 text-xs pb-6">
        © {new Date().getFullYear()} Building Doctor. All rights reserved.
      </footer>
    </div>
  )
}
