const IST = { timeZone: 'Asia/Kolkata' }

// Backend returns naive UTC datetimes without 'Z' — append it so JS treats them as UTC
function toDate(date) {
  if (!date) return null
  const s = typeof date === 'string' && !date.endsWith('Z') && !date.includes('+') ? date + 'Z' : date
  return new Date(s)
}

export function formatIST(date, opts = {}) {
  const d = toDate(date)
  if (!d) return '—'
  return d.toLocaleString('en-IN', { ...IST, ...opts })
}

export function formatISTTime(date) {
  const d = toDate(date)
  if (!d) return '—'
  return d.toLocaleTimeString('en-IN', IST)
}

export function formatISTDate(date) {
  const d = toDate(date)
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', IST)
}
