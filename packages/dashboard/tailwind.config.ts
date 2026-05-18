import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg:    'var(--cockpit-bg)',
          panel: 'var(--cockpit-panel)',
          line:  'var(--cockpit-line)',
          text:  'var(--cockpit-text)',
          muted: 'var(--cockpit-muted)',
          // signal colors stay hex (theme-invariant)
          info:    '#5794f2',
          ok:      '#73bf69',
          warn:    '#f2cc0c',
          near:    '#f4a261',
          crit:    '#e0524d',
        },
      },
    },
  },
} satisfies Config
