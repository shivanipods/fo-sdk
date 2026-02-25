import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createServer } from 'http'
import { findConfigFile, loadConfig } from '../utils/config.js'
import { getStoredCredentials, FO_API_BASE } from '../utils/auth.js'
import fetch from 'node-fetch'

export function makeDevCommand(): Command {
  return new Command('dev')
    .description('Run your agent locally against a sandbox inbox')
    .option('-p, --port <port>', 'Local port for webhook handlers', '3001')
    .option('--email <address>', 'Override the sandbox agent email')
    .action(devAction)
}

async function devAction(opts: { port: string; email?: string }) {
  const port = parseInt(opts.port, 10)

  console.log(chalk.bold('\nFo agent — dev mode\n'))

  // Load config
  const configPath = findConfigFile()
  if (!configPath) {
    console.log(chalk.red('✗ fo.config.ts not found.'))
    process.exit(1)
  }

  const spinner = ora('Loading config...').start()
  let config: Awaited<ReturnType<typeof loadConfig>>
  try {
    config = await loadConfig(configPath)
    spinner.stop()
  } catch (err) {
    spinner.fail('Failed to load config')
    console.log(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`))
    process.exit(1)
  }

  const agentEmail = opts.email ?? `${config.agent.email}-dev@foibleai.com`
  const customTools = config.tools?.custom ?? []

  // Start local webhook server for custom tools
  if (customTools.length > 0) {
    console.log(chalk.dim(`Starting local webhook server on port ${port}...`))

    const server = createServer(async (req, res) => {
      // Match tool routes: POST /<toolname>
      const toolName = req.url?.slice(1)
      const reg = customTools.find((r) => r.tool.name === toolName)

      if (!reg || req.method !== 'POST') {
        res.writeHead(404)
        res.end()
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', async () => {
        const body = Buffer.concat(chunks).toString()
        console.log(chalk.cyan(`  → tool call: ${toolName}`))

        try {
          // In dev mode, skip signature verification for ease of local testing
          const payload = JSON.parse(body) as { params: Record<string, unknown> }
          const parsed = reg.tool.parameters.safeParse(payload.params)

          if (!parsed.success) {
            res.writeHead(422, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid params', details: parsed.error.issues }))
            return
          }

          const env: Record<string, string> = {}
          for (const key of reg.tool.env) {
            const val = process.env[key]
            if (val !== undefined) env[key] = val
          }

          const result = await reg.tool.execute(parsed.data, {
            message: (payload as any).context?.message ?? {},
            agent: { name: config.agent.name, email: agentEmail },
            env,
            log: (msg) => console.log(chalk.dim(`     [${toolName}] ${msg}`)),
          })

          console.log(chalk.green(`  ✓ tool done: ${toolName}`))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, result }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Tool error'
          console.log(chalk.red(`  ✗ tool error: ${toolName}: ${message}`))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: message }))
        }
      })
    })

    server.listen(port)
    console.log(chalk.dim(`  Webhook handlers ready:\n`))
    for (const reg of customTools) {
      console.log(chalk.dim(`    ${reg.tool.name}  →  http://localhost:${port}/${reg.tool.name}`))
    }
    console.log()
  }

  // Register dev agent with Fo's sandbox (requires auth)
  const creds = getStoredCredentials()
  if (creds) {
    const sandboxSpinner = ora('Connecting to Fo sandbox...').start()
    try {
      const res = await fetch(`${FO_API_BASE}/agents/dev`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          agentEmail,
          localWebhookPort: port,
          tools: customTools.map((r) => ({
            name: r.tool.name,
            localPath: `/${r.tool.name}`,
          })),
        }),
      })
      sandboxSpinner.stop()

      if (res.ok) {
        console.log(chalk.bold('  Agent running') + chalk.dim(' (sandbox mode)'))
        console.log(chalk.dim(`  Inbox:   ${agentEmail}`))
        console.log(chalk.dim(`  Webhooks: http://localhost:${port}`))
      } else {
        console.log(chalk.yellow('  ⚠ Could not connect to Fo sandbox'))
        console.log(chalk.dim('    Running in offline mode — webhooks are available locally.'))
      }
    } catch {
      sandboxSpinner.stop()
      console.log(chalk.yellow('  ⚠ Could not reach Fo sandbox (offline mode)'))
      console.log(chalk.dim('    Webhooks are available locally.'))
    }
  } else {
    console.log(chalk.bold('  Agent running') + chalk.dim(' (offline mode)'))
    console.log(chalk.dim('  Run `fo auth` to connect to the Fo sandbox for end-to-end testing.'))
    if (customTools.length > 0) {
      console.log(chalk.dim(`  Webhooks: http://localhost:${port}`))
    }
  }

  console.log()
  console.log(chalk.dim('  Press Ctrl+C to stop.\n'))

  // Keep process alive
  await new Promise<void>(() => {})
}
