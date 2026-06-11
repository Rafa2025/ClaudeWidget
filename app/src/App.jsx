import { useState, useEffect, useRef, useCallback } from 'react'
import Critter  from './Critter'
import Starfield from './Starfield'
import Planets  from './Planets'
import StatsBar  from './StatsBar'

const WORDS = { idle: 'DRIFTING', thinking: 'TRAVELING', input: 'AWAITING YOU', done: 'ARRIVED', ask: 'QUESTION' }
const HINTS = { idle: 'available', thinking: 'on a mission', input: 'needs your input', done: 'mission complete', ask: 'reply needed' }

export default function App() {
  const [mode, setMode]           = useState('idle')
  const [collapsed,  setCollapsed]  = useState(() => {
    try { return localStorage.getItem('ccw_collapsed') === '1' } catch { return false }
  })
  const [collapsing, setCollapsing] = useState(false)
  const [lean,       setLean]      = useState(0)
  const [bubble,     setBubble]    = useState({ text: '', cls: '' })
  const [flag,       setFlag]      = useState(false)
  const [egg,        setEgg]       = useState(null)
  const [showInput,  setShowInput] = useState(false)
  const [inputText,  setInputText] = useState('')
  const [notifMsg,   setNotifMsg]  = useState('')
  const [askOpts,    setAskOpts]   = useState([])
  const inputRef = useRef(null)

  const stageRef  = useRef(null)
  const partRef   = useRef(null)
  const timers    = useRef([])
  const modeRef    = useRef(mode);  modeRef.current  = mode
  const eggRef     = useRef(null);  eggRef.current   = egg
  const pendingRef  = useRef(null)   // queued state arriving during 'done'
  const leftDoneRef = useRef(0)      // timestamp when we last left 'done'

  useEffect(() => {
    try { localStorage.setItem('ccw_collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  // Expose setStatus for GTK IPC — called as setStatus(mode, notifMsg?)
  useEffect(() => {
    window.setStatus = (mode, msg = '', opts = []) => {
      setMode(prev => {
        if (mode === 'done' && (prev === 'input' || prev === 'ask')) return prev
        if (prev === 'done' && (mode === 'input' || mode === 'ask')) {
          pendingRef.current = { mode, msg, opts }
          return prev
        }
        // ignore input/ask for 3s after leaving done — notification hooks fire late
        if ((mode === 'input' || mode === 'ask') && prev === 'idle'
            && Date.now() - leftDoneRef.current < 3000) {
          return prev
        }
        return mode
      })
      if (mode === 'input') { setNotifMsg(msg || ''); setAskOpts([]) }
      else if (mode === 'ask') { setNotifMsg(msg || ''); setAskOpts(Array.isArray(opts) ? opts : []) }
      else if (mode !== 'done') { setNotifMsg(''); setAskOpts([]) }
    }
    return () => { delete window.setStatus }
  }, [])

  // Drag-to-move via WebKit message handler
  useEffect(() => {
    if (collapsed) return
    const el = document.querySelector('.title-left')
    if (!el || !window.webkit?.messageHandlers?.drag) return
    const onDown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      window.webkit.messageHandlers.drag.postMessage(`start,${e.screenX},${e.screenY}`)
      const onMove = (e) => window.webkit.messageHandlers.drag.postMessage(`move,${e.screenX},${e.screenY}`)
      const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [collapsed])

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const pushT = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }

  const react = useCallback((cls) => {
    const s = stageRef.current; if (!s) return
    s.classList.remove('halt', 'arrive', 'poke', 'spin')
    void s.offsetWidth
    s.classList.add(cls)
  }, [])

  const onStageAnimEnd = useCallback((e) => {
    if (['haltAnim','arriveAnim','pokeAnim','spinAnim'].includes(e.animationName)) {
      stageRef.current?.classList.remove('halt', 'arrive', 'poke', 'spin')
    }
  }, [])

  const burst = useCallback((leftPct, topPct, opts = {}) => {
    const wrap = partRef.current; if (!wrap) return
    const kids = [...wrap.children]
    const n    = opts.count || 7
    kids.forEach((s, i) => {
      if (i >= n) return
      const spread = opts.cone ?? Math.PI * 2
      const base   = opts.dir  ?? -Math.PI / 2
      const ang  = base + (Math.random() - 0.5) * spread
      const dist = (opts.dist || 60) * (0.6 + Math.random() * 0.6)
      s.className = 'pa' + (opts.dust ? ' dust' : '')
      s.style.left = leftPct + '%'
      s.style.top  = topPct  + '%'
      s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
      s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`)
      void s.offsetWidth
      s.classList.add('go')
    })
  }, [])

  // Entry effects
  useEffect(() => {
    clearTimers()
    if (mode === 'idle' || mode === 'thinking') { setBubble({ text: '', cls: '' }); setFlag(false) }

    if (mode === 'input') {
      setFlag(false); setBubble({ text: '', cls: '' })
      react('halt')
      pushT(() => setBubble({ text: '!', cls: 'show pulse alert' }), 480)
    }

    if (mode === 'done') {
      setBubble({ text: '', cls: '' })
      react('arrive')
      pushT(() => burst(50, 64, { dust: true, dir: -Math.PI / 2, cone: Math.PI * 1.2, dist: 50, count: 8 }), 340)
      pushT(() => setFlag(true), 560)
      pushT(() => setBubble({ text: 'Done', cls: 'show' }), 840)
      pushT(() => { react('spin'); burst(50, 48, { dist: 80, count: 8 }) }, 1300)
      pushT(() => setBubble({ text: '', cls: '' }), 2900)
      pushT(() => setFlag(false), 3500)
      pushT(() => {
        if (modeRef.current !== 'done') return
        leftDoneRef.current = Date.now()
        const p = pendingRef.current
        pendingRef.current = null
        if (p) {
          setMode(p.mode)
          if (p.mode === 'input') { setNotifMsg(p.msg || ''); setAskOpts([]) }
          else if (p.mode === 'ask') { setNotifMsg(p.msg || ''); setAskOpts(Array.isArray(p.opts) ? p.opts : []) }
        } else {
          setMode('idle')
        }
      }, 4300)
    }
    return clearTimers
  }, [mode, react, burst])

  // Easter-egg ticker (~2% chance every 6s)
  const fireEgg = useCallback((name) => {
    setEgg(name); eggRef.current = name
    const dur = name === 'planet' ? 15000 : 2600
    if (name === 'coffee') {
      const s = stageRef.current
      if (s) { s.classList.add('sip'); setTimeout(() => s.classList.remove('sip'), 2400) }
    }
    setTimeout(() => { setEgg(null); eggRef.current = null }, dur)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const m = modeRef.current
      if (m !== 'idle' && m !== 'thinking') return
      if (eggRef.current) return
      if (Math.random() > 0.02) return
      const pool = m === 'idle' ? ['coffee', 'trail'] : ['wormhole']
      fireEgg(pool[Math.floor(Math.random() * pool.length)])
    }, 6000)
    return () => clearInterval(id)
  }, [fireEgg])

  // Cursor lean
  const onMove  = useCallback((e) => {
    const el = stageRef.current; if (!el) return
    const r  = el.getBoundingClientRect()
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    setLean(Math.max(-1, Math.min(1, dx)) * 6)
  }, [])
  const onLeave      = useCallback(() => setLean(0), [])
  const onStageClick = useCallback(() => {
    const m = modeRef.current
    if (m === 'idle') {
      setShowInput(prev => {
        if (prev) { setInputText(''); return false }
        setTimeout(() => inputRef.current?.focus(), 30)
        return true
      })
    } else if (m === 'input') {
      setShowInput(true)
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      react('poke')
    }
  }, [react])

  const submitInput = useCallback(() => {
    const txt = inputText.trim()
    if (!txt) return
    fetch('/api/input', { method: 'POST', body: txt }).catch(() => {})
    setInputText('')
    setShowInput(false)
    setMode('thinking')
    setNotifMsg('')
  }, [inputText])

  if (collapsed) {
    const onPeekDragDown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (!window.webkit?.messageHandlers?.drag) return
      window.webkit.messageHandlers.drag.postMessage(`start,${e.screenX},${e.screenY}`)
      const onMove = (mv) => window.webkit.messageHandlers.drag.postMessage(`move,${mv.screenX},${mv.screenY}`)
      const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
    return (
      <div className="peek" data-state={mode}
        role="status" aria-label={`Claude Code: ${WORDS[mode]} — ${HINTS[mode]}`}>
        <div className="peek-head"><Critter mode={mode} /></div>
        <div className="peek-bar" onMouseDown={onPeekDragDown}>
          <div className="peek-main">
            <span className="peek-dot" />
            <span className="peek-text">
              <span className="peek-word">{WORDS[mode]}</span>
              <span className="peek-hint">{HINTS[mode]}</span>
            </span>
            <span className="peek-green" title="Expand"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setCollapsed(false) }} />
          </div>
          <StatsBar />
        </div>
      </div>
    )
  }

  return (
    <div className={`card${collapsing ? ' collapsing' : ''}`}>
      <div
        className="stage"
        ref={stageRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onStageClick}
        onAnimationEnd={onStageAnimEnd}
        role="img"
        aria-label={`${WORDS[mode]} — ${HINTS[mode]}`}
      >
        <div className="bg-layer">
          <Starfield mode={mode} />
          <Planets />
        </div>

        <div className={`wormhole${egg === 'wormhole' ? ' go' : ''}`}><i /><i /><i /><i /></div>
        <div className={`trail${egg === 'trail'     ? ' go' : ''}`} />

        {/* Title bar — floats over the space scene */}
        <div className="titlebar">
          <div className="title-left" title="Drag to move">
            <span className="title-dot" />
            <span className="title-text">
              <strong>Claude Code</strong> · Agent
            </span>
          </div>
          <div className="lights">
            <span className="l-red"    title="Close"    onClick={(e) => { e.stopPropagation(); window.webkit?.messageHandlers?.drag?.postMessage('quit') }} />
            <span className="l-yellow" title="Minimize" onClick={(e) => { e.stopPropagation(); window.webkit?.messageHandlers?.drag?.postMessage('minimize') }} />
            <span className="l-green"  title="Peek"     onClick={(e) => { e.stopPropagation(); setCollapsing(true); setTimeout(() => { setCollapsed(true); setCollapsing(false) }, 280) }} />
          </div>
        </div>

        <div className="scene">
          <div className="lean" style={{ '--lean': `${lean}deg` }}>
            <Critter mode={mode} />
          </div>
        </div>

        <div className={`flag${flag ? ' show' : ''}`}>
          <span className="pennant" />
        </div>
        <div className={`coffee${egg === 'coffee' ? ' go' : ''}`}>
          <span className="cup"><span className="brew" /><span className="steam" /><span className="steam s2" /></span>
        </div>
        <div className={`bubble ${showInput ? '' : bubble.cls}`} aria-live="polite">{bubble.text}</div>

        <div className="particles" ref={partRef}>
          {Array.from({ length: 8 }).map((_, i) => <div className="pa" key={i} />)}
        </div>

        {/* Bottom overlay — status + stats over the space scene */}
        <div className="bottom-overlay">
          {mode === 'ask'
            ? (
              <div className="ask-overlay" onClick={e => e.stopPropagation()}>
                {notifMsg && <div className="ask-question">{notifMsg}</div>}
                {askOpts.length > 0
                  ? <div className="ask-opts">
                      {askOpts.map((opt, i) => (
                        <button key={i} className="ask-opt-btn" onClick={() =>
                          window.webkit?.messageHandlers?.answer?.postMessage(opt)
                        }>{opt}</button>
                      ))}
                    </div>
                  : <div className="input-row">
                      <input ref={inputRef} className="input-field" type="text"
                        value={inputText} onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && inputText.trim()) {
                            window.webkit?.messageHandlers?.answer?.postMessage(inputText.trim())
                            setInputText('')
                          }
                        }}
                        placeholder="answer…" autoFocus />
                      <button className="input-send" onClick={() => {
                        if (inputText.trim()) {
                          window.webkit?.messageHandlers?.answer?.postMessage(inputText.trim())
                          setInputText('')
                        }
                      }}>↵</button>
                    </div>
                }
              </div>
            )
            : showInput && (mode === 'input' || mode === 'idle')
            ? (
              <div className="input-overlay" onClick={e => e.stopPropagation()}>
                {notifMsg && <div className="input-prompt">{notifMsg}</div>}
                <div className="input-row">
                  <input
                    ref={inputRef}
                    className="input-field"
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitInput()
                      if (e.key === 'Escape') { setShowInput(false); setInputText('') }
                    }}
                    placeholder="message…"
                  />
                  <button className="input-send" onClick={submitInput}>↵</button>
                </div>
              </div>
            )
            : (
              <>
                {mode === 'input' && notifMsg
                  ? <>
                      <div className="notif-msg">{notifMsg}</div>
                      <div className="notif-sub">click to reply</div>
                    </>
                  : <>
                      <div className="status-word">{WORDS[mode]}</div>
                      <div className="status-hint">{HINTS[mode]}</div>
                    </>
                }
                <StatsBar />
              </>
            )
          }
        </div>
      </div>
    </div>
  )
}
