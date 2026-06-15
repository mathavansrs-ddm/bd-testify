import { useEffect, useState } from 'react'
import { Send, QrCode, Download, RefreshCw, Users, Link, Copy, CheckCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { sendInvite, bulkSendInvites, generateQR, getInviteHistory, getTestSets } from '../services/api'
import { formatIST } from '../utils/dateFormat'

const STATUS_COLOR = { pending: 'badge-invited', used: 'badge-submitted', expired: 'badge-suspended' }

export default function InviteManager() {
  const [tab, setTab] = useState('single')
  const [testSets, setTestSets] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [qrImage, setQrImage] = useState(null)
  const [copiedToken, setCopiedToken] = useState(null)

  // Single invite
  const [email, setEmail] = useState('')
  const [testSetId, setTestSetId] = useState('')

  // Bulk invite
  const [bulkEmails, setBulkEmails] = useState('')
  const [bulkTestSetId, setBulkTestSetId] = useState('')
  const [bulkResult, setBulkResult] = useState(null)

  useEffect(() => {
    getTestSets()
      .then((r) => {
        setTestSets(r.data)
        if (r.data.length > 0) { setTestSetId(r.data[0].id); setBulkTestSetId(r.data[0].id) }
      })
      .catch(() => {})
    loadHistory()
  }, [])

  async function loadHistory() {
    try { const r = await getInviteHistory(); setHistory(r.data) } catch {}
  }

  async function handleSingle(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await sendInvite({ candidate_email: email.trim(), test_set_id: +testSetId })
      if (r.data.email_sent === false) {
        toast.error(`Email delivery failed — copy the link from Invite History to share manually.`, { duration: 8000 })
      } else {
        toast.success(`Invite sent to ${email}`)
      }
      setEmail('')
      loadHistory()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send invite') }
    finally { setLoading(false) }
  }

  async function handleBulk(e) {
    e.preventDefault()
    const emails = bulkEmails.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (!emails.length) { toast.error('Enter at least one email'); return }
    setLoading(true)
    setBulkResult(null)
    try {
      const r = await bulkSendInvites({ emails, test_set_id: +bulkTestSetId })
      setBulkResult(r.data)
      toast.success(`Sent ${r.data.sent.length} invite(s)${r.data.failed.length ? `, ${r.data.failed.length} failed` : ''}`)
      loadHistory()
    } catch (err) { toast.error(err.response?.data?.detail || 'Bulk send failed') }
    finally { setLoading(false) }
  }

  const [qrTestSetId, setQrTestSetId] = useState('')
  const [qrCandidateType, setQrCandidateType] = useState('')

  async function handleGenerateQR() {
    setLoading(true)
    try {
      const r = await generateQR(qrTestSetId ? +qrTestSetId : null, qrCandidateType || null)
      setQrImage(r.data.qr_image)
    }
    catch { toast.error('Failed to generate QR') }
    finally { setLoading(false) }
  }

  function copyLink(token) {
    navigator.clipboard.writeText(`${window.location.origin}/register?token=${token}`)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const TABS = [
    { id: 'single', label: 'Single Invite', icon: Send },
    { id: 'bulk', label: 'Bulk Invite', icon: Users },
    { id: 'qr', label: 'QR Code', icon: QrCode },
  ]

  return (
    <AdminLayout title="Invite Manager">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── Single invite ─────────────────────────────────── */}
        {tab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-1">Send Invite</h3>
              <p className="text-xs text-gray-400 mb-4">
                The candidate does <strong>not</strong> need to be pre-registered.
                They will fill their details when they open the link.
              </p>
              <form onSubmit={handleSingle} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Email</label>
                  <input type="email" className="input-field" placeholder="candidate@email.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Set</label>
                  <select className="input-field" value={testSetId}
                    onChange={(e) => setTestSetId(e.target.value)} required>
                    <option value="">Select test…</option>
                    {testSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.set_name} ({s.time_limit_minutes}min, {s.max_attempts} attempt{s.max_attempts !== 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" /> {loading ? 'Sending…' : 'Send Invite'}
                </button>
              </form>
            </div>

            {/* History */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800">Invite History</h3>
                <button onClick={loadHistory} className="text-gray-400 hover:text-gray-600">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.length === 0 && <p className="text-gray-400 text-sm">No invites sent yet</p>}
                {history.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-400">{inv.candidate_name} · {formatIST(inv.sent_at)}</p>
                    </div>
                    <span className={STATUS_COLOR[inv.status] || 'badge-invited'}>{inv.status}</span>
                    {inv.status === 'pending' && (
                      <button onClick={() => copyLink(inv.token)} title="Copy invite link"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded flex-shrink-0">
                        {copiedToken === inv.token ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Bulk invite ──────────────────────────────────── */}
        {tab === 'bulk' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-1">Bulk Invite</h3>
              <p className="text-xs text-gray-400 mb-4">
                Paste emails separated by commas, semicolons, or new lines.
                Candidates do not need to be pre-registered.
              </p>
              <form onSubmit={handleBulk} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Addresses</label>
                  <textarea className="input-field min-h-40 font-mono text-xs"
                    placeholder={"arjun@college.com\npriya@company.com\nravi@example.com"}
                    value={bulkEmails} onChange={(e) => setBulkEmails(e.target.value)} required />
                  <p className="text-xs text-gray-400 mt-1">
                    {bulkEmails.split(/[\n,;]+/).filter(s => s.trim()).length} email(s) entered
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Set</label>
                  <select className="input-field" value={bulkTestSetId}
                    onChange={(e) => setBulkTestSetId(e.target.value)} required>
                    <option value="">Select test…</option>
                    {testSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.set_name} ({s.time_limit_minutes}min)
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" /> {loading ? 'Sending…' : 'Send All Invites'}
                </button>
              </form>
            </div>

            {bulkResult && (
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-4">Bulk Send Results</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{bulkResult.sent.length}</p>
                    <p className="text-xs text-green-600">Sent</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{bulkResult.failed.length}</p>
                    <p className="text-xs text-red-500">Failed</p>
                  </div>
                </div>
                {bulkResult.failed.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Failed Emails:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {bulkResult.failed.map((f, i) => (
                        <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-3 py-2">
                          <span className="font-medium text-red-700">{f.email}</span>
                          <span className="text-red-500 ml-2">— {f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── QR Code ──────────────────────────────────────── */}
        {tab === 'qr' && (
          <div className="card max-w-md">
            <h3 className="font-semibold text-gray-800 mb-2">QR Code Registration</h3>
            <p className="text-sm text-gray-500 mb-4">
              Candidates scan this QR, fill their details, and go directly to the selected test.
            </p>
            {!qrImage ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['', 'Both (ask on scan)'], ['student', 'Student only'], ['employee', 'Employee only']].map(([val, label]) => (
                      <button key={val} onClick={() => setQrCandidateType(val)}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${qrCandidateType === val ? 'bg-slate-900 text-white border-slate-900' : 'border-gray-200 text-gray-600 hover:border-slate-400'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Test (optional)</label>
                  <select className="input-field" value={qrTestSetId} onChange={(e) => setQrTestSetId(e.target.value)}>
                    <option value="">— Any active test —</option>
                    {testSets.map((s) => (
                      <option key={s.id} value={s.id}>{s.set_name} ({s.time_limit_minutes} min)</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleGenerateQR} disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  <QrCode className="w-4 h-4" /> {loading ? 'Generating…' : 'Generate QR Code'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {qrTestSetId && (
                    <span className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1 text-xs text-blue-700">
                      Test: <strong>{testSets.find(s => s.id == qrTestSetId)?.set_name}</strong>
                    </span>
                  )}
                  {qrCandidateType && (
                    <span className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1 text-xs text-purple-700">
                      Type: <strong className="capitalize">{qrCandidateType}</strong> only
                    </span>
                  )}
                </div>
                <div className="border-2 border-gray-100 rounded-xl p-4 text-center bg-white">
                  <img src={qrImage} alt="QR Code" className="mx-auto" style={{ maxWidth: 280 }} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { const a = document.createElement('a'); a.href = qrImage; a.download = 'bd-testify-qr.png'; a.click() }}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Download PNG
                  </button>
                  <button onClick={() => { setQrImage(null); setQrTestSetId(''); setQrCandidateType('') }} className="btn-secondary flex-1">Regenerate</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
