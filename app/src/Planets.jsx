import { useState, useEffect } from 'react'

const PALETTES = [
  { bg: 'radial-gradient(38% 34% at 36% 32%, #9b8bd4, #5b5388 60%, #3c3760)', ring: 'rgba(180,170,220,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #d48b9b, #884358 60%, #5c2a38)', ring: 'rgba(220,160,175,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #7ecfa8, #3d8862 60%, #265a42)', ring: 'rgba(150,215,185,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #d4b06b, #8a6b38 60%, #5c4622)', ring: 'rgba(220,190,140,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #7ab0d4, #3d6888 60%, #264558)', ring: 'rgba(150,185,220,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #d47ab4, #883d70 60%, #582848)', ring: 'rgba(215,155,205,.55)' },
  { bg: 'radial-gradient(38% 34% at 36% 32%, #e8956b, #b85535 60%, #7c3020)', ring: 'rgba(235,175,140,.55)' },
]

let _uid = 0

export default function Planets() {
  const [list, setList] = useState([])

  useEffect(() => {
    const spawn = () => {
      const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)]
      const sz  = 44 + Math.floor(Math.random() * 68)   // 44–112 px
      const top = 6  + Math.random() * 58                // 6–64 % from top
      const dur = 8  + Math.random() * 11                // 8–19 s
      const id  = ++_uid
      setList(p => p.length >= 3 ? p : [...p, { id, pal, sz, top, dur }])
      setTimeout(() => setList(p => p.filter(x => x.id !== id)), (dur + 1) * 1000)
    }

    spawn()
    const t = setInterval(spawn, 3200)
    return () => clearInterval(t)
  }, [])

  return list.map(({ id, pal, sz, top, dur }) => (
    <div
      key={id}
      className="planet-fly"
      style={{
        top:               `${top}%`,
        width:             sz,
        height:            sz,
        animationDuration: `${dur}s`,
        background:        pal.bg,
        '--pring':         pal.ring,
      }}
    >
      <span className="p-ring" />
    </div>
  ))
}
