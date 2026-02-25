import { existsSync } from 'fs'
import { resolve } from 'path'
import type { FoConfig } from '../../src/types.js'

const CONFIG_FILENAMES = ['fo.config.ts', 'fo.config.js', 'fo.config.mjs']

export function findConfigFile(cwd = process.cwd()): string | null {
  for (const name of CONFIG_FILENAMES) {
    const full = resolve(cwd, name)
    if (existsSync(full)) return full
  }
  return null
}

export async function loadConfig(configPath: string): Promise<FoConfig> {
  if (!configPath.endsWith('.ts')) {
    const mod = await import(configPath) as { default?: FoConfig }
    if (!mod.default) {
      throw new Error(`${configPath} must have a default export from defineConfig()`)
    }
    return mod.default
  }

  // TypeScript — pipe through tsx via stdin (no temp files)
  const { execSync } = await import('child_process')
  const abs = resolve(configPath)
  const fileUrl = 'file://' + abs.replace(/\\/g, '/')
  const script = `import c from ${JSON.stringify(fileUrl)}; process.stdout.write(JSON.stringify(c.default ?? c))`

  try {
    const raw = execSync('node --input-type=module --import tsx/esm', {
      input: script,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    return JSON.parse(raw) as FoConfig
  } catch (err) {
    throw new Error(
      `Failed to load ${configPath}.\n` +
      `Make sure tsx is installed: npm install -D tsx\n` +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

export function checkEnvVars(required: string[]): { missing: string[] } {
  const missing = required.filter((key) => !process.env[key])
  return { missing }
}
