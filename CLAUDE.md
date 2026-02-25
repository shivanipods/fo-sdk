# @fo/sdk — Agent Guide

## What this is

The Fo SDK lets developers build custom EA agents on Fo's intelligence platform. Fo handles email, calendar, and orchestration. Developers bring their own tools (CRM, data warehouse, internal APIs) as signed webhooks.

## Project structure

```
src/
  types.ts        — all TypeScript types (FoTool, FoConfig, ToolContext, etc.)
  defineTool.ts   — tool factory with name/description validation
  defineConfig.ts — agent config factory with identity + webhook validation
  webhook.ts      — verifyWebhook, createToolHandler, WebhookVerificationError
  testing.ts      — createMockToolContext, signWebhookPayload, createMockWebhookRequest
  index.ts        — public exports

cli/
  index.ts                — fo CLI entry point (auth, dev, validate, deploy)
  commands/auth.ts        — fo auth / fo auth logout / fo auth status
  commands/dev.ts         — fo dev (local webhook server + sandbox connection)
  commands/validate.ts    — fo validate (config + env + reachability checks)
  commands/deploy.ts      — fo deploy (serializes config, calls Fo Platform API)
  utils/auth.ts           — credential storage at ~/.fo/credentials.json
  utils/config.ts         — fo.config.ts loader (uses tsx via stdin pipe)

tests/
  sdk.test.ts     — tests for defineTool, defineConfig, verifyWebhook, testing utils
```

## Commands

```bash
npm test          # run all tests (node:test + tsx)
npm run build     # compile TypeScript to dist/
npm run typecheck # type-check without emitting
npm run dev       # watch mode
```

## Key design decisions

**Webhook-based tool execution**: Developer tools run in the developer's infrastructure. Fo calls them via HMAC-SHA256 signed HTTP POST. The developer calls `verifyWebhook()` to confirm the call came from Fo.

**Two exports**: `@fo/sdk` for production code, `@fo/sdk/testing` for test helpers. This keeps test utilities out of production bundles.

**Tool name rules**: lowercase letters, numbers, underscores. Must start with a letter. Max 64 chars. Validated at `defineTool()` call time.

**Agent email**: `defineConfig({ agent: { email: 'atlas' } })` → Fo provisions `atlas@foibleai.com`. Pass subdomain only, not the full address.

**Config loader** (`cli/utils/config.ts`): TypeScript configs are loaded by piping a dynamic import script to `node --input-type=module --import tsx/esm` via stdin. No temp files.

**Webhook signing**: `sha256=HMAC-SHA256(timestamp.body, secret)`. Requests older than 5 minutes are rejected (replay attack protection). Comparison is timing-safe.

## Testing patterns

Tools are tested by injecting a mock `fetcher` function instead of the real `fetch`. See `tests/sdk.test.ts` for full examples.

```ts
import { createMockToolContext } from '@fo/sdk/testing'

const ctx = createMockToolContext({ env: { MY_KEY: 'test' } })
const result = await myTool.execute({ query: 'test' }, ctx)
assert.ok(ctx.logs.some(l => l.includes('expected log')))
```

## What to avoid

- Don't add runtime dependencies unless necessary — keep the bundle small
- Don't break the two-export structure (`@fo/sdk` vs `@fo/sdk/testing`)
- Tool names must stay stable across deploys — renaming breaks existing deployments
- The `_brand` fields (`FoTool`, `FoConfig`) are used for runtime duck-typing, don't remove them
