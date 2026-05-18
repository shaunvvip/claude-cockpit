import { runConfigure } from './configure.js'
import { runStatus } from './status.js'

/**
 * CLI entry — dispatched by bin/claude-cockpit.js when subcommand is
 * `configure` or `status`. argv[2] is the subcommand name.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const cmd = argv[2] ?? ''
  switch (cmd) {
    case 'configure':
      return runConfigure()
    case 'status':
      return runStatus()
    default:
      console.error(`unknown subcommand: ${cmd}`)
      return 1
  }
}
