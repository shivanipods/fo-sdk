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

// ─── Action Definition (v2) ────────────────────────────────────────────────────

/**
 * Human-in-the-loop mode for an action.
 * - `'auto'`   — Fo's confidence model decides when to ask for approval
 * - `'always'` — every execution requires explicit approval
 * - `'never'`  — execute without approval (use for read-only / low-risk actions)
 */
export type HitlMode = 'auto' | 'always' | 'never'

export interface FoAction<TParams extends z.ZodSchema = z.ZodSchema> {
  readonly name: string
  readonly description: string
  readonly parameters: TParams
  /** Environment variable names this action requires. Validated at deploy time. */
  readonly env: readonly string[]
  /** Human-in-the-loop mode. Defaults to 'auto'. */
  readonly hitl: HitlMode
  readonly execute: (params: z.infer<TParams>, context: ToolContext) => Promise<unknown>
  readonly _brand: 'FoAction'
}

/**
 * @deprecated Use `FoAction` instead. `FoTool` is kept for backward compatibility.
 */
export type FoTool<TParams extends z.ZodSchema = z.ZodSchema> = FoAction<TParams>

// ─── Schedule Definition (v2) ─────────────────────────────────────────────────

export interface FoSchedule {
  readonly name: string
  /** Cron expression (e.g. '0 9 * * MON' for every Monday at 9am) */
  readonly cron: string
  /** IANA timezone (e.g. 'America/Los_Angeles'). Defaults to UTC. */
  readonly timezone?: string
  /**
   * Prompt describing what the agent should do on each run.
   * The agent has access to all configured tools and the context store.
   */
  readonly prompt: string
  readonly _brand: 'FoSchedule'
}

// ─── Trigger Definition (v2) ──────────────────────────────────────────────────

export interface FoTrigger<TSchema extends z.ZodSchema = z.ZodSchema> {
  readonly name: string
  /**
   * Zod schema for the event payload. Fields are available as `{{fieldName}}`
   * template variables in the prompt.
   */
  readonly schema: TSchema
  /**
   * Prompt template. Use `{{fieldName}}` to interpolate event payload fields.
   * Example: 'New deal "{{dealName}}" worth ${{value}}. Notify the founder.'
   */
  readonly prompt: string
  readonly _brand: 'FoTrigger'
}

// ─── Config (v1 — kept for backward compatibility) ────────────────────────────

export interface CustomToolRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: FoAction<any>
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

/**
 * @deprecated Use `FoAgent` and `defineAgent()` instead.
 */
export interface FoConfig {
  agent: AgentIdentity
  tools: ToolsConfig
  instructions?: string | undefined
  env?: string[] | undefined
  readonly _brand: 'FoConfig'
}

// ─── Agent Config (v2) ────────────────────────────────────────────────────────

export interface ActionRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: FoAction<any>
  /**
   * HTTPS URL where Fo calls this action.
   * Must be publicly reachable from Fo's servers.
   */
  webhookUrl: string
  /**
   * Secret used to sign and verify webhook calls (HMAC-SHA256).
   */
  webhookSecret: string
}

export interface ActionsConfig {
  /** Email reading and sending (default: true) */
  email?: boolean
  /** Google Calendar access (default: true) */
  calendar?: boolean
  /** Browser automation via OpenClaw (default: false) */
  browser?: boolean
  custom?: ActionRegistration[]
}

export interface FoAgent {
  agent: AgentIdentity
  /**
   * GitHub repository slug for the agent (e.g. 'acme-corp/atlas-agent').
   * Used to auto-generate GitHub Actions YAML for schedules and triggers.
   */
  repo?: string
  actions: ActionsConfig
  schedules?: FoSchedule[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggers?: FoTrigger<any>[]
  /**
   * Context configuration — how Fo populates this agent's knowledge store.
   * Define ingestion tools or datastore connectors here instead of
   * manually calling fo.context.ingest() from your own pipelines.
   */
  context?: ContextConfig
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
  readonly _brand: 'FoAgent'
}

// ─── Context Store (v2) ───────────────────────────────────────────────────────

/**
 * @deprecated Use `ContextEpisode` instead. Pass `{ type: 'text', id, data, source }`.
 * `ContextDocument` is kept for backward compatibility.
 */
export interface ContextDocument {
  /** Stable identifier for this document. Used for idempotent re-ingest. */
  id: string
  /** Short display title */
  title: string
  /** Document content — plain text or markdown */
  content: string
  /** Source system label (e.g. 'salesforce', 'notion', 'linear') */
  source?: string
}

/** Unstructured text or markdown. Fo handles chunking and embedding. */
export interface TextEpisode {
  type: 'text'
  /** Stable identifier. Re-ingesting with the same id updates in place. */
  id: string
  /** Plain text or markdown content. */
  data: string
  /** Source system label (e.g. 'notion', 'github', 'discord'). */
  source?: string
}

/** Arbitrary JSON object. Fo serializes, indexes, and extracts structure automatically. */
export interface JsonEpisode {
  type: 'json'
  /** Stable identifier. Re-ingesting with the same id updates in place. */
  id: string
  /** Any JSON-serializable object. */
  data: Record<string, unknown>
  /** Source system label. */
  source?: string
}

/** Conversation turns. Fo extracts facts, entities, and relationships automatically. */
export interface MessagesEpisode {
  type: 'messages'
  /** Stable identifier for this conversation. */
  id: string
  /** Ordered conversation turns. */
  data: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Source system label. */
  source?: string
}

/** URL to fetch and index. Fo fetches, parses, and chunks the page content. */
export interface UrlEpisode {
  type: 'url'
  /** Stable identifier. Re-ingesting with the same id re-fetches and updates. */
  id: string
  /** Publicly accessible URL to fetch. */
  data: string
  /** Source system label. */
  source?: string
}

/**
 * A unit of context to ingest into the agent's knowledge store.
 *
 * Fo handles chunking, embedding, and structure extraction for all types.
 * Re-ingesting with the same `id` updates the document in place (idempotent).
 */
export type ContextEpisode = TextEpisode | JsonEpisode | MessagesEpisode | UrlEpisode | ContextDocument

// ─── Datastore Connectors ──────────────────────────────────────────────────────

export type DatastoreType =
  | 'snowflake'
  | 'postgres'
  | 'bigquery'
  | 'notion'
  | 'linear'
  | 's3'
  | 'discord'

export interface DatastoreConnector {
  /** The type of datastore to connect. */
  type: DatastoreType
  /**
   * Connection string or DSN for the datastore.
   * Use an env var reference — never hardcode credentials.
   * Required for: snowflake, postgres, bigquery, s3.
   */
  connectionString?: string
  /**
   * API key for the datastore.
   * Required for: notion, linear, discord.
   */
  apiKey?: string
  /**
   * SQL query or filter expression to scope what Fo reads.
   * Supports `:last_sync` as a placeholder for incremental sync.
   * @example 'SELECT * FROM customers WHERE updated_at > :last_sync'
   */
  query?: string
  /**
   * Cron expression for how often Fo re-syncs this datastore.
   * Defaults to hourly ('0 * * * *') if not specified.
   * @example '0 0 * * *' — once daily at midnight UTC
   */
  schedule?: string
}

// ─── Ingestion Tools ──────────────────────────────────────────────────────────

export interface IngestionToolRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: FoAction<any>
  /**
   * HTTPS URL where Fo calls this ingestion tool.
   * Must be publicly reachable from Fo's servers.
   */
  webhookUrl: string
  /**
   * Secret used to sign and verify webhook calls (HMAC-SHA256).
   */
  webhookSecret: string
  /**
   * Cron expression for how often Fo calls this tool to refresh context.
   * Defaults to hourly ('0 * * * *') if not specified.
   */
  schedule?: string
}

/**
 * Context configuration for an agent.
 * Defines how Fo populates the agent's knowledge store automatically.
 */
export interface ContextConfig {
  /**
   * A custom action that fetches and returns context data.
   * Fo calls this on the defined schedule and ingests the result.
   * Use this for any data source not covered by built-in datastores.
   */
  ingestionTool?: IngestionToolRegistration
  /**
   * Direct datastore connections. Fo syncs these on the defined schedule.
   * Credentials are read from the env vars you specify in the agent's `env` array.
   */
  datastores?: DatastoreConnector[]
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
