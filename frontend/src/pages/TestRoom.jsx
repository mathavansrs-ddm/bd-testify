import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { startTest, saveAnswer, submitTest, logEvent, uploadSnapshot, uploadPhoto } from '../services/api'
import QuestionCard from '../components/QuestionCard'
import Timer from '../components/Timer'
import ProgressBar from '../components/ProgressBar'
import WebcamMonitor from '../components/Webcam'
import AntiCheat from '../components/AntiCheat'
import FaceMonitor, { captureReferenceDescriptor, preloadFaceApi } from '../components/FaceMonitor'
import { AlertTriangle, CheckCircle, Camera, Shield, Eye, Clock, RefreshCw, X, Layers } from 'lucide-react'

const STEPS = { SYSTEM_CHECK: 'system_check', TEST: 'test', FINISHED: 'finished', ERROR: 'error', SUSPENDED: 'suspended' }
const MAX_WARNINGS = 5

export default function TestRoom() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState(STEPS.SYSTEM_CHECK)
  const [sessionData, setSessionData] = useState(null)
  const [currentSection, setCurrentSection] = useState(0)  // index into sections array
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [warningCount, setWarningCount] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const [warningMsg, setWarningMsg] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showNavModal, setShowNavModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [startingTest, setStartingTest] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [cameraOk, setCameraOk] = useState(false)
  const [checkingCamera, setCheckingCamera] = useState(false)
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState(null)

  const [liveStream, setLiveStream] = useState(null)
  const [referenceDescriptor, setReferenceDescriptor] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const snapshotTimer = useRef(null)
  const streamRef = useRef(null)
  const tabSwitchCount = useRef(0)
  const lastTabSwitch = useRef(0)

  // Medium-sensitivity anti-cheat
  useEffect(() => {
    if (step !== STEPS.TEST) return

    // Only flag tab switch if hidden for more than 5 seconds
    // This avoids penalising phone calls, OS notifications, accidental swipes
    let hiddenTimer = null
    function handleVisibility() {
      if (document.hidden) {
        const now = Date.now()
        if (now - lastTabSwitch.current < 3000) return // debounce rapid re-triggers
        hiddenTimer = setTimeout(() => {
          // Still hidden after 5s → real tab switch
          lastTabSwitch.current = Date.now()
          tabSwitchCount.current += 1
          reportEvent('tab_switch')
          showWarningOverlay('Tab switch detected! Return to the test immediately.')
        }, 5000)
      } else {
        // Returned within 5s → cancel, no penalty
        clearTimeout(hiddenTimer)
      }
    }

    // Block only clear cheating shortcuts (not Ctrl+C for normal use)
    function handleKeyDown(e) {
      const blocked = (
        (e.ctrlKey && ['u'].includes(e.key.toLowerCase())) || // view source
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j'].includes(e.key.toLowerCase())) // devtools
      )
      if (blocked) {
        e.preventDefault()
        reportEvent('copy_attempt')
        showWarningOverlay('Developer tools are not allowed during the test.')
      }
    }

    // Fullscreen exit: just show a warning, don't count as violation immediately
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        showWarningOverlay('Please stay in fullscreen mode.', false)
        setTimeout(() => {
          document.documentElement.requestFullscreen().catch(() => {})
        }, 1000)
      }
    }

    function handleContextMenu(e) { e.preventDefault() }

    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [step, sessionData])

  async function reportEvent(eventType) {
    if (!sessionData) return
    try {
      const r = await logEvent({ session_id: sessionData.session_id, event_type: eventType })
      const wc = r.data.warning_count
      setWarningCount(wc)
      // At 4/5 — loud last-chance alert prompting candidate to submit
      if (wc === MAX_WARNINGS - 1) {
        showWarningOverlay(`⚠️ FINAL WARNING (${wc}/${MAX_WARNINGS}) — One more violation will suspend your test! Submit now if done.`, true)
      }
      if (r.data.warning_count >= MAX_WARNINGS || r.data.suspended) autoSuspend()
    } catch {}
  }

  function showWarningOverlay(msg) {
    setWarningMsg(msg)
    setShowWarning(true)
    // Don't auto-dismiss — candidate must click "Continue Test"
  }

  function autoSuspend() {
    clearInterval(snapshotTimer.current)
    setStep(STEPS.SUSPENDED)
    toast.error('Your test has been suspended due to violations.')
    if (document.fullscreenElement) document.exitFullscreen()
  }

  // Reattach stream whenever the video element remounts (step change, photo capture, etc.)
  useEffect(() => {
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [step, cameraOk, photoCaptured])

  // Stop camera tracks when test ends to release browser camera indicator
  useEffect(() => {
    if (step === STEPS.FINISHED || step === STEPS.SUSPENDED || step === STEPS.ERROR) {
      clearInterval(snapshotTimer.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [step])

  async function checkCamera() {
    setCheckingCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      setLiveStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraOk(true)
      toast.success('Camera and microphone ready!')
      preloadFaceApi()
    } catch {
      toast.error('Camera or microphone access denied. Please allow access and try again.')
    } finally {
      setCheckingCamera(false)
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    setPhotoDataUrl(dataUrl)
    setPhotoCaptured(true)
    // Capture reference face descriptor for identity matching during test
    captureReferenceDescriptor(video).then(desc => {
      if (desc) setReferenceDescriptor(desc)
    })
  }

  function sendSnapshot(sessionId) {
    const video = videoRef.current
    if (!video || !sessionId) return
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    canvas.getContext('2d').drawImage(video, 0, 0, 320, 240)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5)
    uploadSnapshot({ session_id: sessionId, image: dataUrl }).catch(() => {})
  }

  async function startTestSession() {
    setStartingTest(true)
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      toast.error('Please allow fullscreen access to start the test.')
      setStartingTest(false)
      return
    }
    try {
      const r = await startTest(token)
      setSessionData(r.data)
      const sid = r.data.session_id

      // Upload pre-test photo — retry once on failure so it isn't silently lost
      if (photoDataUrl) {
        uploadPhoto({ session_id: sid, image: photoDataUrl }).catch(() => {
          setTimeout(() => uploadPhoto({ session_id: sid, image: photoDataUrl }).catch(() => {}), 3000)
        })
      }

      // Step first so WebcamMonitor mounts and videoRef is attached before first snapshot
      setStep(STEPS.TEST)

      // Small delay lets React commit the new video element before we read it
      setTimeout(() => {
        sendSnapshot(sid)
        snapshotTimer.current = setInterval(() => sendSnapshot(sid), 5000)
      }, 500)
    } catch (err) {
      if (document.fullscreenElement) document.exitFullscreen()
      const msg = err.response?.data?.detail || 'Failed to start test.'
      // Don't hard-navigate to ERROR for network hiccups — show toast and let candidate retry
      if (err.response?.status === 400 || err.response?.status === 403 || err.response?.status === 404) {
        setError(msg)
        setStep(STEPS.ERROR)
      } else {
        toast.error(msg + ' Please try again.')
      }
    } finally {
      setStartingTest(false)
    }
  }

  // Returns the active question list (section-aware)
  function activeQuestions() {
    if (!sessionData) return []
    const secs = sessionData.sections
    if (secs && secs.length > 0) return secs[currentSection]?.questions || []
    return sessionData.questions
  }

  const handleAnswer = useCallback(async (option) => {
    if (!sessionData) return
    const qs = sessionData.sections?.length > 0
      ? sessionData.sections[currentSection]?.questions || []
      : sessionData.questions
    const q = qs[currentQ]
    if (!q) return
    setAnswers((prev) => ({ ...prev, [q.id]: option }))
    try {
      await saveAnswer({ session_id: sessionData.session_id, question_id: q.id, selected_option: option })
    } catch {}
  }, [sessionData, currentQ, currentSection])

  async function handleSubmit() {
    if (step !== STEPS.TEST || submitting) return
    setShowConfirm(false)
    setSubmitting(true)
    clearInterval(snapshotTimer.current)
    try {
      const r = await submitTest(sessionData.session_id)
      setResult(r.data)
      setStep(STEPS.FINISHED)
      if (document.fullscreenElement) document.exitFullscreen()
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.detail || 'Submit failed. Please try again.'
      if (status === 403) {
        // Session was suspended (e.g., admin action mid-test)
        setStep(STEPS.SUSPENDED)
        if (document.fullscreenElement) document.exitFullscreen()
      } else {
        toast.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── System Check ─────────────────────────────────────────────
  if (step === STEPS.SYSTEM_CHECK) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-8 py-6 text-white">
            <div className="flex items-center gap-3 mb-1">
              <Shield className="w-6 h-6 text-blue-300" />
              <h1 className="text-xl font-bold">BD Testify</h1>
            </div>
            <p className="text-white/60 text-sm">System check before your assessment</p>
          </div>

          <div className="p-8">
            {/* Camera preview / captured photo */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center mb-4 shadow-inner relative">
              {/* Always keep video in DOM so stream stays attached */}
              {!cameraOk && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                  <Camera className="w-12 h-12 mb-3 opacity-40" />
                  <p className="text-sm">Your camera preview will appear here</p>
                </div>
              )}
              <video ref={videoRef} autoPlay muted playsInline
                className={`w-full h-full object-cover ${photoCaptured ? 'hidden' : ''}`} />
              {photoCaptured && photoDataUrl && (
                <>
                  <img src={photoDataUrl} alt="Captured" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Photo captured
                  </div>
                </>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {/* Camera status */}
            <div className={`flex items-center gap-3 p-4 rounded-xl border mb-3 ${cameraOk ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <Camera className={`w-5 h-5 flex-shrink-0 ${cameraOk ? 'text-green-600' : 'text-amber-500'}`} />
              <span className={`text-sm font-medium flex-1 ${cameraOk ? 'text-green-700' : 'text-amber-700'}`}>
                {cameraOk ? '✓ Camera & microphone verified' : 'Camera & microphone check required'}
              </span>
              {!cameraOk && (
                <button onClick={checkCamera} disabled={checkingCamera}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition">
                  {checkingCamera ? 'Checking…' : 'Verify Now'}
                </button>
              )}
            </div>

            {/* Photo capture */}
            {cameraOk && (
              <div className={`flex items-center gap-3 p-4 rounded-xl border mb-3 ${photoCaptured ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
                <Camera className={`w-5 h-5 flex-shrink-0 ${photoCaptured ? 'text-green-600' : 'text-blue-500'}`} />
                <span className={`text-sm font-medium flex-1 ${photoCaptured ? 'text-green-700' : 'text-blue-700'}`}>
                  {photoCaptured ? '✓ Identity photo captured' : 'Capture your photo for identity verification'}
                </span>
                <button onClick={capturePhoto}
                  className={`text-white text-sm font-medium py-1.5 px-4 rounded-lg transition flex items-center gap-1 ${photoCaptured ? 'bg-slate-400 hover:bg-slate-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {photoCaptured ? <><RefreshCw className="w-3 h-3" /> Retake</> : 'Capture'}
                </button>
              </div>
            )}

            {/* Rules */}
            <div className="bg-slate-50 rounded-2xl p-5 mb-6">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" /> Test Rules
              </h3>
              <ul className="text-sm text-slate-600 space-y-2">
                {[
                  'Test runs in fullscreen — do not exit',
                  'Do not switch tabs or open other windows',
                  'Keep your face clearly visible to the camera',
                  `${MAX_WARNINGS} violations will suspend your test automatically`,
                  'Right-click and developer tools are disabled',
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">{i + 1}.</span> {rule}
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={startTestSession} disabled={!cameraOk || !photoCaptured || startingTest}
              className={`w-full py-4 rounded-2xl font-semibold text-base transition ${
                cameraOk && photoCaptured && !startingTest
                  ? 'bg-gradient-to-r from-slate-900 to-blue-900 text-white hover:opacity-90 shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}>
              {startingTest
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Starting test…</span>
                : !cameraOk ? 'Verify Camera to Continue'
                : !photoCaptured ? 'Capture Photo to Continue'
                : 'Start Test in Fullscreen →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────
  if (step === STEPS.ERROR) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow p-10 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Start Test</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  // ── Suspended ─────────────────────────────────────────────────
  if (step === STEPS.SUSPENDED) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow p-10 max-w-md text-center border-t-4 border-red-500">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Test Suspended</h2>
          <p className="text-gray-500">Your test has been suspended due to multiple rule violations. Please contact your exam administrator for assistance.</p>
        </div>
      </div>
    )
  }

  // ── Finished ──────────────────────────────────────────────────
  if (step === STEPS.FINISHED && result) {
    const passed = result.pass_fail === 'Pass'
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${passed ? 'bg-green-100' : 'bg-red-100'}`}>
            {passed
              ? <CheckCircle className="w-12 h-12 text-green-600" />
              : <AlertTriangle className="w-12 h-12 text-red-500" />}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            {passed ? 'Congratulations!' : 'Test Completed'}
          </h1>
          <p className="text-gray-500 mb-8">
            {passed ? 'You have passed the assessment!' : 'Thank you for taking the assessment.'}
          </p>
          <div className="bg-slate-50 rounded-2xl p-6 mb-6">
            <p className="text-6xl font-bold text-slate-900 mb-1">{result.score}<span className="text-3xl text-slate-400">/{result.total}</span></p>
            <p className="text-2xl text-slate-500 mb-3">{result.percentage?.toFixed(1)}%</p>
            <span className={`inline-block px-6 py-2 rounded-full text-sm font-bold ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {result.pass_fail}
            </span>
          </div>
          <p className="text-sm text-gray-400">Your result has been sent to your email. The administrator will review your session.</p>
        </div>
      </div>
    )
  }

  // ── Main Test UI ──────────────────────────────────────────────
  if (step === STEPS.TEST && sessionData) {
    const hasSections = sessionData.sections && sessionData.sections.length > 0
    const sections = sessionData.sections || []
    const questions = activeQuestions()
    const q = questions[currentQ]
    const isLastQ = currentQ === questions.length - 1
    const isLastSection = currentSection === sections.length - 1
    const isLast = hasSections ? (isLastQ && isLastSection) : isLastQ
    const answeredCount = Object.keys(answers).length
    const totalQuestions = hasSections
      ? sections.reduce((sum, s) => sum + s.questions.length, 0)
      : sessionData.questions.length

    // When on sections mode, timer is per section; otherwise full test
    const currentTimerMinutes = hasSections
      ? (sections[currentSection]?.time_limit_minutes || sessionData.time_limit_minutes)
      : sessionData.time_limit_minutes

    function advanceSection() {
      if (!isLastSection) {
        setCurrentSection(s => s + 1)
        setCurrentQ(0)
      } else {
        handleSubmit()
      }
    }

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col select-none">

        {/* Submitting overlay */}
        {submitting && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white text-lg font-semibold">Submitting your test…</p>
            <p className="text-white/60 text-sm">Please wait, do not close this tab</p>
          </div>
        )}

        {/* Warning modal — candidate must acknowledge */}
        {showWarning && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
              {/* Red header */}
              <div className={`px-6 pt-6 pb-4 ${warningCount >= MAX_WARNINGS - 1 ? 'bg-red-600' : 'bg-orange-500'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg leading-tight">
                      Warning {warningCount}/{MAX_WARNINGS}
                    </p>
                    <p className="text-white/80 text-xs mt-0.5">Proctoring violation detected</p>
                  </div>
                </div>
              </div>
              {/* Body */}
              <div className="px-6 py-4">
                <p className="text-gray-700 text-sm">{warningMsg}</p>
                {warningCount >= MAX_WARNINGS - 1 && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
                    ⚠️ One more violation will suspend your test permanently!
                  </div>
                )}
                {/* Violation bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Violation level</span>
                    <span>{warningCount}/{MAX_WARNINGS}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${warningCount <= 2 ? 'bg-yellow-400' : warningCount <= 3 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${(warningCount / MAX_WARNINGS) * 100}%` }} />
                  </div>
                </div>
              </div>
              {/* Continue button */}
              <div className="px-6 pb-6">
                <button onClick={() => setShowWarning(false)}
                  className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-700 text-white font-semibold text-sm transition">
                  I Understand — Continue Test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Top header ── */}
        <header className="bg-white border-b border-slate-200 px-3 md:px-6 py-2 md:py-3 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">BD Testify</p>
              <p className="text-xs text-slate-400 hidden md:block">{sessionData.test_set_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasSections && (
              <span className="hidden md:flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                <Layers className="w-3 h-3" />
                {sections[currentSection]?.name} ({currentSection + 1}/{sections.length})
              </span>
            )}
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              warningCount === 0 ? 'bg-green-100 text-green-700'
              : warningCount <= 2 ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'}`}>
              <AlertTriangle className="w-3 h-3" />
              {warningCount}/{MAX_WARNINGS}
            </div>
            <Timer key={`${currentSection}`} totalMinutes={currentTimerMinutes} onExpire={hasSections ? advanceSection : handleSubmit} />
          </div>
        </header>

        {/* Section banner */}
        {hasSections && (
          <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between text-sm">
            <span className="font-semibold">{sections[currentSection]?.name}</span>
            <span className="text-slate-400">{questions.length} questions · {currentTimerMinutes} min</span>
          </div>
        )}

        {/* ── DESKTOP 3-column layout (md+) ── */}
        <div className="hidden md:flex flex-1 overflow-hidden">

          {/* Left — navigator */}
          <div className="w-52 bg-white border-r border-slate-200 p-4 flex flex-col gap-3 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {hasSections ? sections[currentSection]?.name : 'Questions'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((question, i) => (
                <button key={i} onClick={() => setCurrentQ(i)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition ${
                    i === currentQ ? 'bg-slate-900 text-white shadow'
                    : answers[question.id] ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Answered ({answeredCount})</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 border inline-block" /> Unanswered ({totalQuestions - answeredCount})</span>
            </div>
            {hasSections && !isLastSection ? (
              <button onClick={() => { setCurrentSection(s => s + 1); setCurrentQ(0) }}
                className="mt-auto w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
                Next Section →
              </button>
            ) : (
              <button onClick={() => setShowConfirm(true)}
                className="mt-auto w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">
                Submit Test ✓
              </button>
            )}
          </div>

          {/* Center — question */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Question {currentQ + 1} of {questions.length}</span>
                <span className="text-green-600 font-medium">{answeredCount}/{totalQuestions} answered</span>
              </div>
              <ProgressBar current={currentQ + 1} total={questions.length} />
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <QuestionCard question={q} selectedOption={answers[q.id]} onSelect={handleAnswer} index={currentQ} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 transition">
                  ← Previous
                </button>
                {isLastQ && hasSections && !isLastSection ? (
                  <button onClick={() => { setCurrentSection(s => s + 1); setCurrentQ(0) }}
                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition">
                    Next Section →
                  </button>
                ) : isLastQ ? (
                  <button onClick={() => setShowConfirm(true)}
                    className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
                    Submit ✓
                  </button>
                ) : (
                  <button onClick={() => setCurrentQ(q => q + 1)}
                    className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition">
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right — camera & stats */}
          <div className="w-52 bg-white border-l border-slate-200 p-4 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Live Camera</p>
              <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
                <WebcamMonitor stream={liveStream} />
              </div>
            </div>
            {/* AntiCheat rendered here for desktop — hidden on mobile via parent div but still active */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Warnings</span><span className={`font-bold ${warningCount >= 3 ? 'text-red-600' : ''}`}>{warningCount}/{MAX_WARNINGS}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Answered</span><span className="font-bold">{answeredCount}/{totalQuestions}</span></div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Violation level</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${warningCount === 0 ? 'bg-green-400' : warningCount <= 2 ? 'bg-yellow-400' : 'bg-red-500'}`}
                  style={{ width: `${(warningCount / MAX_WARNINGS) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── MOBILE layout (below md) ── */}
        <div className="flex md:hidden flex-col flex-1 overflow-hidden">
          {/* Question area — full width, scrollable */}
          <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Q {currentQ + 1}/{questions.length}</span>
              <span className="text-green-600 font-medium">{answeredCount}/{totalQuestions} answered</span>
            </div>
            <ProgressBar current={currentQ + 1} total={questions.length} />
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-3">
              <QuestionCard question={q} selectedOption={answers[q.id]} onSelect={handleAnswer} index={currentQ} />
            </div>
          </div>

          {/* Floating camera — small, top-right corner, non-blocking */}
          {/* AntiCheat is NOT duplicated here — it runs once in the desktop layout which is always in DOM */}
          <div className="fixed top-14 right-2 w-24 z-30 rounded-xl overflow-hidden shadow-lg border border-slate-600">
            <WebcamMonitor stream={liveStream} />
          </div>

          {/* Fixed bottom nav bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-3 py-2 z-20 shadow-lg">
            {/* Submit bar — shows whenever all questions answered */}
            {answeredCount === questions.length && (
              <button onClick={() => setShowConfirm(true)}
                className="w-full mb-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold">
                ✓ All Answered — Submit Test
              </button>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40">
                ← Prev
              </button>
              <button onClick={() => setShowNavModal(true)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">
                {currentQ + 1}/{questions.length}
              </button>
              {isLastQ && hasSections && !isLastSection ? (
                <button onClick={() => { setCurrentSection(s => s + 1); setCurrentQ(0) }}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                  Next Section →
                </button>
              ) : isLastQ ? (
                <button onClick={() => setShowConfirm(true)}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold">
                  Submit ✓
                </button>
              ) : (
                <button onClick={() => setCurrentQ(q => q + 1)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile question navigator modal */}
        {showNavModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:hidden" onClick={() => setShowNavModal(false)}>
            <div className="bg-white w-full rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <p className="font-semibold text-slate-800">Question Navigator</p>
                <button onClick={() => setShowNavModal(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {questions.map((question, i) => (
                  <button key={i} onClick={() => { setCurrentQ(i); setShowNavModal(false) }}
                    className={`w-10 h-10 rounded-xl text-sm font-semibold transition ${
                      i === currentQ ? 'bg-slate-900 text-white'
                      : answers[question.id] ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                    }`}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 text-xs text-slate-400 mb-4">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Answered ({answeredCount})</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border inline-block" /> Left ({questions.length - answeredCount})</span>
              </div>
              <button onClick={() => { setShowNavModal(false); setShowConfirm(true) }}
                className="w-full py-3 rounded-2xl bg-green-600 text-white font-semibold">
                Submit Test ✓
              </button>
            </div>
          </div>
        )}

        {/* Submit confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Submit Test?</h3>
              <p className="text-slate-500 mb-2">
                You've answered <strong className="text-slate-800">{answeredCount}</strong> of <strong className="text-slate-800">{questions.length}</strong> questions.
              </p>
              {answeredCount < questions.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-700">
                  ⚠️ {questions.length - answeredCount} unanswered — will be marked wrong.
                </div>
              )}
              <p className="text-slate-400 text-sm mb-5">Once submitted, you cannot change your answers.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium">
                  Review
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
                  {submitting ? 'Submitting…' : 'Yes, Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FaceMonitor — identity matching + gaze tracking */}
        <FaceMonitor
          stream={liveStream}
          referenceDescriptor={referenceDescriptor}
          active={true}
          onWarn={async (type, msg) => {
            showWarningOverlay(msg)
            try {
              const res = await logEvent({ session_id: sessionData.session_id, event_type: type })
              if (res.data?.warning_count !== undefined) setWarningCount(res.data.warning_count)
              if (res.data?.blocked) {
                showWarningOverlay('BLOCKED: Too many violations')
                clearInterval(snapshotTimer.current)
              }
            } catch (_) {}
          }}
        />

        {/* AntiCheat — single instance, outside layout divs, always active during test */}
        <AntiCheat
          sessionId={sessionData.session_id}
          videoRef={videoRef}
          onWarn={(count, msg) => {
            setWarningCount(count)
            if (msg) showWarningOverlay(msg)
          }}
          onBlock={(reason) => {
            showWarningOverlay(`BLOCKED: ${reason}`)
            clearInterval(snapshotTimer.current)
            setStep(STEPS.SUSPENDED)
            if (document.fullscreenElement) document.exitFullscreen()
          }}
        />
      </div>
    )
  }

  return null
}
