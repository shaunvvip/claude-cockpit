import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export interface RuntimeInfo {
  pid: number
  port: number
  startedAt: number
}

export function writeRuntimeInfo(path: string, info: RuntimeInfo): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(info, null, 2))
}

export function readRuntimeInfo(path: string): RuntimeInfo | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (
      typeof raw === 'object' &&
      raw !== null &&
      typeof raw.pid === 'number' &&
      typeof raw.port === 'number' &&
      typeof raw.startedAt === 'number'
    ) {
      return raw as RuntimeInfo
    }
    return null
  } catch {
    return null
  }
}

export function deleteRuntimeInfo(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}
