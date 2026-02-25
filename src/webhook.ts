import { createHmac, timingSafeEqual } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import type { FoTool, WebhookPayload, ToolContext } from './types.js'

// Webhook calls older than this are rejected to prevent replay attacks
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 // 5 minutes

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
  }
}

/**
 * Verify a webhook call came from Fo.
 *
 * @param body    Raw request body string (before JSON.parse)
 * @param headers Object containing x-fo-signature, x-fo-timestamp
 * @param secret  Your webhook secret (from FO_WEBHOOK_SECRET env var)
 *
 * @throws {WebhookVerificationError} if signature is invalid or timestamp is stale
 *
 * @example
 * ```ts
 * // Express
 * app.post('/tools/snowflake', express.text({ type: '*\/*' }), (req, res) => {
 *   verifyWebhook(req.body, req.headers, process.env.FO_WEBHOOK_SECRET!)
 *   // safe to process...
 * })
 * ```
 */
export function verifyWebhook(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): void {
  const signature = getHeader(headers, 'x-fo-signature')
  const timestamp = getHeader(headers, 'x-fo-timestamp')

  if (!signature) {
    throw new WebhookVerificationError('Missing x-fo-signature header')
  }

  if (!timestamp) {
    throw new WebhookVerificationError('Missing x-fo-timestamp header')
  }

  // Reject stale requests (replay attack protection)
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) {
    throw new WebhookVerificationError('Invalid x-fo-timestamp header')
  }

  const ageMs = Date.now() - ts * 1000
  if (ageMs > TIMESTAMP_TOLERANCE_MS || ageMs < -60_000) {
    throw new WebhookVerificationError(
      `Webhook timestamp is too old or too far in the future. ` +
      `Check that your server clock is synchronized.`
    )
  }

  // Compute expected signature: sha256=HMAC(timestamp.body, secret)
  const payload = `${timestamp}.${body}`
  const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
  const expected = Buffer.from(`sha256=${expectedHex}`, 'utf8')
  const received = Buffer.from(signature, 'utf8')

  // Timing-safe comparison to prevent timing attacks
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new WebhookVerificationError('Invalid webhook signature')
  }
}

interface CreateToolHandlerOptions {
  /**
   * Your webhook secret. Use process.env.FO_WEBHOOK_SECRET.
   * Must match the secret registered in fo.config.ts.
   */
  secret: string
}

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/**
 * Create a framework-compatible handler for a Fo tool webhook.
 * Handles signature verification, parameter validation, and error responses.
 *
 * Works with Express, Next.js API routes, and Vercel Functions.
 *
 * @example
 * ```ts
 * // Express
 * import { createToolHandler } from '@fo/sdk'
 * import snowflakeTool from './tools/snowflake.js'
 *
 * app.post('/tools/snowflake', createToolHandler(snowflakeTool, {
 *   secret: process.env.FO_WEBHOOK_SECRET!,
 * }))
 *
 * // Next.js / Vercel
 * export default createToolHandler(snowflakeTool, {
 *   secret: process.env.FO_WEBHOOK_SECRET!,
 * })
 * ```
 */
export function createToolHandler<TParams extends import('zod').ZodSchema>(
  tool: FoTool<TParams>,
  options: CreateToolHandlerOptions
): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    // Read raw body — needed for signature verification
    let rawBody: string
    try {
      rawBody = await readBody(req)
    } catch {
      sendJson(res, 400, { error: 'Failed to read request body' })
      return
    }

    // Verify the call came from Fo
    try {
      verifyWebhook(rawBody, req.headers as Record<string, string>, options.secret)
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        sendJson(res, 401, { error: err.message })
        return
      }
      throw err
    }

    // Parse payload
    let payload: WebhookPayload
    try {
      payload = JSON.parse(rawBody) as WebhookPayload
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' })
      return
    }

    // Validate parameters against tool schema
    const parsed = tool.parameters.safeParse(payload.params)
    if (!parsed.success) {
      sendJson(res, 422, {
        error: 'Invalid tool parameters',
        details: parsed.error.issues,
      })
      return
    }

    // Inject declared env vars — only what the tool declared it needs
    const env: Record<string, string> = {}
    for (const key of tool.env) {
      const val = process.env[key]
      if (val !== undefined) env[key] = val
    }

    const context: ToolContext = {
      ...payload.context,
      env,
      log: (msg) => console.log(`[fo:tool:${tool.name}] [${payload.requestId}] ${msg}`),
    }

    try {
      const result = await tool.execute(parsed.data, context)
      sendJson(res, 200, { success: true, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool execution failed'
      console.error(`[fo:tool:${tool.name}] [${payload.requestId}] Error:`, err)
      sendJson(res, 500, { success: false, error: message })
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const val = headers[name]
  return Array.isArray(val) ? val[0] : val
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
