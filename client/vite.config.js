import fs from 'node:fs'
import { defineConfig } from 'vite'

const keyPath = process.env.VITE_HTTPS_KEY
const certPath = process.env.VITE_HTTPS_CERT
const https =
  keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : false

export default defineConfig({
  server: {
    host: '0.0.0.0',
    https,
    proxy: {
      '/research': {
        target: 'https://localhost:3001',
        secure: false,
      },
    },
  },
})
