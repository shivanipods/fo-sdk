import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const FO_DIR = join(homedir(), '.fo')
const CREDENTIALS_FILE = join(FO_DIR, 'credentials.json')

interface StoredCredentials {
  apiKey: string
  email: string
  createdAt: string
}

export function getStoredCredentials(): StoredCredentials | null {
  if (!existsSync(CREDENTIALS_FILE)) return null
  try {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')) as StoredCredentials
  } catch {
    return null
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  if (!existsSync(FO_DIR)) {
    mkdirSync(FO_DIR, { recursive: true, mode: 0o700 })
  }
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 })
}

export function clearCredentials(): void {
  if (existsSync(CREDENTIALS_FILE)) {
    unlinkSync(CREDENTIALS_FILE)
  }
}

export function requireAuth(): StoredCredentials {
  const creds = getStoredCredentials()
  if (!creds) {
    throw new Error(
      'Not authenticated. Run `fo auth` to connect your Fo account.'
    )
  }
  return creds
}

export const FO_API_BASE = process.env.FO_API_URL ?? 'https://api.foibleai.com/v1'
