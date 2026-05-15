import * as macos from './macos.js'
import * as linux from './linux.js'

export interface NotifyArgs {
  title: string
  body: string
  deepLink?: string
}

export interface PlatformActions {
  platform: 'darwin' | 'linux'
  openUrl(url: string): Promise<void>
  openFile(path: string): Promise<void>
  clipboardWrite(text: string): Promise<void>
  notify(args: NotifyArgs): Promise<void>
  focusTerminal(pid: number): Promise<void>
}

export function getPlatformActions(): PlatformActions {
  if (process.platform === 'darwin') {
    return {
      platform: 'darwin',
      openUrl: macos.openUrl,
      openFile: macos.openFile,
      clipboardWrite: macos.clipboardWrite,
      notify: macos.notify,
      focusTerminal: macos.focusTerminal,
    }
  }
  return {
    platform: 'linux',
    openUrl: linux.openUrl,
    openFile: linux.openFile,
    clipboardWrite: linux.clipboardWrite,
    notify: linux.notify,
    focusTerminal: linux.focusTerminal,
  }
}
