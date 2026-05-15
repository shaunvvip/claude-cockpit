import { describe, it, expect, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'

let dir: string

afterAll(() => {
  if (dir) {
    // Kill any lazy-spawned daemons that wrote runtime info into the test HOME
    try {
      const rt = JSON.parse(readFileSync(join(dir, '.claude-cockpit/daemon.json'), 'utf8'))
      if (typeof rt.pid === 'number') {
        try { process.kill(rt.pid, 'SIGTERM') } catch { /* may already be gone */ }
      }
    } catch { /* runtime info missing; nothing to kill */ }
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* */ }
  }
})

function statuslineOnce(stdin: string, env: NodeJS.ProcessEnv, timeoutMs = 10_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'packages/statusline/bin/statusline.ts'], { env })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* */ }
      reject(new Error(`statusline timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }) })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.stdin.write(stdin); child.stdin.end()
  })
}

describe('Phase 0 end-to-end', () => {
  it('lazy-starts daemon on first statusline run', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cockpit-e2e-'))
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, '')
    const stdin = JSON.stringify({
      session_id: 'e2e-sid', cwd: dir,
      model: { id: 'claude-opus-4-7' },
      transcript_path: transcript,
      workspace: { current_branch: 'main' },
    })
    const out = await statuslineOnce(stdin, env)
    expect(out.stdout).toContain('claude-opus-4-7')
    expect(out.stdout).toContain('main')

    // Give the lazy-spawned daemon a moment to write its runtime info before the second test
    await new Promise(r => setTimeout(r, 1000))
  })

  it('subsequent runs hit existing daemon (faster)', async () => {
    const env = { ...process.env, HOME: dir, TMPDIR: dir }
    const t0 = Date.now()
    const out = await statuslineOnce(JSON.stringify({
      session_id: 'e2e-sid-2', cwd: dir, model: { id: 'm' },
      transcript_path: join(dir, 't2.jsonl'), workspace: { current_branch: 'main' },
    }), env)
    const elapsed = Date.now() - t0
    expect(out.stdout).toContain('m')
    expect(elapsed).toBeLessThan(5000)
  })
})
