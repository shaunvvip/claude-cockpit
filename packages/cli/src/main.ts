/**
 * CLI entry — dispatched by bin/claude-cockpit.js when subcommand is
 * `configure` or `status`. argv[2] is the subcommand name.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const cmd = argv[2] ?? ''
  switch (cmd) {
    case 'configure':
      // Filled in Task 7
      console.error('configure: not yet implemented')
      return 1
    case 'status':
      // Filled in Task 8
      console.error('status: not yet implemented')
      return 1
    default:
      console.error(`unknown subcommand: ${cmd}`)
      return 1
  }
}
