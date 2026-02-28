import forms from '@tailwindcss/forms'
import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        secondary: '#a855f7',
        accent: '#06b6d4',
        'background-light': '#f0f4f8',
        'background-dark': '#0f172a',
        'surface-dark': '#1e293b',
        glass: 'rgba(30, 41, 59, 0.7)',
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 10px rgba(99, 102, 241, 0.5), 0 0 20px rgba(99, 102, 241, 0.3)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'neon-accent':
          '0 0 5px rgba(6, 182,  212, 0.5), 0 0 10px rgba(6, 182, 212, 0.3)',
        modal: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        '3d': '5px 5px 10px rgba(0,0,0,0.5), -2px -2px 10px rgba(255,255,255,0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [forms, containerQueries],
}

