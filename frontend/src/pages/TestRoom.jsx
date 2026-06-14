import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { startTest, saveAnswer, submitTest, logEvent } from '../services/api'
import QuestionCard from '../components/QuestionCard'
import Timer from '../components/Timer'
import ProgressBar from '../components/ProgressBar'
import WebcamMonitor from '../components/Webcam'
import AntiCheat from '../components/AntiCheat'
import { AlertTriangle, CheckCircle, Camera } from 'lucide-react'

const STEPS = { SYSTEM_CHECK: 'system_check', TEST: 'test', FINISHED: 'finished', ERROR: 'error', SUSPENDED: 'suspended' }

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

  // Anti-cheat: fullscreen, tab visibility, keyboard shortcuts
  useEffect(() => {
    if (step !== STEPS.TEST) return

    function handleVisibility() {
      if (document.hidden) {
        tabSwitchCount.current += 1
        reportEvent('tab_switch')
        showWarningOverlay(`Tab switch detected! (${tabSwitchCount.current}/3 allowed)`)
        if (tabSwitchCount.current > 2) {
          autoSuspend()
        }
      }
    }

    function handleBlur() {
      reportEvent('tab_switch')
    }

    function handleContextMenu(e) { e.preventDefault() }

    function handleKeyDown(e) {
      const blocked = (
        (e.ctrlKey && ['c', 'v', 'u', 'a'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
      )
      if (blocked) {
        e.preventDefault()
        reportEvent('copy_attempt')
        showWarningOverlay('Keyboard shortcuts are disabled during the test.')
      }
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        reportEvent('fullscreen_exit')
        showWarningOverlay('Please return to fullscreen mode to continue.')
        document.documentElement.requestFullscreen().catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
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
      if (r.data.suspended) autoSuspend()
    } catch {}
  }

  function showWarningOverlay(msg) {
    setWarningMsg(msg)
    setShowWarning(true)
    setTimeout(() => setShowWarning(false), 4000)
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
      toast.error('Fullscreen is required. Please allow fullscreen access.')
      return
    }

    try {
      const r = await startTest(token)
      setSessionData(r.data)
      setStep(STEPS.TEST)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start test')
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
      toast.error(err.response?.data?.detail || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // System check screen
  if (step === STEPS.SYSTEM_CHECK) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">System Check</h1>
          <p className="text-gray-500 mb-6">Before starting, please verify your system and read the test rules.</p>

          <div className="space-y-4 mb-6">
            {/* Live camera preview */}
            <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              {cameraOk ? (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-white/50 p-6">
                  <Camera className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Camera preview will appear here</p>
                </div>
              )}
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg border ${cameraOk ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
              <Camera className={`w-5 h-5 ${cameraOk ? 'text-green-600' : 'text-orange-500'}`} />
              <span className={`text-sm font-medium ${cameraOk ? 'text-green-700' : 'text-orange-700'}`}>
                {cameraOk ? '✓ Camera & microphone ready' : 'Camera & microphone required — click Test'}
              </span>
              {!cameraOk && (
                <button onClick={checkCamera} disabled={checkingCamera} className="ml-auto text-sm bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 rounded-lg">
                  {checkingCamera ? 'Testing…' : 'Test Now'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-amber-900 mb-2">⚠️ Test Rules</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• The test must be taken in fullscreen mode</li>
              <li>• Do not switch tabs or minimize the browser</li>
              <li>• Keep your face visible to the webcam throughout</li>
              <li>• Right-click and keyboard shortcuts are disabled</li>
              <li>• 3 violations will automatically suspend your test</li>
              <li>• Do not allow others near the screen</li>
            </ul>
          </div>

          <button
            onClick={startTestSession}
            disabled={!cameraOk}
            className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cameraOk ? 'Start Test in Fullscreen →' : 'Test Camera First'}
          </button>
        </div>
      </div>
    )
  }

  if (step === STEPS.ERROR) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (step === STEPS.SUSPENDED) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center border-t-4 border-red-500">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Test Suspended</h2>
          <p className="text-gray-600">Your test has been suspended due to multiple violations of the exam rules. Please contact the administrator for further assistance.</p>
        </div>
      </div>
    )
  }

  if (step === STEPS.FINISHED && result) {
    const passed = result.pass_fail === 'Pass'
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${passed ? 'bg-green-100' : 'bg-red-100'}`}>
            {passed ? <CheckCircle className="w-10 h-10 text-green-600" /> : <AlertTriangle className="w-10 h-10 text-red-500" />}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{passed ? 'Congratulations!' : 'Test Completed'}</h1>
          <p className="text-gray-500 mb-8">{passed ? 'You have passed the assessment!' : 'Thank you for completing the assessment.'}</p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <p className="text-5xl font-bold text-navy-900 mb-2">{result.score}/{result.total}</p>
            <p className="text-2xl text-gray-600">{result.percentage?.toFixed(1)}%</p>
            <span className={`inline-block mt-3 px-4 py-1 rounded-full text-sm font-bold ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {result.pass_fail}
            </span>
          </div>

          <p className="text-sm text-gray-400">Your result has been emailed to you. The administrator will review your session.</p>
        </div>
      </div>
    )
  }

  // Main test UI
  if (step === STEPS.TEST && sessionData) {
    const questions = sessionData.questions
    const q = questions[currentQ]
    const isLast = currentQ === questions.length - 1

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col select-none">
        {/* Warning overlay */}
        {showWarning && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-md">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold">Warning!</p>
              <p className="text-sm">{warningMsg}</p>
              <p className="text-xs mt-1 opacity-80">Warnings: {warningCount}/3</p>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-navy-900 text-lg">BD Testify</h1>
            <p className="text-xs text-gray-400">{sessionData.test_set_name}</p>
          </div>
          <Timer totalMinutes={sessionData.time_limit_minutes} onExpire={handleSubmit} />
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - question */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl mx-auto space-y-6">
              <ProgressBar current={currentQ + 1} total={questions.length} />
              <QuestionCard
                question={q}
                selectedOption={answers[q.id]}
                onSelect={handleAnswer}
                index={currentQ}
              />
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                  className="btn-secondary disabled:opacity-40"
                >
                  ← Previous
                </button>
                {isLast ? (
                  <button onClick={() => setShowConfirm(true)} className="btn-primary">
                    Submit Test →
                  </button>
                ) : (
                  <button onClick={() => setCurrentQ(currentQ + 1)} className="btn-primary">
                    Next →
                  </button>
                )}
              </div>

              {/* Question navigator */}
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-400 mb-3 font-medium">QUESTION NAVIGATOR</p>
                <div className="flex flex-wrap gap-2">
                  {questions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQ(i)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        i === currentQ ? 'bg-navy-900 text-white'
                        : answers[question.id] ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right panel - webcam & AI */}
          <div className="w-64 bg-white border-l border-gray-200 p-4 flex flex-col gap-4">
            <WebcamMonitor videoRef={videoRef} />
            <AntiCheat
              sessionId={sessionData.session_id}
              videoRef={videoRef}
              onBlock={(reason) => {
                showWarningOverlay(`BLOCKED: ${reason}`)
                setStep(STEPS.SUSPENDED)
                if (document.fullscreenElement) document.exitFullscreen()
              }}
            />
            <div className="text-xs text-gray-400 space-y-1">
              <div className="flex justify-between"><span>Warnings</span><span className={warningCount > 1 ? 'text-red-500 font-bold' : ''}>{warningCount}/3</span></div>
              <div className="flex justify-between"><span>Answered</span><span>{Object.keys(answers).length}/{questions.length}</span></div>
            </div>
          </div>
        </div>

        {/* Submit confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-semibold mb-2">Submit Test?</h3>
              <p className="text-gray-500 mb-2">
                You've answered <strong>{Object.keys(answers).length}</strong> of <strong>{questions.length}</strong> questions.
              </p>
              {Object.keys(answers).length < questions.length && (
                <p className="text-amber-600 text-sm mb-4">⚠️ {questions.length - Object.keys(answers).length} question(s) unanswered.</p>
              )}
              <p className="text-gray-500 text-sm mb-6">Once submitted, you cannot change your answers.</p>
              <div className="flex gap-3">
                <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">
                  {submitting ? 'Submitting…' : 'Yes, Submit'}
                </button>
                <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">Review Answers</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
