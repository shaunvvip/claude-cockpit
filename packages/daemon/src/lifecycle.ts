export interface IdleCheckerOptions {
  idleMs: number
  hasActiveBrowsers: () => boolean
  lastSessionUpdate: () => number | undefined
  now: () => number
  onIdle: () => void
}

export class IdleChecker {
  constructor(private readonly opts: IdleCheckerOptions) {}

  tick(): void {
    if (this.opts.hasActiveBrowsers()) return
    const last = this.opts.lastSessionUpdate()
    const idleFor = last === undefined ? Infinity : this.opts.now() - last
    if (idleFor >= this.opts.idleMs) this.opts.onIdle()
  }
}
