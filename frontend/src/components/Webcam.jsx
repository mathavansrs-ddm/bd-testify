import { useEffect, useRef } from 'react'

export default function WebcamMonitor({ stream }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

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
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-white text-xs">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        LIVE
      </div>
    </div>
  )
}
