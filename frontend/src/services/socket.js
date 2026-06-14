// Polling-based live monitoring (WebSocket-ready structure)
const POLL_INTERVAL = 10000 // 10 seconds

class MonitoringPoller {
  constructor() {
    this.listeners = []
    this.intervalId = null
    this.isRunning = false
  }

  start(fetchFn) {
    if (this.isRunning) return
    this.isRunning = true
    const poll = async () => {
      try {
        const data = await fetchFn()
        this.listeners.forEach((fn) => fn(data))
      } catch (e) {
        // silent
      }
    }
    poll()
    this.intervalId = setInterval(poll, POLL_INTERVAL)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
  }

  on(fn) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }
}

export const monitoringPoller = new MonitoringPoller()
