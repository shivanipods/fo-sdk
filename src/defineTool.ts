import type { z } from 'zod'
import type { FoTool, ToolContext } from './types.js'

interface DefineToolConfig<TParams extends z.ZodSchema> {
  /**
   * Unique tool name. Used by Fo's agent to identify and call this tool.
   * Must be lowercase alphanumeric with underscores (e.g. "query_snowflake").
   */
  name: string
  /**
   * Clear description of what this tool does and when the agent should use it.
   * This is what the agent reads when deciding which tool to call — be specific.
   */
  description: string
  /**
   * Zod schema defining the parameters this tool accepts.
   * Use .describe() on fields to guide the agent on what to pass.
   */
  parameters: TParams
  /**
   * Environment variable names this tool requires.
   * Fo validates these are present before deploying and passes them in context.env.
   */
  env?: string[]
  /**
   * The tool implementation. Runs in your infrastructure, not Fo's.
   * Fo calls this via signed webhook — your credentials never leave your servers.
   */
  execute: (params: z.infer<TParams>, context: ToolContext) => Promise<unknown>
}

const TOOL_NAME_REGEX = /^[a-z][a-z0-9_]*$/

/**
 * Define a custom tool for your Fo agent.
 *
 * @example
 * ```ts
 * import { defineTool } from '@fo/sdk'
 * import { z } from 'zod'
 *
 * export default defineTool({
 *   name: 'query_crm',
 *   description: 'Look up a contact or deal in Salesforce CRM',
 *   parameters: z.object({
 *     query: z.string().describe('Contact name, email, or deal name to search for'),
 *   }),
 *   env: ['SALESFORCE_TOKEN'],
 *   execute: async ({ query }, { env, log }) => {
 *     log(`Searching CRM for: ${query}`)
 *     const result = await salesforce.search(env.SALESFORCE_TOKEN, query)
 *     return result.records
 *   },
 * })
 * ```
 */
export function defineTool<TParams extends z.ZodSchema>(
  config: DefineToolConfig<TParams>
): FoTool<TParams> {
  if (!TOOL_NAME_REGEX.test(config.name)) {
    throw new Error(
      `Tool name "${config.name}" is invalid. ` +
      `Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`
    )
  }

  if (config.name.length > 64) {
    throw new Error(`Tool name "${config.name}" is too long. Maximum 64 characters.`)
  }

  if (!config.description.trim()) {
    throw new Error(`Tool "${config.name}" must have a non-empty description.`)
  }

  if (config.description.length > 1024) {
    throw new Error(`Tool "${config.name}" description is too long. Maximum 1024 characters.`)
  }

  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    env: config.env ?? [],
    execute: config.execute,
    _brand: 'FoTool',
  }
}
