# AGENTS.md — @fo/sdk

This file provides context for AI coding agents (Claude, Cursor, Copilot, etc.) working in this repo.

---

## What this repo is

`@fo/sdk` is a TypeScript SDK for building custom tool integrations on top of Fo, an AI executive assistant platform powered by Claude. Fo handles email, calendar, browser automation, and orchestration. Developers bring their own context sources — CRM, databases, internal APIs, third-party services — via signed webhook tools.

---

## Key concepts

### Tools
The atomic unit. A tool has a name, description, Zod parameter schema, optional env var requirements, and an `execute` function. Tools run on the developer's infrastructure and are called by Fo via signed HTTPS webhooks.

```ts
defineTool({
  name: 'tool_name',           // lowercase, underscores, max 64 chars
  description: '...',          // used by Claude to decide when to call this tool
  parameters: z.object({...}), // Zod schema — validated before execute is called
  env: ['API_KEY'],            // env vars injected at runtime
  execute: async (params, ctx) => { ... }
})
```

### Config
Combines tools + agent identity + instructions into a deployable agent.

```ts
defineConfig({
  agent: { name: 'Atlas', email: 'atlas' },
  tools: { email: true, calendar: true, custom: [...] },
  instructions: '...',
  env: [...]
})
```

### Webhook security
All tool calls use HMAC-SHA256 signatures with timestamp-based replay protection (5-minute window). Use `verifyWebhook()` or `createToolHandler()` — never skip verification.

---

## File structure

```
src/
  index.ts          # public exports
  types.ts          # all TypeScript interfaces
  defineTool.ts     # tool definition + validation
  defineConfig.ts   # agent config + validation
  webhook.ts        # verifyWebhook, createToolHandler
  testing.ts        # mock utilities (not in main bundle)
  integrations/     # community tools — one dir per service
    discord/
    slack/
    ...
cli/
  commands/         # auth, deploy, dev, validate
  utils/            # credential management, config loading
tests/
```

---

## Integrations

Community-contributed tool integrations live in `src/integrations/`. Each integration:
- Gets its own directory named after the service
- Exports all tools from an `index.ts`
- Follows the same `defineTool()` pattern
- Has corresponding tests in `tests/integrations/`

To add a new integration, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Testing

```bash
npm test                    # run all tests
npm test -- tests/webhook   # run specific file
```

Use `createMockToolContext()` and `createMockWebhookRequest()` from `@fo/sdk/testing` in all tool tests. Never make real HTTP calls in tests.

---

## Conventions for agents

- Tool descriptions are critical — Claude uses them to decide when to call a tool. Be specific and instructive.
- Parameters should be described with `.describe()` on each Zod field.
- `execute` functions should call `ctx.log()` for anything worth tracing.
- Return structured objects, not strings.
- Never hardcode credentials. Always use `env` array + `ctx.env`.
- Tool names must be unique across an agent's full toolset.

---

## Common patterns

### Read before write
Tools that modify state should have a corresponding read tool. Don't combine them.

### Fail loudly
Throw descriptive errors. Fo's agent will relay them to the user.

### Idempotency
Where possible, make tools safe to call twice with the same parameters.

---

## Links

- GitHub: https://github.com/shivanipods/fo-sdk
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Community Discord: https://discord.gg/m6bVkyhsJz
