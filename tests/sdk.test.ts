import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { defineTool } from '../src/defineTool.js'
import { defineConfig } from '../src/defineConfig.js'
import { verifyWebhook, WebhookVerificationError } from '../src/webhook.js'
import {
  createMockToolContext,
  signWebhookPayload,
  createMockWebhookRequest,
} from '../src/testing.js'

// ─── defineTool ───────────────────────────────────────────────────────────────

describe('defineTool', () => {
  test('creates a valid tool', () => {
    const tool = defineTool({
      name: 'my_tool',
      description: 'Does something useful',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => ({ result: query }),
    })

    assert.equal(tool.name, 'my_tool')
    assert.equal(tool._brand, 'FoTool')
    assert.deepEqual(tool.env, [])
  })

  test('rejects invalid tool names', () => {
    assert.throws(
      () => defineTool({ name: 'My Tool', description: 'x', parameters: z.object({}), execute: async () => {} }),
      /invalid/i
    )
    assert.throws(
      () => defineTool({ name: '1starts_with_number', description: 'x', parameters: z.object({}), execute: async () => {} }),
      /invalid/i
    )
    assert.throws(
      () => defineTool({ name: 'has-hyphen', description: 'x', parameters: z.object({}), execute: async () => {} }),
      /invalid/i
    )
  })

  test('rejects empty description', () => {
    assert.throws(
      () => defineTool({ name: 'my_tool', description: '   ', parameters: z.object({}), execute: async () => {} }),
      /description/i
    )
  })

  test('rejects names over 64 characters', () => {
    assert.throws(
      () => defineTool({ name: 'a'.repeat(65), description: 'x', parameters: z.object({}), execute: async () => {} }),
      /too long/i
    )
  })

  test('execute function receives typed params', async () => {
    const tool = defineTool({
      name: 'echo_tool',
      description: 'Echoes the input',
      parameters: z.object({ value: z.number() }),
      execute: async ({ value }) => ({ doubled: value * 2 }),
    })

    const ctx = createMockToolContext()
    const result = await tool.execute({ value: 21 }, ctx)
    assert.deepEqual(result, { doubled: 42 })
  })
})

// ─── defineConfig ─────────────────────────────────────────────────────────────

describe('defineConfig', () => {
  const validTool = defineTool({
    name: 'my_tool',
    description: 'Does something',
    parameters: z.object({}),
    execute: async () => ({}),
  })

  test('creates a valid config with defaults', () => {
    const config = defineConfig({
      agent: { name: 'Atlas', email: 'atlas' },
    })

    assert.equal(config.agent.email, 'atlas')
    assert.equal(config.tools.email, true)
    assert.equal(config.tools.calendar, true)
    assert.equal(config.tools.browser, false)
    assert.equal(config._brand, 'FoConfig')
  })

  test('rejects full email address in agent.email', () => {
    assert.throws(
      () => defineConfig({ agent: { name: 'Atlas', email: 'atlas@foibleai.com' } }),
      /subdomain/i
    )
  })

  test('rejects reserved agent email names', () => {
    assert.throws(
      () => defineConfig({ agent: { name: 'Fo', email: 'fo' } }),
      /reserved/i
    )
  })

  test('rejects non-HTTPS webhook URLs', () => {
    assert.throws(
      () => defineConfig({
        agent: { name: 'Atlas', email: 'atlas' },
        tools: {
          custom: [{
            tool: validTool,
            webhookUrl: 'http://insecure.com/tools/my_tool',
            webhookSecret: 'secret',
          }],
        },
      }),
      /HTTPS/i
    )
  })

  test('rejects custom tools missing webhook secret', () => {
    assert.throws(
      () => defineConfig({
        agent: { name: 'Atlas', email: 'atlas' },
        tools: {
          custom: [{
            tool: validTool,
            webhookUrl: 'https://my-app.com/tools/my_tool',
            webhookSecret: '',
          }],
        },
      }),
      /webhookSecret/i
    )
  })
})

// ─── verifyWebhook ────────────────────────────────────────────────────────────

describe('verifyWebhook', () => {
  const SECRET = 'test-webhook-secret-abc123'

  test('accepts valid signed request', () => {
    const body = JSON.stringify({ tool: 'my_tool', params: {} })
    const { signature, timestamp } = signWebhookPayload(body, SECRET)

    assert.doesNotThrow(() =>
      verifyWebhook(body, { 'x-fo-signature': signature, 'x-fo-timestamp': timestamp }, SECRET)
    )
  })

  test('rejects tampered body', () => {
    const body = JSON.stringify({ tool: 'my_tool', params: {} })
    const { signature, timestamp } = signWebhookPayload(body, SECRET)
    const tamperedBody = JSON.stringify({ tool: 'evil_tool', params: {} })

    assert.throws(
      () => verifyWebhook(tamperedBody, { 'x-fo-signature': signature, 'x-fo-timestamp': timestamp }, SECRET),
      WebhookVerificationError
    )
  })

  test('rejects wrong secret', () => {
    const body = JSON.stringify({ tool: 'my_tool', params: {} })
    const { signature, timestamp } = signWebhookPayload(body, 'wrong-secret')

    assert.throws(
      () => verifyWebhook(body, { 'x-fo-signature': signature, 'x-fo-timestamp': timestamp }, SECRET),
      WebhookVerificationError
    )
  })

  test('rejects stale timestamp (replay attack)', () => {
    const body = JSON.stringify({ tool: 'my_tool' })
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString()  // 6+ min ago
    const payload = `${oldTimestamp}.${body}`
    const signature = `sha256=${createHmac('sha256', SECRET).update(payload).digest('hex')}`

    assert.throws(
      () => verifyWebhook(body, { 'x-fo-signature': signature, 'x-fo-timestamp': oldTimestamp }, SECRET),
      WebhookVerificationError
    )
  })

  test('rejects missing headers', () => {
    const body = '{}'
    assert.throws(
      () => verifyWebhook(body, {}, SECRET),
      WebhookVerificationError
    )
  })
})

// ─── Testing utilities ────────────────────────────────────────────────────────

describe('createMockToolContext', () => {
  test('returns sensible defaults', () => {
    const ctx = createMockToolContext()
    assert.equal(ctx.message.from, 'user@example.com')
    assert.equal(ctx.agent.name, 'TestAgent')
    assert.deepEqual(ctx.env, {})
  })

  test('captures logs in array', () => {
    const ctx = createMockToolContext()
    ctx.log('first message')
    ctx.log('second message')
    assert.deepEqual(ctx.logs, ['first message', 'second message'])
  })

  test('merges overrides', () => {
    const ctx = createMockToolContext({
      env: { MY_KEY: 'my-value' },
      agent: { name: 'Atlas', email: 'atlas@foibleai.com' },
    })
    assert.equal(ctx.env['MY_KEY'], 'my-value')
    assert.equal(ctx.agent.name, 'Atlas')
  })
})

describe('createMockWebhookRequest', () => {
  const SECRET = 'test-webhook-secret-abc123'

  test('creates a validly signed request', () => {
    const { body, headers, payload } = createMockWebhookRequest(
      'my_tool',
      { query: 'test' },
      SECRET
    )

    assert.equal(payload.tool, 'my_tool')
    assert.deepEqual(payload.params, { query: 'test' })

    // The signed request should pass verification
    assert.doesNotThrow(() => verifyWebhook(body, headers, SECRET))
  })
})
