import type { FoAgent, ActionsConfig, FoSchedule, FoTrigger, AgentIdentity, ContextConfig } from './types.js'

interface DefineAgentInput {
  agent: AgentIdentity
  /**
   * GitHub repository slug (e.g. 'acme-corp/atlas-agent').
   * Required when using schedules or triggers — Fo uses this to generate
   * the GitHub Actions YAML that runs your scheduled and event-based agents.
   */
  repo?: string
  actions?: ActionsConfig
  schedules?: FoSchedule[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggers?: FoTrigger<any>[]
  /**
   * Context configuration — how Fo populates this agent's knowledge store.
   * Instead of manually calling fo.context.ingest() from your own pipelines,
   * define an ingestion tool or connect datastores directly here.
   *
   * @example
   * ```ts
   * context: {
   *   ingestionTool: {
   *     action: fetchDiscordContext,
   *     webhookUrl: 'https://my-app.com/context/discord',
   *     webhookSecret: process.env.FO_CONTEXT_SECRET!,
   *     schedule: '0 * * * *',
   *   },
   *   datastores: [
   *     { type: 'notion', apiKey: process.env.NOTION_TOKEN, schedule: '0 0 * * *' },
   *     { type: 'snowflake', connectionString: process.env.SNOWFLAKE_DSN, query: 'SELECT * FROM crm WHERE updated_at > :last_sync' },
   *   ],
   * }
   * ```
   */
  context?: ContextConfig
  instructions?: string
  env?: string[]
}

const AGENT_EMAIL_REGEX = /^[a-z][a-z0-9-]*$/
const RESERVED_NAMES = new Set(['fo', 'maybelle', 'admin', 'support', 'noreply', 'help'])

/**
 * Define your Fo agent configuration (v2).
 *
 * @example
 * ```ts
 * import { defineAgent, defineAction, defineSchedule, defineTrigger } from '@fo/sdk'
 * import { z } from 'zod'
 * import { createDeal } from './actions/crm.js'
 *
 * export const weeklyDigest = defineSchedule({
 *   name: 'weekly_digest',
 *   cron: '0 9 * * MON',
 *   timezone: 'America/Los_Angeles',
 *   prompt: 'Email the founder a concise weekly summary of open deals.',
 * })
 *
 * export const dealCreated = defineTrigger({
 *   name: 'deal_created',
 *   schema: z.object({ dealName: z.string(), value: z.number() }),
 *   prompt: 'New deal "{{dealName}}" worth ${{value}}. Notify the founder.',
 * })
 *
 * export default defineAgent({
 *   agent: { name: 'Atlas', email: 'atlas' },
 *   repo: 'acme-corp/atlas-agent',
 *   actions: {
 *     email: true,
 *     calendar: true,
 *     browser: false,
 *     custom: [
 *       {
 *         action: createDeal,
 *         webhookUrl: 'https://my-app.com/actions/create_deal',
 *         webhookSecret: process.env.FO_SECRET!,
 *       },
 *     ],
 *   },
 *   schedules: [weeklyDigest],
 *   triggers: [dealCreated],
 *   instructions: `
 *     Use search_context and qa_context before answering any question about contacts or deals.
 *   `,
 * })
 * ```
 */
export function defineAgent(input: DefineAgentInput): FoAgent {
  const { agent, actions = {}, schedules = [], triggers = [], context, instructions, env = [], repo } = input

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

  // Validate repo format when provided
  if (repo !== undefined && repo.trim()) {
    if (!repo.includes('/')) {
      throw new Error(
        `repo "${repo}" is invalid. Must be a GitHub slug in the format "owner/repo-name".`
      )
    }
  }

  // Validate schedules require repo
  if (schedules.length > 0 && !repo) {
    throw new Error(
      `defineAgent: "repo" is required when using schedules. ` +
      `Fo generates GitHub Actions YAML to run your schedules — it needs the repo to write to.`
    )
  }

  // Validate custom actions have required fields and correct brand
  for (const registration of actions.custom ?? []) {
    if (!registration.action._brand || registration.action._brand !== 'FoAction') {
      throw new Error(
        'Each custom action must be created with defineAction(). ' +
        'Check your actions are proper FoAction instances.'
      )
    }

    if (!registration.webhookUrl.startsWith('https://')) {
      throw new Error(
        `Custom action "${registration.action.name}" has an invalid webhookUrl. ` +
        `Must be an HTTPS URL (e.g. "https://my-app.com/actions/${registration.action.name}").`
      )
    }

    if (!registration.webhookSecret) {
      throw new Error(
        `Custom action "${registration.action.name}" is missing a webhookSecret. ` +
        `Provide a secret to verify webhook calls from Fo.`
      )
    }
  }

  // Validate schedule brands
  for (const schedule of schedules) {
    if (schedule._brand !== 'FoSchedule') {
      throw new Error(
        'Each schedule must be created with defineSchedule(). ' +
        `Got unexpected value in schedules array.`
      )
    }
  }

  // Validate trigger brands
  for (const trigger of triggers) {
    if (trigger._brand !== 'FoTrigger') {
      throw new Error(
        'Each trigger must be created with defineTrigger(). ' +
        `Got unexpected value in triggers array.`
      )
    }
  }

  // Validate ingestion tool if provided
  if (context?.ingestionTool) {
    const { action, webhookUrl, webhookSecret } = context.ingestionTool

    if (!action._brand || action._brand !== 'FoAction') {
      throw new Error(
        'context.ingestionTool.action must be created with defineAction().'
      )
    }

    if (!webhookUrl.startsWith('https://')) {
      throw new Error(
        `context.ingestionTool "${action.name}" has an invalid webhookUrl. ` +
        `Must be an HTTPS URL.`
      )
    }

    if (!webhookSecret) {
      throw new Error(
        `context.ingestionTool "${action.name}" is missing a webhookSecret.`
      )
    }
  }

  // Validate datastores if provided
  for (const ds of context?.datastores ?? []) {
    if (!ds.type) {
      throw new Error('Each datastore connector must have a type.')
    }

    const sqlTypes = ['snowflake', 'postgres', 'bigquery', 's3']
    const apiTypes = ['notion', 'linear', 'discord']

    if (sqlTypes.includes(ds.type) && !ds.connectionString) {
      throw new Error(
        `Datastore connector "${ds.type}" requires a connectionString. ` +
        `Reference it from an env var: process.env.${ds.type.toUpperCase()}_DSN`
      )
    }

    if (apiTypes.includes(ds.type) && !ds.apiKey) {
      throw new Error(
        `Datastore connector "${ds.type}" requires an apiKey. ` +
        `Reference it from an env var: process.env.${ds.type.toUpperCase()}_TOKEN`
      )
    }
  }

  return {
    agent,
    repo,
    actions: {
      email: actions.email ?? true,
      calendar: actions.calendar ?? true,
      browser: actions.browser ?? false,
      custom: actions.custom ?? [],
    },
    schedules,
    triggers,
    context,
    instructions,
    env,
    _brand: 'FoAgent',
  }
}
