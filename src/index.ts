export { defineTool } from './defineTool.js'
export { defineConfig } from './defineConfig.js'
export { verifyWebhook, createToolHandler, WebhookVerificationError } from './webhook.js'
export type {
  FoTool,
  FoConfig,
  ToolContext,
  MessageContext,
  AgentContext,
  AgentIdentity,
  CustomToolRegistration,
  ToolsConfig,
  WebhookPayload,
  WebhookHeaders,
} from './types.js'

// Testing utilities — import from '@fo/sdk/testing' to keep test deps out of prod bundles
export {
  createMockToolContext,
  signWebhookPayload,
  createMockWebhookRequest,
} from './testing.js'
