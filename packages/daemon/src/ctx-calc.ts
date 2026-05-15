export function getModelWindow(model: string): number {
  if (model.includes('[1m]')) return 1_000_000
  return 200_000
}

export function computeCtxPct(opts: { model: string; inputTokens: number }): number {
  const w = getModelWindow(opts.model)
  return Math.min(100, (opts.inputTokens / w) * 100)
}
