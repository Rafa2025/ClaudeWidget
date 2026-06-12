import { useState, useEffect } from 'react'

export default function StatsBar() {
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    // Single self-scheduling timer guarded by `mounted`: each run queues exactly
    // the next one, so there's never more than one pending timeout and nothing
    // can re-arm after unmount (a shared setInterval handle reassigned from an
    // async callback would leak orphan intervals on unmount mid-fetch).
    let mounted = true
    let id
    const schedule = (ms) => { if (mounted) id = setTimeout(load, ms) }
    async function load() {
      let next = 30_000
      try {
        const res = await fetch('/api/usage')
        if (res.ok) {
          const data = await res.json()
          if (!mounted) return
          setUsage(data)
          if (data.ok) {
            next = 90_000
          } else {
            // Server has no data yet — nudge a refresh and retry sooner
            fetch('/api/usage/refresh').catch(() => {})
            next = 15_000
          }
        }
      } catch {
        next = 15_000
      }
      schedule(next)
    }
    load()
    return () => { mounted = false; clearTimeout(id) }
  }, [])

  const s = usage?.session
  const w = usage?.weekly

  return (
    <div className="stats-bar">
      <div className="stats-row">
        <span className="stats-text stats-tag">S</span>
        <div className="stats-track">
          <div className="stats-fill" style={{ width: `${s?.pct ?? 0}%` }} />
        </div>
        <span className="stats-text stats-val">{s != null ? `${Math.round(s.pct)}%` : '…'}</span>
      </div>
      <div className="stats-row">
        <span className="stats-text stats-tag">W</span>
        <div className="stats-track">
          <div className="stats-fill" style={{ width: `${w?.pct ?? 0}%` }} />
        </div>
        <span className="stats-text stats-val">{w != null ? `${Math.round(w.pct)}%` : '…'}</span>
      </div>
    </div>
  )
}
