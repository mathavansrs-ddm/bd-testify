import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { getMyActivity } from '../services/api'
import { formatIST } from '../utils/dateFormat'
import { Activity } from 'lucide-react'

export default function MyActivity() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyActivity()
      .then(r => setLogs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AdminLayout title="My Activity">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-gray-700">
          <Activity className="w-5 h-5" />
          <h2 className="text-lg font-semibold">My Activity Log</h2>
          <span className="ml-auto text-sm text-gray-400">{logs.length} entries</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No activity recorded yet.</div>
        ) : (
          <div className="bg-white rounded-xl border divide-y">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 capitalize">{log.action.replace(/_/g, ' ')}</p>
                  {log.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{log.detail}</p>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatIST(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
