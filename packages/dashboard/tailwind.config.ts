import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg:    '#0e1419',
          panel: '#181e25',
          line:  '#20262d',
          text:  '#d8d9da',
          muted: '#7a8794',
          ok:    '#73bf69',
          warn:  '#f2cc0c',
          near:  '#f4a261',
          crit:  '#e0524d',
          info:  '#5794f2',
        },
      },
    },
  },
} satisfies Config
