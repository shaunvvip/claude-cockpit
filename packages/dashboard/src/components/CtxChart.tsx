import { useEffect, useRef, useState } from 'react'
import { Sparkline } from './Sparkline.js'
import { palette } from '../lib/colors.js'

const RING_SIZE = 60

export function CtxChart({ ctxPct }: { ctxPct: number }) {
  const ringRef = useRef<number[]>([])
  const tsRef = useRef<number[]>([])
  const [, force] = useState(0)

  useEffect(() => {
    const r = ringRef.current
    const t = tsRef.current
    r.push(ctxPct)
    t.push(Date.now())
    if (r.length > RING_SIZE) { r.shift(); t.shift() }
    force((n) => n + 1)
  }, [ctxPct])

  if (ringRef.current.length === 0) return null
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
      <div className="text-cockpit-muted text-[10px] mb-1">CTX % · live</div>
      <Sparkline data={[tsRef.current, ringRef.current]} color={palette.info} />
    </div>
  )
}
