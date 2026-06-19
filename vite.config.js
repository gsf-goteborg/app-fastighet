import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' ger relativa sökvägar så bygget fungerar oavsett var det hostas
// (lokalt, internt, eller på GitHub Pages under /repo-namn/).
export default defineConfig({
  plugins: [react()],
  base: './',
})
