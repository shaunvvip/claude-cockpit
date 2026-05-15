import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface SparklineProps {
  data: [number[], number[]]
  color: string
  width?: number
  height?: number
}

export function Sparkline({ data, color, width = 200, height = 50 }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const opts: uPlot.Options = {
      width, height, padding: [4, 4, 4, 4],
      cursor: { show: false }, legend: { show: false },
      scales: { x: { time: false }, y: {} },
      axes: [{ show: false }, { show: false }],
      series: [{}, { stroke: color, width: 1.5 }],
    }
    plotRef.current = new uPlot(opts, data, ref.current)
    return () => { plotRef.current?.destroy(); plotRef.current = null }
  }, [data, color, width, height])

  return <div ref={ref} />
}
