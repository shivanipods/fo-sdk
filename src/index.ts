// ─── v2 API (recommended) ──────────────────────────────────────────────────────
export { defineAction } from './defineAction.js'
export { defineAgent } from './defineAgent.js'
export { defineSchedule } from './defineSchedule.js'
export { defineTrigger } from './defineTrigger.js'
export { FoClient } from './client.js'

// ─── v1 API (backward compatible) ─────────────────────────────────────────────
// defineTool → alias for defineAction (hitl defaults to 'auto')
export { defineAction as defineTool } from './defineAction.js'
// defineConfig still works — accepts the old 'tools' shape
export { defineConfig } from './defineConfig.js'

// ─── Webhook utilities ─────────────────────────────────────────────────────────
export { verifyWebhook, createToolHandler, WebhookVerificationError } from './webhook.js'

// ─── Types ─────────────────────────────────────────────────────────────────────
export type {
  // v2 types
  FoAction,
  FoAgent,
  FoSchedule,
  FoTrigger,
  HitlMode,
  ActionsConfig,
  ActionRegistration,
  // Context store
  ContextEpisode,
  TextEpisode,
  JsonEpisode,
  MessagesEpisode,
  UrlEpisode,
  DatastoreType,
  DatastoreConnector,
  IngestionToolRegistration,
  ContextConfig,
  // v1 types (backward compat)
  ContextDocument,
  FoTool,
  FoConfig,
  ToolsConfig,
  CustomToolRegistration,
  // Shared
  ToolContext,
  MessageContext,
  AgentContext,
  AgentIdentity,
  WebhookPayload,
  WebhookHeaders,
} from './types.js'

// Testing utilities — import from '@fo/sdk/testing' to keep test deps out of prod bundles
export {
  createMockToolContext,
  signWebhookPayload,
  createMockWebhookRequest,
} from './testing.js'
