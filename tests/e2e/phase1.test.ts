import { describe, it, expect, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'

let dir: string

afterAll(() => {
  if (dir) {
    try {
      const rt = JSON.parse(readFileSync(join(dir, '.claude-cockpit/daemon.json'), 'utf8'))
      if (typeof rt.pid === 'number') { try { process.kill(rt.pid, 'SIGTERM') } catch { /* */ } }
    } catch { /* */ }
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* */ }
  }
})

function statuslineOnce(stdin: string, env: NodeJS.ProcessEnv, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'packages/statusline/bin/statusline.ts'], { env })
    let buf = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* */ }
      reject(new Error('timeout'))
    }, timeoutMs)
    child.stdout.on('data', (d) => { buf += d.toString() })
    child.on('close', () => { clearTimeout(timer); resolve(buf) })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.stdin.write(stdin); child.stdin.end()
  })
}

function readRuntime(dir: string): { pid: number; port: number; startedAt: number } {
  return JSON.parse(readFileSync(join(dir, '.claude-cockpit/daemon.json'), 'utf8'))
}

describe('Phase 1 end-to-end', () => {
  it('statusline -> daemon -> transcript -> dashboard API shows ctxPct from tokens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-p1-'))
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, '')
    const stdin = JSON.stringify({
      session_id: 'p1-sid', cwd: dir,
      model: { id: 'claude-opus-4-7' },
      transcript_path: transcript,
      workspace: { current_branch: 'main' },
    })

    // First run: spawns daemon (daemon not alive yet, so UPDATE_SESSION not sent)
    await statuslineOnce(stdin, env)
    // Give daemon time to start and write runtime info
    await new Promise(r => setTimeout(r, 1500))

    // Second run: daemon is now alive, UPDATE_SESSION is sent and session is registered
    await statuslineOnce(stdin, env)
    await new Promise(r => setTimeout(r, 800))

    const rt = readRuntime(dir)

    appendFileSync(transcript, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    }) + '\n')

    await new Promise(r => setTimeout(r, 800))     // watcher debounce

    const res = await fetch(`http://localhost:${rt.port}/api/sessions/p1-sid`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ctxPct?: number; inputTokens?: number }
    expect(body.ctxPct).toBeCloseTo(50, 0)
  }, 30_000)

  it('dashboard build artifact is served', async () => {
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    await statuslineOnce(JSON.stringify({
      session_id: 'sid2', cwd: dir, model: { id: 'm' },
      transcript_path: join(dir, 't2.jsonl'), workspace: { current_branch: 'main' },
    }), env)
    await new Promise(r => setTimeout(r, 500))
    const rt = readRuntime(dir)
    const html = await (await fetch(`http://localhost:${rt.port}/`)).text()
    expect(html).toContain('<div id="root">')
  }, 15_000)
})
