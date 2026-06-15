import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { startTest, saveAnswer, submitTest, logEvent } from '../services/api'
import QuestionCard from '../components/QuestionCard'
import Timer from '../components/Timer'
import ProgressBar from '../components/ProgressBar'
import WebcamMonitor from '../components/Webcam'
import AntiCheat from '../components/AntiCheat'
import { AlertTriangle, CheckCircle, Camera, Shield, Eye, Clock } from 'lucide-react'

const STEPS = { SYSTEM_CHECK: 'system_check', TEST: 'test', FINISHED: 'finished', ERROR: 'error', SUSPENDED: 'suspended' }
const MAX_WARNINGS = 5

export default function TestRoom() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState(STEPS.SYSTEM_CHECK)
  const [sessionData, setSessionData] = useState(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [warningCount, setWarningCount] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const [warningMsg, setWarningMsg] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [cameraOk, setCameraOk] = useState(false)
  const [checkingCamera, setCheckingCamera] = useState(false)

  const videoRef = useRef(null)
  const tabSwitchCount = useRef(0)
  const lastTabSwitch = useRef(0)

  // Medium-sensitivity anti-cheat
  useEffect(() => {
    if (step !== STEPS.TEST) return

    // Only count tab switches (not window blur which double-fires)
    function handleVisibility() {
      if (document.hidden) {
        const now = Date.now()
        // Debounce: ignore if within 2 seconds of last switch
        if (now - lastTabSwitch.current < 2000) return
        lastTabSwitch.current = now
        tabSwitchCount.current += 1
        reportEvent('tab_switch')
        showWarningOverlay('Tab switch detected! Stay on the test page.')
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
      setWarningCount(r.data.warning_count)
      if (r.data.warning_count >= MAX_WARNINGS || r.data.suspended) autoSuspend()
    } catch {}
  }

  // countAsViolation=true means it logs to backend, false means just show UI warning
  function showWarningOverlay(msg, countAsViolation = true) {
    setWarningMsg(msg)
    setShowWarning(true)
    setTimeout(() => setShowWarning(false), 5000)
  }

  function autoSuspend() {
    setStep(STEPS.SUSPENDED)
    toast.error('Your test has been suspended due to violations.')
    if (document.fullscreenElement) document.exitFullscreen()
  }

  async function checkCamera() {
    setCheckingCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraOk(true)
      toast.success('Camera and microphone ready!')
    } catch {
      toast.error('Camera or microphone access denied. Please allow access and try again.')
    } finally {
      setCheckingCamera(false)
    }
  }

  async function startTestSession() {
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      toast.error('Please allow fullscreen access to start the test.')
      return
    }
    try {
      const r = await startTest(token)
      setSessionData(r.data)
      setStep(STEPS.TEST)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start test. Please check your invite link.')
      setStep(STEPS.ERROR)
    }
  }

  const handleAnswer = useCallback(async (option) => {
    if (!sessionData) return
    const q = sessionData.questions[currentQ]
    setAnswers((prev) => ({ ...prev, [q.id]: option }))
    try {
      await saveAnswer({ session_id: sessionData.session_id, question_id: q.id, selected_option: option })
    } catch {}
  }, [sessionData, currentQ])

  async function handleSubmit() {
    setShowConfirm(false)
    setSubmitting(true)
    try {
      const r = await submitTest(sessionData.session_id)
      setResult(r.data)
      setStep(STEPS.FINISHED)
      if (document.fullscreenElement) document.exitFullscreen()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submit failed. Please try again.')
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
            {/* Camera preview */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center mb-4 shadow-inner">
              {cameraOk ? (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-white/40 p-6">
                  <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Your camera preview will appear here</p>
                </div>
              )}
            </div>

            {/* Camera status */}
            <div className={`flex items-center gap-3 p-4 rounded-xl border mb-6 ${cameraOk ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
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

            <button onClick={startTestSession} disabled={!cameraOk}
              className={`w-full py-4 rounded-2xl font-semibold text-base transition ${
                cameraOk
                  ? 'bg-gradient-to-r from-slate-900 to-blue-900 text-white hover:opacity-90 shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}>
              {cameraOk ? 'Start Test in Fullscreen →' : 'Verify Camera to Continue'}
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
    const questions = sessionData.questions
    const q = questions[currentQ]
    const isLast = currentQ === questions.length - 1
    const answeredCount = Object.keys(answers).length

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col select-none">

        {/* Warning overlay */}
        {showWarning && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-once">
            <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm border border-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Rule Violation — Warning {warningCount}/{MAX_WARNINGS}</p>
                <p className="text-sm opacity-90 mt-0.5">{warningMsg}</p>
                {warningCount >= 3 && (
                  <p className="text-xs mt-1 opacity-75 font-semibold">⚠️ Test will be suspended at {MAX_WARNINGS} warnings!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">BD Testify</p>
              <p className="text-xs text-slate-400">{sessionData.test_set_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Warning indicator */}
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
              warningCount === 0 ? 'bg-green-100 text-green-700'
              : warningCount <= 2 ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'}`}>
              <AlertTriangle className="w-3 h-3" />
              {warningCount}/{MAX_WARNINGS} warnings
            </div>
            <Timer totalMinutes={sessionData.time_limit_minutes} onExpire={handleSubmit} />
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Main question area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Progress */}
              <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
                <span>Question {currentQ + 1} of {questions.length}</span>
                <span className="text-green-600 font-medium">{answeredCount} answered</span>
              </div>
              <ProgressBar current={currentQ + 1} total={questions.length} />

              {/* Question card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <QuestionCard
                  question={q}
                  selectedOption={answers[q.id]}
                  onSelect={handleAnswer}
                  index={currentQ}
                />
              </div>

              {/* Navigation */}
              <div className="flex justify-between gap-3">
                <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 transition">
                  ← Previous
                </button>
                {isLast ? (
                  <button onClick={() => setShowConfirm(true)}
                    className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
                    Submit Test ✓
                  </button>
                ) : (
                  <button onClick={() => setCurrentQ(currentQ + 1)}
                    className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition">
                    Next →
                  </button>
                )}
              </div>

              {/* Question navigator */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">Question Navigator</p>
                <div className="flex flex-wrap gap-2">
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
                <div className="flex gap-4 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Answered</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-900 inline-block" /> Current</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border inline-block" /> Unanswered</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar — camera & stats */}
          <div className="w-56 bg-white border-l border-slate-200 p-4 flex flex-col gap-4 shadow-sm">
            {/* Camera */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Live Camera</p>
              <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
                <WebcamMonitor videoRef={videoRef} />
              </div>
            </div>

            <AntiCheat
              sessionId={sessionData.session_id}
              videoRef={videoRef}
              onBlock={(reason) => {
                showWarningOverlay(`BLOCKED: ${reason}`)
                setStep(STEPS.SUSPENDED)
                if (document.fullscreenElement) document.exitFullscreen()
              }}
            />

            {/* Stats */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Warnings</span>
                <span className={`font-bold ${warningCount >= 3 ? 'text-red-600' : 'text-slate-700'}`}>{warningCount}/{MAX_WARNINGS}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Answered</span>
                <span className="font-bold text-slate-700">{answeredCount}/{questions.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Question</span>
                <span className="font-bold text-slate-700">{currentQ + 1}/{questions.length}</span>
              </div>
            </div>

            {/* Warning level bar */}
            <div>
              <p className="text-xs text-slate-400 mb-1">Violation level</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  warningCount === 0 ? 'bg-green-400'
                  : warningCount <= 2 ? 'bg-yellow-400'
                  : 'bg-red-500'}`}
                  style={{ width: `${(warningCount / MAX_WARNINGS) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Submit confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Submit Test?</h3>
              <p className="text-slate-500 mb-2">
                You've answered <strong className="text-slate-800">{answeredCount}</strong> of <strong className="text-slate-800">{questions.length}</strong> questions.
              </p>
              {answeredCount < questions.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-700">
                  ⚠️ {questions.length - answeredCount} question(s) unanswered — they will be marked as wrong.
                </div>
              )}
              <p className="text-slate-400 text-sm mb-6">Once submitted, you cannot change your answers.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">
                  Review Answers
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
                  {submitting ? 'Submitting…' : 'Yes, Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
