import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// In CI, env vars are injected directly — no .env file needed.
// Locally, load from the service .env so tests run from monorepo root.
const envPath = resolve(__dirname, '../.env')

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}
