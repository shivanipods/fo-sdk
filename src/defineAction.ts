import type { z } from 'zod'
import type { FoAction, HitlMode, ToolContext } from './types.js'

interface DefineActionConfig<TParams extends z.ZodSchema> {
  /**
   * Unique action name. Used by Fo's agent to identify and call this action.
   * Must be lowercase alphanumeric with underscores (e.g. "create_deal").
   */
  name: string
  /**
   * Clear description of what this action does and when the agent should use it.
   * This is what the agent reads when deciding which action to call — be specific.
   */
  description: string
  /**
   * Zod schema defining the parameters this action accepts.
   * Use .describe() on fields to guide the agent on what to pass.
   */
  parameters: TParams
  /**
   * Human-in-the-loop mode.
   * - `'auto'`   — Fo's confidence model decides when to ask for approval (default)
   * - `'always'` — every execution requires explicit approval
   * - `'never'`  — execute without approval (use for read-only / low-risk actions)
   */
  hitl?: HitlMode
  /**
   * Environment variable names this action requires.
   * Fo validates these are present before deploying and passes them in context.env.
   */
  env?: string[]
  /**
   * The action implementation. Runs in your infrastructure, not Fo's.
   * Fo calls this via signed webhook — your credentials never leave your servers.
   */
  execute: (params: z.infer<TParams>, context: ToolContext) => Promise<unknown>
}

const ACTION_NAME_REGEX = /^[a-z][a-z0-9_]*$/

/**
 * Define a custom action for your Fo agent.
 *
 * Actions run in your infrastructure via signed webhooks.
 * Set `hitl` to control when Fo asks for human approval before executing.
 *
 * @example
 * ```ts
 * import { defineAction } from '@fo/sdk'
 * import { z } from 'zod'
 *
 * export const createDeal = defineAction({
 *   name: 'create_deal',
 *   description: 'Create a deal in Salesforce. Require approval for deals over $10k.',
 *   parameters: z.object({
 *     name: z.string().describe('Deal name'),
 *     value: z.number().describe('Deal value in USD'),
 *   }),
 *   hitl: 'auto',
 *   env: ['SALESFORCE_TOKEN'],
 *   execute: async ({ name, value }, { env, log }) => {
 *     log(`Creating deal: ${name} ($${value})`)
 *     // ...
 *   },
 * })
 * ```
 */
export function defineAction<TParams extends z.ZodSchema>(
  config: DefineActionConfig<TParams>
): FoAction<TParams> {
  if (!ACTION_NAME_REGEX.test(config.name)) {
    throw new Error(
      `Action name "${config.name}" is invalid. ` +
      `Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`
    )
  }

  if (config.name.length > 64) {
    throw new Error(`Action name "${config.name}" is too long. Maximum 64 characters.`)
  }

  if (!config.description.trim()) {
    throw new Error(`Action "${config.name}" must have a non-empty description.`)
  }

  if (config.description.length > 1024) {
    throw new Error(`Action "${config.name}" description is too long. Maximum 1024 characters.`)
  }

  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    env: config.env ?? [],
    hitl: config.hitl ?? 'auto',
    execute: config.execute,
    _brand: 'FoAction',
  }
}
