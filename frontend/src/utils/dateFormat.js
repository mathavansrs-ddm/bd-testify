const IST = { timeZone: 'Asia/Kolkata' }

export function formatIST(date, opts = {}) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-IN', { ...IST, ...opts })
}

export function formatISTTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleTimeString('en-IN', IST)
}

export function formatISTDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', IST)
}
