export function apiUrl(path: string): string {
  return `${window.location.origin}${path}`
}

export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}
