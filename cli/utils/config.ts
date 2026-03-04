import { existsSync } from 'fs'
import { resolve } from 'path'
import type { FoConfig, FoAgent } from '../../src/types.js'

export type AnyAgentConfig = FoConfig | FoAgent

const CONFIG_FILENAMES = ['fo.config.ts', 'fo.config.js', 'fo.config.mjs']

export function findConfigFile(cwd = process.cwd()): string | null {
  for (const name of CONFIG_FILENAMES) {
    const full = resolve(cwd, name)
    if (existsSync(full)) return full
  }
  return null
}

export async function loadConfig(configPath: string): Promise<AnyAgentConfig> {
  if (!configPath.endsWith('.ts')) {
    const mod = await import(configPath) as { default?: AnyAgentConfig }
    if (!mod.default) {
      throw new Error(`${configPath} must have a default export from defineAgent() or defineConfig()`)
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
    return JSON.parse(raw) as AnyAgentConfig
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

/**
 * Normalize a loaded config (FoConfig or FoAgent) into a consistent shape
 * for use by CLI commands. Abstracts away the tools vs. actions rename.
 */
export function normalizeConfig(config: AnyAgentConfig): {
  agentName: string
  agentEmail: string
  repo?: string
  instructions?: string
  env: string[]
  capabilities: { email: boolean; calendar: boolean; browser: boolean }
  customItems: Array<{
    name: string
    description: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: any
    env: readonly string[]
    hitl?: string
    webhookUrl: string
    webhookSecret: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (...args: any[]) => Promise<unknown>
  }>
  schedules: Array<{ name: string; cron: string; timezone?: string; prompt: string }>
  triggers: Array<{ name: string; prompt: string }>
} {
  const isV2 = config._brand === 'FoAgent'

  const capabilities = isV2
    ? {
        email: (config as import('../../src/types.js').FoAgent).actions.email ?? true,
        calendar: (config as import('../../src/types.js').FoAgent).actions.calendar ?? true,
        browser: (config as import('../../src/types.js').FoAgent).actions.browser ?? false,
      }
    : {
        email: (config as import('../../src/types.js').FoConfig).tools.email ?? true,
        calendar: (config as import('../../src/types.js').FoConfig).tools.calendar ?? true,
        browser: (config as import('../../src/types.js').FoConfig).tools.browser ?? false,
      }

  const customItems = isV2
    ? ((config as import('../../src/types.js').FoAgent).actions.custom ?? []).map((reg) => ({
        name: reg.action.name,
        description: reg.action.description,
        parameters: reg.action.parameters,
        env: reg.action.env,
        hitl: reg.action.hitl,
        webhookUrl: reg.webhookUrl,
        webhookSecret: reg.webhookSecret,
        execute: reg.action.execute,
      }))
    : ((config as import('../../src/types.js').FoConfig).tools.custom ?? []).map((reg) => ({
        name: reg.tool.name,
        description: reg.tool.description,
        parameters: reg.tool.parameters,
        env: reg.tool.env,
        hitl: reg.tool.hitl,
        webhookUrl: reg.webhookUrl,
        webhookSecret: reg.webhookSecret,
        execute: reg.tool.execute,
      }))

  const v2Config = config as import('../../src/types.js').FoAgent

  return {
    agentName: config.agent.name,
    agentEmail: config.agent.email,
    repo: isV2 ? v2Config.repo : undefined,
    instructions: config.instructions,
    env: config.env ?? [],
    capabilities,
    customItems,
    schedules: isV2 ? (v2Config.schedules ?? []).map((s) => ({
      name: s.name,
      cron: s.cron,
      timezone: s.timezone,
      prompt: s.prompt,
    })) : [],
    triggers: isV2 ? (v2Config.triggers ?? []).map((t) => ({
      name: t.name,
      prompt: t.prompt,
    })) : [],
  }
}
