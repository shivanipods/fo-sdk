# @fo/sdk

Build custom EA agents on Fo's intelligence platform.

Fo handles the hard parts — email pipeline, calendar, browser automation, and orchestration. You bring your context sources: your CRM, your data warehouse, your internal APIs. The SDK wires them together.

```
npm install @fo/sdk
```

---

## Quick start

```bash
npx create-fo-agent my-agent
cd my-agent
fo auth
fo deploy
```

---

## Defining a tool

Tools run in your infrastructure. Fo calls them via signed webhooks — your credentials never leave your servers.

```ts
// tools/crm.ts
import { defineTool } from '@fo/sdk'
import { z } from 'zod'

export default defineTool({
  name: 'query_crm',
  description: `Look up a contact or deal in Salesforce.
    Use this when the user asks about a specific person, company, or deal status.
    Never guess about CRM data — always check first.`,

  parameters: z.object({
    query: z.string().describe('Contact name, email, company name, or deal name'),
  }),

  env: ['SALESFORCE_TOKEN'],

  execute: async ({ query }, { env, log }) => {
    log(`Searching CRM for: ${query}`)
    const results = await salesforce.search(env.SALESFORCE_TOKEN, query)
    return results.records
  },
})
```

**Tool name rules:** lowercase letters, numbers, and underscores only. Must start with a letter. Max 64 characters.

---

## Configuring your agent

```ts
// fo.config.ts
import { defineConfig } from '@fo/sdk'
import crm from './tools/crm.js'

export default defineConfig({
  agent: {
    name: 'Atlas',
    email: 'atlas', // → atlas@foibleai.com
  },

  tools: {
    email: true,      // read and send email (default: true)
    calendar: true,   // Google Calendar (default: true)
    browser: false,   // browser automation (default: false)
    custom: [
      {
        tool: crm,
        webhookUrl: 'https://my-app.com/tools/query_crm',
        webhookSecret: process.env.FO_CRM_SECRET!,
      },
    ],
  },

  instructions: `
    You are Atlas, EA to the founder of Acme Corp.
    Always check the CRM before answering questions about contacts or deals.
    Priority contacts: board members, investors, and enterprise accounts.
  `,

  env: ['SALESFORCE_TOKEN', 'FO_CRM_SECRET'],
})
```

---

## Serving webhook calls

When Fo calls your tool, it sends a signed POST request to your `webhookUrl`. Use `createToolHandler` to handle it:

```ts
// src/webhook.ts
import express from 'express'
import { createToolHandler } from '@fo/sdk'
import crm from '../tools/crm.js'

const app = express()

app.post('/tools/query_crm', createToolHandler(crm, {
  secret: process.env.FO_CRM_SECRET!,
}))

app.listen(3000)
```

`createToolHandler` handles signature verification, parameter validation, env injection, and error responses. It works with Express, Next.js API routes, and Vercel Functions.

### Manual verification

If you need lower-level control:

```ts
import { verifyWebhook, WebhookVerificationError } from '@fo/sdk'

app.post('/tools/my_tool', express.text({ type: '*/*' }), (req, res) => {
  try {
    verifyWebhook(req.body, req.headers, process.env.FO_WEBHOOK_SECRET!)
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return res.status(401).json({ error: err.message })
    }
    throw err
  }

  const payload = JSON.parse(req.body)
  // ...
})
```

Fo signs all webhook calls with `HMAC-SHA256`. Requests older than 5 minutes are automatically rejected.

---

## CLI

```
fo auth              Log in to your Fo account
fo auth logout       Log out
fo auth status       Show current auth status

fo validate          Check config and env vars before deploying
fo validate --no-ping  Skip webhook URL reachability checks

fo deploy            Deploy your agent to Fo
fo deploy --dry-run  Preview what would be deployed

fo dev               Run your agent locally against a sandbox inbox
fo dev --port 3001   Custom port for local webhook handlers
```

---

## Testing

Import from `@fo/sdk/testing` to keep test helpers out of production bundles:

```ts
import { createMockToolContext, signWebhookPayload, createMockWebhookRequest } from '@fo/sdk/testing'
```

### Testing tool execute functions

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMockToolContext } from '@fo/sdk/testing'
import crm from '../tools/crm.js'

test('returns CRM results', async () => {
  const ctx = createMockToolContext({
    env: { SALESFORCE_TOKEN: 'test-token' },
  })

  // Inject a mock fetch
  const result = await crm.execute({ query: 'Acme' }, ctx)

  assert.ok(result)
  assert.ok(ctx.logs.some(l => l.includes('Acme')))
})
```

### Testing webhook handlers

```ts
import { createMockWebhookRequest } from '@fo/sdk/testing'
import { verifyWebhook } from '@fo/sdk'

test('signed request passes verification', () => {
  const { body, headers } = createMockWebhookRequest(
    'query_crm',
    { query: 'Acme' },
    'my-webhook-secret'
  )

  assert.doesNotThrow(() => verifyWebhook(body, headers, 'my-webhook-secret'))
})
```

---

## Community tools

Tools that work well across agents can be published as npm packages under `@fo-tools/*`:

```bash
npm install @fo-tools/snowflake
```

```ts
import snowflake from '@fo-tools/snowflake'

export default defineConfig({
  tools: {
    custom: [{ tool: snowflake, webhookUrl: '...', webhookSecret: '...' }],
  },
})
```

---

## License

MIT
