#!/usr/bin/env node
import { main } from '../src/main.js'

const code = await main(process.argv)
process.exit(code)
