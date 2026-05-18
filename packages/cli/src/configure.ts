import * as p from '@clack/prompts'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { patchSettingsJson } from './settings-json.js'

const CONFIG_PATH = join(homedir(), '.claude-cockpit', 'config.json')
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

export async function runConfigure(): Promise<number> {
  p.intro('claude-cockpit · setup wizard')

  // Load existing config if any (to use as defaults)
  let existing: Record<string, unknown> = {}
  if (existsSync(CONFIG_PATH)) {
    try { existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) } catch { /* ignore */ }
  }

  const isMac = process.platform === 'darwin'

  // 1. Preset
  const preset = await p.select({
    message: '1/8 · Statusline preset',
    options: [
      { value: 'essential', label: 'Essential (default) — 2 lines, model+cwd+gauges+links' },
      { value: 'minimal',   label: 'Minimal — 1 line, just model+cwd+ctx+cockpit link' },
      { value: 'full',      label: 'Full — 2 lines + cache hit + tool detail + other sessions' },
    ],
    initialValue: (existing.statuslinePreset as string) ?? 'essential',
  })
  if (p.isCancel(preset)) { p.cancel('Cancelled'); return 1 }

  // 2. Theme
  const theme = await p.select({
    message: '2/8 · Dashboard theme',
    options: [
      { value: 'auto',  label: 'Auto (follow system prefers-color-scheme)' },
      { value: 'dark',  label: 'Dark' },
      { value: 'light', label: 'Light' },
    ],
    initialValue: (existing.dashboardTheme as string) ?? 'dark',
  })
  if (p.isCancel(theme)) { p.cancel('Cancelled'); return 1 }

  // 3. Language
  const lang = await p.select({
    message: '3/8 · Dashboard language',
    options: [
      { value: 'en',    label: 'English' },
      { value: 'zh-CN', label: '中文 (zh-CN)' },
    ],
    initialValue: (existing.dashboardLang as string) ?? 'en',
  })
  if (p.isCancel(lang)) { p.cancel('Cancelled'); return 1 }

  // 4. Disabled rules
  const ALL_RULES = ['ctx-high', 'cost-spike', 'loop-detect', 'subagent-stuck']
  const currentlyDisabled = (existing.disabledRules as string[] | undefined) ?? []
  const enabledRules = await p.multiselect({
    message: '4/8 · Alert rules to enable',
    options: [
      { value: 'ctx-high',        label: 'ctx-high (context > 90%)' },
      { value: 'cost-spike',      label: 'cost-spike (rate > 7-day avg × 2)' },
      { value: 'loop-detect',     label: 'loop-detect (8+ edits on same file in 10 min)' },
      { value: 'subagent-stuck',  label: 'subagent-stuck (Task tool idle > 5 min)' },
    ],
    initialValues: ALL_RULES.filter(r => !currentlyDisabled.includes(r)),
    required: false,
  })
  if (p.isCancel(enabledRules)) { p.cancel('Cancelled'); return 1 }

  const disabledRules = ALL_RULES.filter(r => !(enabledRules as string[]).includes(r))

  // 5. ctx-high threshold
  const ctxRaw = await p.text({
    message: '5/8 · ctx-high threshold (50-100, default 90)',
    placeholder: '90',
    initialValue: String(existing.ctxHighThresholdPct ?? 90),
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 50 || n > 100) return 'Enter a number between 50 and 100'
      return undefined
    },
  })
  if (p.isCancel(ctxRaw)) { p.cancel('Cancelled'); return 1 }
  const ctxHighThresholdPct = Number(ctxRaw)

  // 6. Retention days
  const retRaw = await p.text({
    message: '6/8 · History retention (days, 7-365, default 90)',
    placeholder: '90',
    initialValue: String(existing.retentionDays ?? 90),
    validate: (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 7 || n > 365) return 'Enter a number between 7 and 365'
      return undefined
    },
  })
  if (p.isCancel(retRaw)) { p.cancel('Cancelled'); return 1 }
  const retentionDays = Number(retRaw)

  // 7. macOS notification check (skip on linux)
  let sendTestNotification = false
  if (isMac) {
    const choice = await p.select({
      message: '7/8 · macOS notification quick check?',
      options: [
        { value: 'send', label: 'Send test notification now' },
        { value: 'skip', label: 'Skip' },
      ],
      initialValue: 'send',
    })
    if (p.isCancel(choice)) { p.cancel('Cancelled'); return 1 }
    sendTestNotification = (choice === 'send')
  }

  // 8. Patch settings.json
  const patchChoice = await p.select({
    message: `${isMac ? '8' : '7'}/8 · Patch ~/.claude/settings.json statusLine to point at this install?`,
    options: [
      { value: 'patch', label: 'Patch it (writes "npx claude-cockpit statusline")' },
      { value: 'skip',  label: 'Skip (I\'ll wire it myself)' },
    ],
    initialValue: 'patch',
  })
  if (p.isCancel(patchChoice)) { p.cancel('Cancelled'); return 1 }
  const patchSettings = (patchChoice === 'patch')

  // Save config
  const newConfig = {
    ...existing,
    statuslinePreset: preset,
    dashboardTheme: theme,
    dashboardLang: lang,
    disabledRules,
    ctxHighThresholdPct,
    retentionDays,
  }
  const configDir = dirname(CONFIG_PATH)
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  const tmp = `${CONFIG_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(newConfig, null, 2))
  renameSync(tmp, CONFIG_PATH)

  // Test notification
  if (sendTestNotification) {
    try {
      const { spawnSync } = await import('node:child_process')
      spawnSync('osascript', ['-e', 'display notification "Permission OK — alerts will fire." with title "claude-cockpit ready"'])
    } catch { /* ignore */ }
  }

  // Patch settings.json
  let patchResult: ReturnType<typeof patchSettingsJson> | undefined
  if (patchSettings) {
    patchResult = patchSettingsJson(SETTINGS_PATH)
  }

  p.outro(`Saved to ${CONFIG_PATH}\nRestart Claude Code to pick up changes.${
    patchResult?.patched && patchResult.backupPath
      ? `\nSettings patched. Previous command backed up to ${patchResult.backupPath}`
      : patchResult?.error
        ? `\nWARN: settings patch failed: ${patchResult.error}`
        : ''
  }`)
  return 0
}
