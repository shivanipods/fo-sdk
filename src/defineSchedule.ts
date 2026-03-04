import type { FoSchedule } from './types.js'

interface DefineScheduleConfig {
  /**
   * Unique schedule name (e.g. 'weekly_sprint_digest').
   * Must be lowercase alphanumeric with underscores.
   */
  name: string
  /**
   * Cron expression defining when this schedule fires.
   * Examples:
   * - '0 9 * * MON'    — every Monday at 9am
   * - '0 8 * * 1-5'    — weekdays at 8am
   * - '0 */6 * * *'    — every 6 hours
   */
  cron: string
  /**
   * IANA timezone name (e.g. 'America/Los_Angeles', 'Europe/London').
   * Defaults to UTC if not specified.
   */
  timezone?: string
  /**
   * Prompt describing what the agent should do on each run.
   * The agent has full access to configured actions and the context store.
   *
   * @example 'Check context for recent deals. Email the founder a concise weekly summary.'
   */
  prompt: string
}

const SCHEDULE_NAME_REGEX = /^[a-z][a-z0-9_]*$/

/**
 * Define a proactive scheduled run for your Fo agent.
 *
 * Schedules run on a cron — the agent wakes up, reads context,
 * and executes the prompt without any incoming message.
 *
 * Fo auto-generates a GitHub Actions YAML file when you deploy,
 * so schedules run reliably without any infrastructure to manage.
 *
 * @example
 * ```ts
 * import { defineSchedule } from '@fo/sdk'
 *
 * export const weeklyDigest = defineSchedule({
 *   name: 'weekly_sprint_digest',
 *   cron: '0 9 * * MON',
 *   timezone: 'America/Los_Angeles',
 *   prompt: 'Check context for recent deals. Email the founder a concise weekly summary.',
 * })
 * ```
 */
export function defineSchedule(config: DefineScheduleConfig): FoSchedule {
  if (!SCHEDULE_NAME_REGEX.test(config.name)) {
    throw new Error(
      `Schedule name "${config.name}" is invalid. ` +
      `Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`
    )
  }

  if (!config.cron.trim()) {
    throw new Error(`Schedule "${config.name}" must have a non-empty cron expression.`)
  }

  if (!config.prompt.trim()) {
    throw new Error(`Schedule "${config.name}" must have a non-empty prompt.`)
  }

  return {
    name: config.name,
    cron: config.cron,
    timezone: config.timezone,
    prompt: config.prompt,
    _brand: 'FoSchedule',
  }
}
