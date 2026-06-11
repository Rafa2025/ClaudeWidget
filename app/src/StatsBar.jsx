import { useState, useEffect } from 'react'

export default function StatsBar() {
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    let id
    const load = async () => {
      try {
        const res = await fetch('/api/usage')
        if (res.ok) {
          const data = await res.json()
          setUsage(data)
          // If server hasn't got data yet, ask it to refresh and retry sooner
          if (!data.ok) {
            fetch('/api/usage/refresh').catch(() => {})
            clearInterval(id)
            id = setInterval(load, 15_000)
          } else {
            clearInterval(id)
            id = setInterval(load, 90_000)
          }
        }
      } catch {
        clearInterval(id)
        id = setInterval(load, 15_000)
      }
    }
    load()
    id = setInterval(load, 30_000)
    return () => clearInterval(id)
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
