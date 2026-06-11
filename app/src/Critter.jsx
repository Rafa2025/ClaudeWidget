import { useRef, useEffect, useCallback } from 'react'

const BITMAP = [
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '..XX.XXXXX.XX..',
  '..XX.XXXXX.XX..',
  'XXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXX',
  '..XXXXXXXXXXX..',
  '..XXXXXXXXXXX..',
  '...X.X...X.X...',
  '...X.X...X.X...',
]
const COLS = 15, ROWS = 10
const isArmTip = (r, c) => (r === 4 || r === 5) && (c <= 1 || c >= 13)
const isLegRow = (r)     => r === 8 || r === 9
const LEG_COLS = [3, 5, 9, 11]
const EYE_COLS = [4, 10]
const px = (n) => `calc(var(--cell) * ${n})`

const body = []
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (BITMAP[r][c] !== 'X') continue
    if (isArmTip(r, c) || isLegRow(r)) continue
    body.push({ r, c })
  }
}

export default function Critter({ mode }) {
  const lidRefs = useRef([])
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  const blink = useCallback(() => {
    lidRefs.current.forEach((el) => {
      if (!el) return
      el.classList.remove('blink')
      void el.offsetWidth
      el.classList.add('blink')
    })
  }, [])

  useEffect(() => {
    let t
    const loop = () => {
      if (modeRef.current !== 'done') {
        blink()
        if (Math.random() < 0.3) setTimeout(blink, 240)
      }
      t = setTimeout(loop, 2400 + Math.random() * 3400)
    }
    t = setTimeout(loop, 1600)
    return () => clearTimeout(t)
  }, [blink])

  const onLidAnimEnd = useCallback((e) => {
    if (e.animationName === 'blinkAnim') e.target.classList.remove('blink')
  }, [])

  return (
    <div className="rig" data-state={mode}>
      <div className="rig-inner" onAnimationEnd={onLidAnimEnd}>
        <div className="thruster" />

        {body.map(({ r, c }) => (
          <div key={`b${r}-${c}`} className="pixel" style={{ left: px(c), top: px(r) }} />
        ))}

        {EYE_COLS.map((c, i) => (
          <div
            key={`lid${i}`}
            className="eyelid"
            ref={(el) => (lidRefs.current[i] = el)}
            style={{ left: px(c), top: px(2) }}
          />
        ))}

        <div className="arm left" style={{ left: 0, top: px(4), width: px(2), height: px(2) }}>
          {[[0,0],[1,0],[0,1],[1,1]].map(([c,r]) => (
            <div key={`al${c}${r}`} className="pixel" style={{ left: px(c), top: px(r) }} />
          ))}
        </div>
        <div className="arm right" style={{ left: px(13), top: px(4), width: px(2), height: px(2) }}>
          {[[0,0],[1,0],[0,1],[1,1]].map(([c,r]) => (
            <div key={`ar${c}${r}`} className="pixel" style={{ left: px(c), top: px(r) }} />
          ))}
        </div>

        {LEG_COLS.map((c, i) => (
          <div key={`leg${i}`} className={`leg l${i}`} style={{ left: px(c), top: px(8), width: px(1), height: px(2) }}>
            <div className="pixel" style={{ left: 0, top: 0 }} />
            <div className="pixel" style={{ left: 0, top: px(1) }} />
          </div>
        ))}
      </div>
    </div>
  )
}
