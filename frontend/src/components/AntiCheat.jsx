import { useEffect, useRef, useState, useCallback } from 'react'
import { logEvent, fraudBlock } from '../services/api'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model'
const FACE_MATCH_THRESHOLD = 0.65   // Euclidean distance — lower = stricter
const NO_FACE_BLOCK_AFTER = 8       // consecutive no-face strikes before block (~24s)
const FRAUD_BLOCK_AFTER  = 5        // fraud strikes (multiple faces / impersonation) before block
const AUDIO_SPIKE_THRESHOLD = 0.18  // RMS amplitude 0–1
const AUDIO_SPIKE_SECONDS  = 4      // sustained spike duration before flagging

let _faceapi = null

async function loadFaceApi() {
  if (_faceapi) return _faceapi
  await new Promise((resolve, reject) => {
    if (document.getElementById('faceapi-script')) { resolve(); return }
    const s = document.createElement('script')
    s.id = 'faceapi-script'
    s.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
    s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
  const faceapi = window.faceapi
  if (!faceapi) throw new Error('face-api not found on window')
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  ])
  _faceapi = faceapi
  return faceapi
}

// Euclidean distance between two 128-d face descriptors
function faceDistance(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

export default function AntiCheat({ sessionId, videoRef, onBlock }) {
  const [status, setStatus] = useState('loading')   // loading|ok|no_face|multi|impersonator|audio|blocked|unavailable
  const [detail, setDetail] = useState('')

  const referenceDescriptor = useRef(null)   // captured at first clear detection
  const noFaceStrikes  = useRef(0)
  const fraudStrikes   = useRef(0)
  const blockedRef     = useRef(false)
  const audioSpikeStart = useRef(null)
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const detectTimer    = useRef(null)

  const block = useCallback(async (reason, eventType) => {
    if (blockedRef.current) return
    blockedRef.current = true
    setStatus('blocked')
    setDetail(reason)
    try {
      await fraudBlock({ session_id: sessionId, reason })
    } catch (_) {}
    onBlock?.(reason)
  }, [sessionId, onBlock])

  const report = useCallback(async (eventType) => {
    try {
      const res = await logEvent({ session_id: sessionId, event_type: eventType })
      if (res.data?.blocked) block('Auto-blocked by server', eventType)
    } catch (_) {}
  }, [sessionId, block])

  const audioCancelledRef = useRef(false)

  // ── Audio monitoring ────────────────────────────────────────────────────
  function startAudioMonitor(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser

      const buf = new Float32Array(analyser.fftSize)
      function tick() {
        if (blockedRef.current || audioCancelledRef.current) return
        try { analyser.getFloatTimeDomainData(buf) } catch { return }
        let rms = 0
        for (const v of buf) rms += v * v
        rms = Math.sqrt(rms / buf.length)

        if (rms > AUDIO_SPIKE_THRESHOLD) {
          if (!audioSpikeStart.current) audioSpikeStart.current = Date.now()
          const secs = (Date.now() - audioSpikeStart.current) / 1000
          if (secs >= AUDIO_SPIKE_SECONDS) {
            audioSpikeStart.current = null
            report('suspicious_audio')
            setStatus('audio')
            setDetail('Suspicious audio detected')
          }
        } else {
          audioSpikeStart.current = null
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch (_) {}
  }

  // ── Face detection loop ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      let faceapi
      try {
        faceapi = await loadFaceApi()
      } catch {
        setStatus('unavailable')
        return
      }
      if (cancelled) return
      setStatus('ok')

      detectTimer.current = setInterval(async () => {
        if (cancelled || blockedRef.current || !videoRef?.current) return
        try {
          const detections = await faceapi
            .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors()

          // ── No face ────────────────────────────────────────────────────
          if (detections.length === 0) {
            noFaceStrikes.current += 1
            setStatus('no_face')
            setDetail(`No face (${noFaceStrikes.current}/${NO_FACE_BLOCK_AFTER})`)
            if (noFaceStrikes.current >= NO_FACE_BLOCK_AFTER) {
              await report('face_not_detected')
              await block('Candidate not visible for extended period', 'face_not_detected')
            } else {
              await report('face_not_detected')
            }
            return
          }

          noFaceStrikes.current = 0

          // ── Multiple faces ─────────────────────────────────────────────
          if (detections.length > 1) {
            fraudStrikes.current += 1
            setStatus('multi')
            setDetail(`Multiple faces (${detections.length})`)
            await report('multiple_faces')
            if (fraudStrikes.current >= FRAUD_BLOCK_AFTER) {
              await block('Multiple people detected in frame', 'multiple_faces')
            }
            return
          }

          // ── Face identity check ────────────────────────────────────────
          const descriptor = detections[0].descriptor

          if (!referenceDescriptor.current) {
            referenceDescriptor.current = descriptor
            setStatus('ok')
            setDetail('Identity captured')
            return
          }

          const dist = faceDistance(referenceDescriptor.current, descriptor)
          if (dist > FACE_MATCH_THRESHOLD) {
            fraudStrikes.current += 1
            setStatus('impersonator')
            setDetail(`Different person detected (dist=${dist.toFixed(2)}, strike ${fraudStrikes.current}/${FRAUD_BLOCK_AFTER})`)
            await report('multiple_faces')
            if (fraudStrikes.current >= FRAUD_BLOCK_AFTER) {
              await block('Identity mismatch — different person detected', 'multiple_faces')
            }
          } else {
            fraudStrikes.current = 0
            setStatus('ok')
            setDetail(`Identity verified (dist=${dist.toFixed(2)})`)
          }
        } catch (_) {}
      }, 3000)
    }

    init()

    return () => {
      cancelled = true
      audioCancelledRef.current = true
      clearInterval(detectTimer.current)
      audioCtxRef.current?.close()
    }
  }, [sessionId])

  // Expose startAudioMonitor so parent can call after stream is ready
  useEffect(() => {
    if (videoRef?.current?.srcObject) {
      startAudioMonitor(videoRef.current.srcObject)
    }
  }, [videoRef?.current?.srcObject])

  // ── UI ──────────────────────────────────────────────────────────────────
  const cfg = {
    loading:      { dot: 'bg-gray-400',                label: 'Loading AI proctoring...' },
    ok:           { dot: 'bg-green-400',               label: detail || 'All clear' },
    no_face:      { dot: 'bg-red-500 animate-pulse',   label: detail || 'No face detected!' },
    multi:        { dot: 'bg-orange-500 animate-pulse',label: detail || 'Multiple faces!' },
    impersonator: { dot: 'bg-red-600 animate-pulse',   label: detail || 'Identity mismatch!' },
    audio:        { dot: 'bg-yellow-500 animate-pulse',label: detail || 'Suspicious audio' },
    blocked:      { dot: 'bg-red-700',                 label: 'BLOCKED — contact admin' },
    unavailable:  { dot: 'bg-gray-300',                label: 'AI unavailable' },
  }
  const c = cfg[status] || cfg.unavailable

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
        <span className={status === 'blocked' ? 'text-red-600 font-semibold' : 'text-gray-500'}>
          {c.label}
        </span>
      </div>
      {status === 'blocked' && (
        <div className="text-xs bg-red-50 border border-red-300 rounded px-2 py-1 text-red-700">
          Your session has been blocked due to a proctoring violation.
          Please contact the exam administrator.
        </div>
      )}
    </div>
  )
}
