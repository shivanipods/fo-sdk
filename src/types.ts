import type { z } from 'zod'

// ─── Tool Context ──────────────────────────────────────────────────────────────
// What SDK tools receive at execution time. Intentionally minimal —
// only what a custom tool needs, no Fo internals exposed.

export interface MessageContext {
  /** Email address of the person who sent the message */
  from: string
  /** The agent's email address (e.g. atlas@foibleai.com) */
  to: string
  subject: string
  body: string
  threadId: string
  messageId: string
}

export interface AgentContext {
  name: string
  email: string
}

export interface ToolContext {
  message: MessageContext
  agent: AgentContext
  /** Environment variables declared in the tool's `env` array, guaranteed present */
  env: Record<string, string>
  /** Tool-scoped logger — appears in Fo dashboard logs */
  log: (message: string) => void
}

// ─── Tool Definition ───────────────────────────────────────────────────────────

export interface FoTool<TParams extends z.ZodSchema = z.ZodSchema> {
  readonly name: string
  readonly description: string
  readonly parameters: TParams
  /** Environment variable names this tool requires. Validated at deploy time. */
  readonly env: readonly string[]
  readonly execute: (params: z.infer<TParams>, context: ToolContext) => Promise<unknown>
  readonly _brand: 'FoTool'
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AgentIdentity {
  /** Display name shown in email signatures and logs */
  name: string
  /**
   * Subdomain for the agent's email address.
   * "atlas" → atlas@foibleai.com
   * Must be lowercase alphanumeric + hyphens only.
   */
  email: string
}

export interface CustomToolRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: FoTool<any>
  /**
   * HTTPS URL where Fo calls this tool.
   * Must be publicly reachable from Fo's servers.
   */
  webhookUrl: string
  /**
   * Secret used to sign and verify webhook calls (HMAC-SHA256).
   * Use an env var reference: process.env.FO_SNOWFLAKE_SECRET
   */
  webhookSecret: string
}

export interface ToolsConfig {
  /** Email reading and sending (default: true) */
  email?: boolean
  /** Google Calendar access (default: true) */
  calendar?: boolean
  /** Browser automation via OpenClaw (default: false) */
  browser?: boolean
  custom?: CustomToolRegistration[]
}

export interface FoConfig {
  agent: AgentIdentity
  tools: ToolsConfig
  /**
   * Additional instructions layered on top of Fo's base EA reasoning.
   * Use this for org context, persona, domain-specific rules.
   */
  instructions?: string | undefined
  /**
   * Environment variable names required by this agent at runtime.
   * Validated at deploy time — deploy will fail if any are missing.
   */
  env?: string[] | undefined
  readonly _brand: 'FoConfig'
}

// ─── Webhook Types ─────────────────────────────────────────────────────────────

export interface WebhookPayload {
  tool: string
  params: Record<string, unknown>
  context: ToolContext
  agentId: string
  requestId: string
  /** Unix timestamp (seconds) */
  timestamp: number
}

export interface WebhookHeaders {
  'x-fo-signature': string
  'x-fo-timestamp': string
  'x-fo-agent-id': string
  'x-fo-request-id': string
}
