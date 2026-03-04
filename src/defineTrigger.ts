import type { z } from 'zod'
import type { FoTrigger } from './types.js'

interface DefineTriggerConfig<TSchema extends z.ZodSchema> {
  /**
   * Unique trigger name (e.g. 'deal_created').
   * Must be lowercase alphanumeric with underscores.
   */
  name: string
  /**
   * Zod schema for the event payload.
   * Fields become available as `{{fieldName}}` template variables in the prompt.
   */
  schema: TSchema
  /**
   * Prompt template. Use `{{fieldName}}` to interpolate event payload fields.
   * The agent has full access to configured actions and the context store.
   *
   * @example 'New deal "{{dealName}}" worth ${{value}}. Notify the founder.'
   */
  prompt: string
}

const TRIGGER_NAME_REGEX = /^[a-z][a-z0-9_]*$/

/**
 * Define an event-based trigger for your Fo agent.
 *
 * Triggers fire when your system calls `fo.triggers.fire(name, payload)`.
 * The agent receives the interpolated prompt and acts immediately.
 *
 * Use triggers for: CRM events, webhook notifications, pipeline completions,
 * or any moment when you want the agent to take proactive action.
 *
 * @example
 * ```ts
 * import { defineTrigger } from '@fo/sdk'
 * import { z } from 'zod'
 *
 * export const dealCreated = defineTrigger({
 *   name: 'deal_created',
 *   schema: z.object({
 *     dealName: z.string(),
 *     value: z.number(),
 *   }),
 *   prompt: 'New deal "{{dealName}}" worth ${{value}}. Notify the founder.',
 * })
 * ```
 */
export function defineTrigger<TSchema extends z.ZodSchema>(
  config: DefineTriggerConfig<TSchema>
): FoTrigger<TSchema> {
  if (!TRIGGER_NAME_REGEX.test(config.name)) {
    throw new Error(
      `Trigger name "${config.name}" is invalid. ` +
      `Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`
    )
  }

  if (!config.prompt.trim()) {
    throw new Error(`Trigger "${config.name}" must have a non-empty prompt.`)
  }

  return {
    name: config.name,
    schema: config.schema,
    prompt: config.prompt,
    _brand: 'FoTrigger',
  }
}
