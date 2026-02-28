import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Needed for GitHub Pages when deploying to:
  // https://saddizarif.github.io/BBT230-Research/
  base: '/BBT230-Research/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
