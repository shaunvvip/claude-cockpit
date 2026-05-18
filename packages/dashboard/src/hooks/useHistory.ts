import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/api.js'

interface FetchState<T> {
  data: T | undefined
  loading: boolean
  error: string | undefined
}

function useFetch<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: undefined, loading: true, error: undefined })

  useEffect(() => {
    let cancelled = false
    setState({ data: undefined, loading: true, error: undefined })
    void (async () => {
      try {
        const res = await fetch(apiUrl(path))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (cancelled) return
        setState({ data: body as T, loading: false, error: undefined })
      } catch (e) {
        if (cancelled) return
        setState({ data: undefined, loading: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { cancelled = true }
  }, [path])

  return state
}

export interface TrendsBucket {
  date: string; cost: number; inputTokens: number; outputTokens: number
  cacheReadTokens: number; cacheCreationTokens: number; sessions: number
}
export interface TrendsResult {
  from: number; to: number; buckets: TrendsBucket[]
  totals: { cost: number; sessions: number; cacheHitRate: number }
}

export function useTrends(days = 30) {
  return useFetch<TrendsResult>(`/api/history/trends?days=${days}`)
}

export interface TopItem {
  key: string; cost?: number; tokens?: number; toolCalls?: number; sessions?: number
}
export interface TopResult { items: TopItem[] }

export function useTop(metric: 'cost'|'tokens'|'tools', dimension: 'project'|'tool'|'session', days = 30, limit = 10) {
  return useFetch<TopResult>(`/api/history/top?metric=${metric}&dimension=${dimension}&days=${days}&limit=${limit}`)
}

export interface ProjectItem {
  key: string; label: string; cost: number; sessions: number; totalTokens: number; lastUpdate: number
}
export interface ProjectsResult { projects: ProjectItem[] }

export function useProjects(days = 30) {
  return useFetch<ProjectsResult>(`/api/history/projects?days=${days}`)
}

export interface UsageSnapshot { ts: number; fiveHourPct: number | null; sevenDayPct: number | null }
export interface UsageSnapshotsResult { snapshots: UsageSnapshot[] }

export function useUsageSnapshots(days = 30) {
  return useFetch<UsageSnapshotsResult>(`/api/history/usage-snapshots?days=${days}`)
}

export interface SparklineBucket { t: number; v: number }
export interface SparklineResult { buckets: SparklineBucket[] }

export function useSparkline(metric: 'cost'|'ctx', days = 1, bucket: 'hour'|'minute' = 'hour') {
  return useFetch<SparklineResult>(`/api/history/sparkline?metric=${metric}&days=${days}&bucket=${bucket}`)
}
