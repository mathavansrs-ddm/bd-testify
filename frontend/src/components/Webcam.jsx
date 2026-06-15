// Pure display component — renders the shared stream from TestRoom.
// TestRoom owns the stream lifecycle; this just shows it.
export default function WebcamMonitor({ videoRef }) {
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
