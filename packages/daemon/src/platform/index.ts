import * as macos from './macos.js'
import * as linux from './linux.js'

export interface PlatformActions {
  platform: 'darwin' | 'linux'
  openUrl(url: string): Promise<void>
  openFile(path: string): Promise<void>
  clipboardWrite(text: string): Promise<void>
}

export function getPlatformActions(): PlatformActions {
  if (process.platform === 'darwin') {
    return { platform: 'darwin', openUrl: macos.openUrl, openFile: macos.openFile, clipboardWrite: macos.clipboardWrite }
  }
  return { platform: 'linux', openUrl: linux.openUrl, openFile: linux.openFile, clipboardWrite: linux.clipboardWrite }
}
