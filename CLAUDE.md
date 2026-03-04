# @fo/sdk — Agent Guide

## What this is

The Fo SDK lets developers build custom EA agents on Fo's intelligence platform. Fo handles email, calendar, and orchestration. Developers bring their own actions (CRM, data warehouse, internal APIs) as signed webhooks, and can push context into the store via `FoClient`.

## Project structure

```
src/
  types.ts          — all TypeScript types (FoAction, FoAgent, FoSchedule, FoTrigger, etc.)
  defineAction.ts   — action factory with name/description/hitl validation (v2, primary)
  defineAgent.ts    — agent config factory with actions/schedules/triggers (v2, primary)
  defineSchedule.ts — schedule factory (cron-based proactive runs)
  defineTrigger.ts  — trigger factory (event-based proactive runs)
  client.ts         — FoClient with context.ingest() and triggers.fire()
  defineConfig.ts   — agent config factory, old 'tools' API (v1, kept for compat)
  webhook.ts        — verifyWebhook, createToolHandler, WebhookVerificationError
  testing.ts        — createMockToolContext, signWebhookPayload, createMockWebhookRequest
  index.ts          — public exports (v2 primary + v1 backward compat aliases)

cli/
  index.ts                — fo CLI entry point (auth, dev, validate, deploy)
  commands/auth.ts        — fo auth / fo auth logout / fo auth status
  commands/dev.ts         — fo dev (local webhook server + sandbox connection)
  commands/validate.ts    — fo validate (config + env + reachability checks)
  commands/deploy.ts      — fo deploy (serializes config, calls Fo Platform API)
  utils/auth.ts           — credential storage at ~/.fo/credentials.json
  utils/config.ts         — fo.config.ts loader (uses tsx via stdin pipe)

tests/
  sdk.test.ts     — tests for defineAction, defineAgent, verifyWebhook, testing utils
```

## Commands

```bash
npm test          # run all tests (node:test + tsx)
npm run build     # compile TypeScript to dist/
npm run typecheck # type-check without emitting
npm run dev       # watch mode
```

## v2 API (current)

```ts
import { defineAction, defineAgent, defineSchedule, defineTrigger, FoClient } from '@fo/sdk'

const fo = new FoClient({ apiKey: process.env.FO_API_KEY })
await fo.context.ingest('atlas', 'user@example.com', [
  { id: 'deal_123', title: 'Acme License', content: '...', source: 'salesforce' },
])

export const createDeal = defineAction({
  name: 'create_deal',
  description: 'Create a deal in Salesforce.',
  parameters: z.object({ name: z.string(), value: z.number() }),
  hitl: 'auto',
  env: ['SALESFORCE_TOKEN'],
  execute: async ({ name, value }, { env, log }) => { ... },
})

export default defineAgent({
  agent: { name: 'Atlas', email: 'atlas' },
  repo: 'acme-corp/atlas-agent',
  actions: {
    email: true, calendar: true, browser: false,
    custom: [{ action: createDeal, webhookUrl: '...', webhookSecret: process.env.FO_SECRET! }],
  },
  schedules: [weeklyDigest],
  triggers: [dealCreated],
  instructions: `Use search_context and qa_context before answering questions.`,
})
```

## v1 API (backward compatible)

```ts
// Old names still work — both exported from '@fo/sdk'
import { defineTool, defineConfig } from '@fo/sdk'
// defineTool → alias for defineAction (hitl defaults to 'auto')
// defineConfig → accepts old 'tools' shape, still validates
```

## Key design decisions

**HITL modes**: `defineAction` accepts `hitl: 'auto' | 'always' | 'never'`. Auto = Fo's confidence model decides. Use `'never'` for read-only actions, `'always'` for high-stakes ones.

**Schedules need repo**: `defineAgent` requires `repo` when `schedules` is non-empty. Fo generates GitHub Actions YAML to run schedules — needs the repo to write to.

**FoClient**: Server-side client for pushing context and firing triggers. NOT for use in the webhook server itself. Used from data pipelines and CI jobs.

**Webhook-based action execution**: Developer actions run in the developer's infrastructure. Fo calls them via HMAC-SHA256 signed HTTP POST. The developer calls `verifyWebhook()` to confirm the call came from Fo.

**Two exports**: `@fo/sdk` for production code, `@fo/sdk/testing` for test helpers. This keeps test utilities out of production bundles.

**Action name rules**: lowercase letters, numbers, underscores. Must start with a letter. Max 64 chars. Validated at `defineAction()` call time.

**Agent email**: `defineAgent({ agent: { email: 'atlas' } })` → Fo provisions `atlas@foibleai.com`. Pass subdomain only, not the full address.

**Config loader** (`cli/utils/config.ts`): TypeScript configs are loaded by piping a dynamic import script to `node --input-type=module --import tsx/esm` via stdin. No temp files.

**Webhook signing**: `sha256=HMAC-SHA256(timestamp.body, secret)`. Requests older than 5 minutes are rejected (replay attack protection). Comparison is timing-safe.

## Testing patterns

Actions are tested by injecting a mock `fetcher` function instead of the real `fetch`.

```ts
import { createMockToolContext } from '@fo/sdk/testing'

const ctx = createMockToolContext({ env: { MY_KEY: 'test' } })
const result = await myAction.execute({ query: 'test' }, ctx)
assert.ok(ctx.logs.some(l => l.includes('expected log')))
```

## What to avoid

- Don't add runtime dependencies unless necessary — keep the bundle small
- Don't break the two-export structure (`@fo/sdk` vs `@fo/sdk/testing`)
- Action names must stay stable across deploys — renaming breaks existing deployments
- The `_brand` fields (`FoAction`, `FoAgent`, etc.) are used for runtime duck-typing, don't remove them
- `schedules` require `repo` — don't skip that validation
