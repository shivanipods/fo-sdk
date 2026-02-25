import type { FoConfig, ToolsConfig, AgentIdentity } from './types.js'

interface DefineConfigInput {
  agent: AgentIdentity
  tools?: ToolsConfig
  instructions?: string
  env?: string[]
}

const AGENT_EMAIL_REGEX = /^[a-z][a-z0-9-]*$/
const RESERVED_NAMES = new Set(['fo', 'maybelle', 'admin', 'support', 'noreply', 'help'])

/**
 * Define your Fo agent configuration.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@fo/sdk'
 * import snowflake from './tools/snowflake.js'
 *
 * export default defineConfig({
 *   agent: {
 *     name: 'Atlas',
 *     email: 'atlas', // → atlas@foibleai.com
 *   },
 *   tools: {
 *     email: true,
 *     calendar: true,
 *     browser: false,
 *     custom: [
 *       {
 *         tool: snowflake,
 *         webhookUrl: 'https://my-app.com/tools/snowflake',
 *         webhookSecret: process.env.FO_SNOWFLAKE_SECRET!,
 *       },
 *     ],
 *   },
 *   instructions: `
 *     You are Atlas, EA to the founder of Acme Corp.
 *     Always check the data warehouse before answering questions about metrics.
 *     Priority contacts: board members and investors.
 *   `,
 *   env: ['SNOWFLAKE_URL', 'SNOWFLAKE_KEY'],
 * })
 * ```
 */
export function defineConfig(input: DefineConfigInput): FoConfig {
  const { agent, tools = {}, instructions, env = [] } = input

  // Validate agent identity
  if (!agent.name.trim()) {
    throw new Error('agent.name must be a non-empty string')
  }

  if (agent.email.includes('@')) {
    throw new Error(
      `agent.email should be just the subdomain (e.g. "atlas"), not a full address. ` +
      `Fo will provision atlas@foibleai.com for you.`
    )
  }

  if (!AGENT_EMAIL_REGEX.test(agent.email)) {
    throw new Error(
      `agent.email "${agent.email}" is invalid. ` +
      `Must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.`
    )
  }

  if (RESERVED_NAMES.has(agent.email)) {
    throw new Error(`agent.email "${agent.email}" is reserved. Choose a different name.`)
  }

  // Validate custom tools have required fields
  for (const registration of tools.custom ?? []) {
    if (!registration.tool._brand || registration.tool._brand !== 'FoTool') {
      throw new Error(
        'Each custom tool must be created with defineTool(). ' +
        'Check your tools are proper FoTool instances.'
      )
    }

    if (!registration.webhookUrl.startsWith('https://')) {
      throw new Error(
        `Custom tool "${registration.tool.name}" has an invalid webhookUrl. ` +
        `Must be an HTTPS URL (e.g. "https://my-app.com/tools/${registration.tool.name}").`
      )
    }

    if (!registration.webhookSecret) {
      throw new Error(
        `Custom tool "${registration.tool.name}" is missing a webhookSecret. ` +
        `Provide a secret to verify webhook calls from Fo.`
      )
    }
  }

  return {
    agent,
    tools: {
      email: tools.email ?? true,
      calendar: tools.calendar ?? true,
      browser: tools.browser ?? false,
      custom: tools.custom ?? [],
    },
    instructions,
    env,
    _brand: 'FoConfig',
  }
}
