/**
 * @fo/sdk — Testing utilities
 *
 * Helpers for testing tools and webhook handlers without a real Fo server.
 *
 * @example
 * ```ts
 * import { createMockToolContext, signWebhookPayload } from '@fo/sdk/testing'
 *
 * test('my tool returns expected data', async () => {
 *   const ctx = createMockToolContext({ env: { MY_API_KEY: 'test-key' } })
 *   const result = await myTool.execute({ query: 'revenue' }, ctx)
 *   assert.ok(result)
 * })
 * ```
 */

import { createHmac } from 'crypto'
import type { ToolContext, WebhookPayload } from './types.js'

// ─── Context helpers ──────────────────────────────────────────────────────────

/**
 * Create a mock ToolContext for unit testing tool execute functions.
 * Logs are captured in the `logs` array so you can assert on them.
 */
export function createMockToolContext(overrides: Partial<ToolContext> & {
  env?: Record<string, string>
} = {}): ToolContext & { logs: string[] } {
  const logs: string[] = []

  return {
    message: {
      from: 'user@example.com',
      to: 'agent@foibleai.com',
      subject: 'Test subject',
      body: 'Test email body',
      threadId: 'thread_test_123',
      messageId: 'msg_test_123',
    },
    agent: {
      name: 'TestAgent',
      email: 'agent@foibleai.com',
    },
    env: {},
    log: (msg: string) => {
      logs.push(msg)
    },
    ...overrides,
    logs,
  }
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────

/**
 * Sign a webhook payload the same way Fo does.
 * Use this to create valid signed requests for testing createToolHandler.
 */
export function signWebhookPayload(
  body: string,
  secret: string
): { signature: string; timestamp: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`
  return { signature, timestamp }
}

/**
 * Create a complete signed WebhookPayload.
 * Returns both the payload object and the raw signed body string.
 */
export function createMockWebhookRequest(
  toolName: string,
  params: Record<string, unknown>,
  secret: string,
  contextOverrides: Partial<ToolContext> = {}
): { body: string; headers: Record<string, string>; payload: WebhookPayload } {
  const context = createMockToolContext(contextOverrides)
  const { logs: _logs, ...safeContext } = context as ToolContext & { logs: string[] }

  const payload: WebhookPayload = {
    tool: toolName,
    params,
    context: safeContext,
    agentId: 'test-agent',
    requestId: 'req_test_123',
    timestamp: Math.floor(Date.now() / 1000),
  }

  const body = JSON.stringify(payload)
  const { signature, timestamp } = signWebhookPayload(body, secret)

  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-fo-signature': signature,
      'x-fo-timestamp': timestamp,
      'x-fo-agent-id': 'test-agent',
      'x-fo-request-id': 'req_test_123',
    },
    payload,
  }
}
