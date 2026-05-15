#!/usr/bin/env node
import { startDaemon } from '../src/main.js'

const shutdown = await startDaemon()

process.on('SIGTERM', async () => { await shutdown(); process.exit(0) })
process.on('SIGINT',  async () => { await shutdown(); process.exit(0) })
