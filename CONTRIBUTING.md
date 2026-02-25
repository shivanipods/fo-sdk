# Contributing to @fo/sdk

Thanks for contributing. This is how Wingspan Collective members — and anyone building on Fo — give back to the platform.

The most valuable contributions right now are **community tools**: reusable integrations published under `@fo-tools/*` that any Fo user can drop into their agent config. Discord, Slack, Notion, GitHub, Linear — if you built it and it works, it belongs here.

---

## Getting started

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/fo-sdk.git
cd fo-sdk/packages/sdk

# Install dependencies
npm install

# Run tests
npm test
```

---

## How to contribute

### 1. Fork and branch

Always branch from `main`. Use the following conventions:

```
feat/discord-tools       # new feature or integration
fix/webhook-timeout      # bug fix
docs/contributing        # documentation only
```

### 2. Write your tool

Community tools live under `src/integrations/`. Each integration gets its own directory:

```
src/integrations/
  discord/
    index.ts       # exports all tools
    send_message.ts
    get_messages.ts
    ...
```

Use `defineTool()` from the SDK. Keep tools focused — one tool does one thing.

```ts
import { defineTool } from '../../index.js'
import { z } from 'zod'

export default defineTool({
  name: 'discord_send_message',
  description: `Send a message to a Discord channel.
    Use this when the user asks to post an update, prompt, or announcement to a specific channel.`,
  parameters: z.object({
    channelId: z.string().describe('The Discord channel ID'),
    message: z.string().describe('The message content to send'),
  }),
  env: ['DISCORD_TOKEN'],
  execute: async ({ channelId, message }, { env, log }) => {
    // implementation
  },
})
```

### 3. Write tests

Every tool needs tests. Use the SDK testing utilities:

```ts
import { createMockToolContext } from '@fo/sdk/testing'
import sendMessage from '../src/integrations/discord/send_message.js'

test('sends message to channel', async () => {
  const ctx = createMockToolContext({ env: { DISCORD_TOKEN: 'test' } })
  const result = await sendMessage.execute({ channelId: '123', message: 'hello' }, ctx)
  assert.ok(result)
})
```

Run the full test suite before opening a PR:

```bash
npm test
```

### 4. Open a pull request

Use the PR template. Fill out every section — especially the "how to test this" part. PRs without tests won't be merged.

---

## Community tools (`@fo-tools/*`)

If you're building an integration that works beyond your own use case, consider publishing it as a standalone npm package under the `@fo-tools` namespace.

- Name it `@fo-tools/<service>` (e.g. `@fo-tools/discord`, `@fo-tools/slack`)
- Export your tools as named exports
- Include a `README.md` with a usage example
- Open an issue to get it listed in the SDK docs

---

## Code style

- TypeScript everywhere
- Zod for all parameter schemas
- No runtime dependencies beyond what's already in the SDK unless absolutely necessary
- Tool names: lowercase, underscores, max 64 chars, start with a letter

---

## Questions?

Open an issue or find us on Discord: https://discord.gg/m6bVkyhsJz
