/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#ff6f40',
          50: '#fff4ef',
          100: '#ffe5d8',
          200: '#ffc8aa',
          300: '#ffa57b',
          400: '#ff8458',
          500: '#ff6f40',
          600: '#e65a2b',
          700: '#c04420',
          800: '#92341b',
          900: '#5a1f0f'
        },
        bg: {
          DEFAULT: '#0e0f12',
          panel: '#16181d',
          subtle: '#1d2027',
          hover: '#252934',
          border: '#2e333d'
        },
        fg: {
          DEFAULT: '#e6e8ec',
          muted: '#9aa0aa',
          dim: '#6c727d'
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};
