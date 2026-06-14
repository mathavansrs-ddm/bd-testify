import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

export default function Timer({ totalMinutes, onExpire }) {
  const [seconds, setSeconds] = useState(totalMinutes * 60)

  useEffect(() => {
    if (seconds <= 0) {
      onExpire?.()
      return
    }
    const id = setInterval(() => setSeconds((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [seconds, onExpire])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const isUrgent = seconds <= 300 // 5 minutes

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold ${
      isUrgent ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-navy-900 text-white'
    }`}>
      <Clock className="w-5 h-5" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  )
}
