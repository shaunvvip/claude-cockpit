import type { ApiContext, ApiResponse } from './routes.js'
import { loadConfig } from '../config-loader.js'

function json(status: number, payload: unknown): ApiResponse {
  return { status, body: JSON.stringify(payload), contentType: 'application/json' }
}

export function handleConfigRequest(method: string, url: string, _ctx: ApiContext): Promise<ApiResponse> | ApiResponse {
  if (method !== 'GET' || url !== '/api/config') return json(404, { error: 'not found' })
  const cfg = loadConfig()
  return json(200, {
    statuslinePreset: cfg.statuslinePreset ?? 'essential',
    dashboardTheme:   cfg.dashboardTheme ?? 'auto',
    dashboardLang:    cfg.dashboardLang ?? 'en',
  })
}
