import { useState } from 'react'
import { apiUrl } from '../lib/api.js'

interface Props { sessionId: string }

async function post(path: string, body?: object): Promise<{ ok: boolean; status: number }> {
  const init: RequestInit = { method: 'POST' }
  if (body) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(apiUrl(path), init)
  return { ok: res.ok, status: res.status }
}

export function ControlButtons({ sessionId }: Props) {
  const [last, setLast] = useState<string>('')

  const onStop = async () => {
    const r = await post(`/api/sessions/${sessionId}/interrupt`)
    setLast(r.ok ? 'stop sent' : r.status === 422 ? 'stop unavailable' : `error ${r.status}`)
  }
  const onFile = async () => {
    const r = await post(`/api/sessions/${sessionId}/open-file`)
    setLast(r.ok ? 'file opened' : `error ${r.status}`)
  }
  const onCopy = async (field: 'sessionId' | 'cost' | 'transcriptPath' | 'cwd') => {
    const r = await post(`/api/sessions/${sessionId}/copy-info`, { field })
    setLast(r.ok ? `${field} copied` : `error ${r.status}`)
  }
  const onFocus = async () => {
    const r = await post(`/api/sessions/${sessionId}/focus-terminal`)
    setLast(r.ok ? 'terminal focused' : `error ${r.status}`)
  }

  return (
    <div className="flex gap-2 items-center text-xs">
      <button onClick={onStop}  className="px-2 py-1 bg-cockpit-panel border border-cockpit-line rounded">Stop</button>
      <button onClick={onFile}  className="px-2 py-1 bg-cockpit-panel border border-cockpit-line rounded">Open file</button>
      <button onClick={() => onCopy('sessionId')} className="px-2 py-1 bg-cockpit-panel border border-cockpit-line rounded">Copy id</button>
      <button onClick={onFocus} className="px-2 py-1 bg-cockpit-panel border border-cockpit-line rounded">Focus term</button>
      <span className="text-cockpit-muted text-[10px]">{last}</span>
    </div>
  )
}
