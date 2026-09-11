/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // "Laboratory instrument" surface ramp. Used through CSS variables so the
        // light theme can re-map the same token names (see index.css).
        lab: {
          950: '#070a0f',
          900: '#0b1017',
          850: '#0f151e',
          800: '#141c27',
          750: '#1a2431',
          700: '#22303f',
          600: '#33455a',
          500: '#4d6379',
          400: '#7a8fa4',
          300: '#a9bccc',
          200: '#cfdce6',
          100: '#e8eff4',
        },
        accent: {
          DEFAULT: '#48d6c4',
          soft: '#7ff0e1',
          deep: '#149e8d',
        },
      },
      boxShadow: {
        panel: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 12px 40px -12px rgb(0 0 0 / 0.6)',
        glow: '0 0 0 1px rgb(72 214 196 / 0.35), 0 0 24px -4px rgb(72 214 196 / 0.45)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.9' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
};
