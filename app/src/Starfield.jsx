import { useEffect, useRef } from 'react'

function hexToRgb(c) {
  if (c.includes(',')) return c
  const h = c.replace('#', '')
  const n = parseInt(h, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

const SPEED_BY_MODE = { idle: 0.4, thinking: 7.5, input: 0.0, done: 0.55 }

export default function Starfield({ mode }) {
  const canvasRef = useRef(null)
  const modeRef   = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const dpr    = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, stars = [], cur = 0.4, raf = 0, alive = true

    let shooters = [], nextShoot = 3000 + Math.random() * 4000, lastT = 0

    const spawnShooter = () => {
      shooters.push({
        x:     w * (0.3 + Math.random() * 0.7),
        y:     h * (Math.random() * 0.45),
        vx:    -(5 + Math.random() * 5),
        vy:     1.2 + Math.random() * 2,
        life:  1,
        decay: 0.018 + Math.random() * 0.012,
        len:   55  + Math.random() * 50,
      })
    }

    const seed = () => {
      const r = canvas.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width  = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(20, Math.round((w * h) / 7000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.3 + Math.random() * 0.7,
        tw: Math.random() * Math.PI * 2,
        accent: Math.random() < 0.22,
      }))
    }

    const draw = (ts = 0) => {
      const dt = lastT ? ts - lastT : 16; lastT = ts
      const target = SPEED_BY_MODE[modeRef.current] ?? 0.4
      cur += (target - cur) * 0.06
      ctx.clearRect(0, 0, w, h)
      const streaking = cur > 1.4

      for (const s of stars) {
        s.x -= cur * s.z
        if (s.x < -6) { s.x = w + 6; s.y = Math.random() * h }
        s.tw += 0.05
        const tw  = streaking ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(s.tw))
        const a   = s.z * tw
        const col = s.accent ? '#d97757' : '240,236,246'
        if (streaking) {
          const len = Math.min(cur * s.z * 2.6, 60)
          ctx.strokeStyle = `rgba(${hexToRgb(col)},${a * 0.9})`
          ctx.lineWidth   = s.z * 1.4
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + len, s.y); ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${hexToRgb(col)},${a})`
          const sz = s.z * 1.5 + 0.4
          ctx.fillRect(s.x, s.y, sz, sz)
        }
      }

      // Shooting stars
      nextShoot -= dt
      if (nextShoot <= 0) { spawnShooter(); nextShoot = 4000 + Math.random() * 6000 }
      shooters = shooters.filter(sh => sh.life > 0)
      for (const sh of shooters) {
        sh.x += sh.vx; sh.y += sh.vy; sh.life -= sh.decay
        const a = sh.life
        const tx = sh.x - (sh.vx / Math.hypot(sh.vx, sh.vy)) * sh.len
        const ty = sh.y - (sh.vy / Math.hypot(sh.vx, sh.vy)) * sh.len
        const g = ctx.createLinearGradient(sh.x, sh.y, tx, ty)
        g.addColorStop(0,   `rgba(255,255,255,${a})`)
        g.addColorStop(0.1, `rgba(200,180,255,${a * 0.8})`)
        g.addColorStop(1,   `rgba(200,180,255,0)`)
        ctx.strokeStyle = g
        ctx.lineWidth   = 1.5
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(tx, ty); ctx.stroke()
        // bright head glow
        ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`
        ctx.beginPath(); ctx.arc(sh.x, sh.y, 1.5, 0, Math.PI * 2); ctx.fill()
      }

      if (alive) raf = requestAnimationFrame(draw)
    }

    seed(); draw()
    const onResize = () => seed()
    window.addEventListener('resize', onResize)
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={canvasRef} className="stars" />
}
