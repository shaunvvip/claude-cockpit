import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { RouterProvider, createRouter, createRootRoute, createMemoryHistory, Outlet } from '@tanstack/react-router'
import { Sidebar } from './Sidebar.js'

// Node 25 ships a stub `localStorage` global without storage; install an in-memory shim.
function makeMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() { return Object.keys(store).length },
    clear() { store = {} },
    getItem(k: string) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null },
    key(i: number) { return Object.keys(store)[i] ?? null },
    removeItem(k: string) { delete store[k] },
    setItem(k: string, v: string) { store[k] = String(v) },
  }
}

const rootRoute = createRootRoute({ component: () => <><Sidebar /><Outlet /></> })

async function renderSidebar() {
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
}

describe('Sidebar theme toggle', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', makeMemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('cycles auto → light → dark → auto', async () => {
    await renderSidebar()
    const btn = await waitFor(() => screen.getByRole('button', { name: /Theme/i }))
    expect(localStorage.getItem('cockpit-theme')).toBe(null)
    fireEvent.click(btn)
    expect(localStorage.getItem('cockpit-theme')).toBe('light')
    fireEvent.click(btn)
    expect(localStorage.getItem('cockpit-theme')).toBe('dark')
    fireEvent.click(btn)
    expect(localStorage.getItem('cockpit-theme')).toBe('auto')
  })
})
