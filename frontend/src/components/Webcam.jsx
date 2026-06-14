import { useEffect, useRef, useState } from 'react'

// Stream-only webcam — no recording, no uploads.
// Exposes videoRef so AntiCheat can run face detection on the live feed.
export default function WebcamMonitor({ videoRef, onStreamReady }) {
  const [error, setError] = useState(null)
  const [active, setActive] = useState(false)
  const streamRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function startStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef?.current) {
          videoRef.current.srcObject = stream
        }
        setActive(true)
        onStreamReady?.(stream)
      } catch {
        if (!cancelled) setError('Camera / mic access denied. Please allow and refresh.')
      }
    }

    startStream()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: '160px' }}
      />
      {active && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-white text-xs">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          LIVE
        </div>
      )}
    </div>
  )
}
