import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages palvelee sivun osoitteessa https://<käyttäjä>.github.io/hajuvesi/
export default defineConfig({
  base: '/hajuvesi/',
  plugins: [react()],
})
