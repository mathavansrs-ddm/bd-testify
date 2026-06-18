import { useEffect, useRef } from 'react'

const MODEL_URL = '/models'
let _faceapi = null
let _loadPromise = null

async function getFaceApi() {
  if (_faceapi) return _faceapi
  if (_loadPromise) return _loadPromise
  _loadPromise = (async () => {
    const faceapi = await import('face-api.js')
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    _faceapi = faceapi
    return faceapi
  })()
  return _loadPromise
}

// Call this once after camera is ready to get the reference face descriptor
export async function captureReferenceDescriptor(videoElement) {
  try {
    const faceapi = await getFaceApi()
    const det = await faceapi
      .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()
    return det ? det.descriptor : null
  } catch (e) {
    console.warn('[FaceMonitor] reference capture failed:', e)
    return null
  }
}

// Preload models in background so they're ready when test starts
export function preloadFaceApi() {
  getFaceApi().catch(() => {})
}

export default function FaceMonitor({ stream, referenceDescriptor, onWarn, active }) {
  const videoRef = useRef(null)
  const timerRef = useRef(null)
  const gazeStartRef = useRef(null)
  const readyRef = useRef(false)

  // Attach stream to hidden video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (!active || !stream) return
    readyRef.current = false

    getFaceApi().then(() => {
      readyRef.current = true
      // Run immediately then every 5 seconds
      runDetection()
      timerRef.current = setInterval(runDetection, 5000)
    }).catch(e => console.warn('[FaceMonitor] load failed:', e))

    return () => {
      clearInterval(timerRef.current)
      readyRef.current = false
    }
  }, [active, stream, referenceDescriptor])

  async function runDetection() {
    if (!readyRef.current || !_faceapi || !videoRef.current) return
    const video = videoRef.current
    if (video.readyState < 2) return

    try {
      const det = await _faceapi
        .detectSingleFace(video, new _faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor()

      if (!det) {
        handleGazeAway()
        return
      }

      // Face present — reset gaze timer
      gazeStartRef.current = null

      // Identity check
      if (referenceDescriptor) {
        const dist = _faceapi.euclideanDistance(
          Array.from(referenceDescriptor),
          Array.from(det.descriptor)
        )
        if (dist > 0.55) {
          onWarn?.('face_mismatch', 'Different person detected at camera')
          return
        }
      }

      // Gaze / head pose check
      if (isLookingAway(det.landmarks)) {
        handleGazeAway()
      } else {
        gazeStartRef.current = null
      }
    } catch (e) {
      console.warn('[FaceMonitor] detection error:', e)
    }
  }

  function handleGazeAway() {
    const now = Date.now()
    if (!gazeStartRef.current) {
      gazeStartRef.current = now
    } else if (now - gazeStartRef.current >= 3000) {
      gazeStartRef.current = null
      onWarn?.('gaze_away', 'Candidate appeared to look away from screen')
    }
  }

  function isLookingAway(landmarks) {
    const pts = landmarks.positions
    // Left eye center (pts 36-41), right eye center (pts 42-47), nose tip (pt 30)
    const leftEye = avgPts(pts.slice(36, 42))
    const rightEye = avgPts(pts.slice(42, 48))
    const noseTip = pts[30]
    const faceCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 }
    const eyeDist = Math.abs(rightEye.x - leftEye.x)
    if (eyeDist < 10) return false // face too small / unreliable

    // Horizontal: nose offset from eye midpoint — high means head turned sideways
    const hRatio = Math.abs(noseTip.x - faceCenter.x) / eyeDist
    // Vertical: nose should be significantly below eye level — low ratio means looking up/away
    const vRatio = (noseTip.y - faceCenter.y) / eyeDist

    return hRatio > 0.45 || vRatio < 0.15
  }

  function avgPts(pts) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    }
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: 1, height: 1, top: 0, left: 0 }}
    />
  )
}
