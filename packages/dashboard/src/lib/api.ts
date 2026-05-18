export function apiUrl(path: string): string {
  return `${window.location.origin}${path}`
}

export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}

export interface ServerConfig {
  statuslinePreset: 'minimal' | 'essential' | 'full'
  dashboardTheme: 'auto' | 'light' | 'dark'
  dashboardLang: 'en' | 'zh-CN'
}

export async function fetchServerConfig(): Promise<ServerConfig | null> {
  try {
    const res = await fetch(apiUrl('/api/config'))
    if (!res.ok) return null
    return await res.json() as ServerConfig
  } catch {
    return null
  }
}
