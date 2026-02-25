import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fetch from 'node-fetch'
import { findConfigFile, loadConfig } from '../utils/config.js'
import { requireAuth, FO_API_BASE } from '../utils/auth.js'

export function makeDeployCommand(): Command {
  return new Command('deploy')
    .description('Deploy your agent to the Fo platform')
    .option('--dry-run', 'Validate and show what would be deployed without actually deploying')
    .action(deployAction)
}

interface DeployPayload {
  agentName: string
  agentEmail: string
  tools: {
    email: boolean
    calendar: boolean
    browser: boolean
    custom: Array<{
      name: string
      description: string
      parameters: Record<string, unknown>
      env: string[]
      webhookUrl: string
      webhookSecret: string
    }>
  }
  instructions: string
  env: string[]
}

async function deployAction(opts: { dryRun: boolean }) {
  console.log(chalk.bold('\nDeploying Fo agent\n'))

  // Auth check
  let creds: ReturnType<typeof requireAuth>
  try {
    creds = requireAuth()
  } catch (err) {
    console.log(chalk.red(err instanceof Error ? err.message : String(err)))
    process.exit(1)
  }

  // Load + validate config
  const configPath = findConfigFile()
  if (!configPath) {
    console.log(chalk.red('✗ fo.config.ts not found.'))
    console.log(chalk.dim('  Run `npx create-fo-agent` to scaffold a new agent.'))
    process.exit(1)
  }

  const spinner = ora('Loading config...').start()
  let config: Awaited<ReturnType<typeof loadConfig>>
  try {
    config = await loadConfig(configPath)
    spinner.succeed('Config loaded')
  } catch (err) {
    spinner.fail('Failed to load config')
    console.log(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`))
    process.exit(1)
  }

  // Serialize custom tools (strip execute function, keep schema + webhook info)
  const { zodToJsonSchema } = await import('zod-to-json-schema')
  const customTools = (config.tools?.custom ?? []).map((reg) => ({
    name: reg.tool.name,
    description: reg.tool.description,
    parameters: zodToJsonSchema(reg.tool.parameters, { target: 'jsonSchema7' }),
    env: [...reg.tool.env],
    webhookUrl: reg.webhookUrl,
    webhookSecret: reg.webhookSecret,
  }))

  const payload: DeployPayload = {
    agentName: config.agent.name,
    agentEmail: config.agent.email,
    tools: {
      email: config.tools?.email ?? true,
      calendar: config.tools?.calendar ?? true,
      browser: config.tools?.browser ?? false,
      custom: customTools,
    },
    instructions: config.instructions ?? '',
    env: config.env ?? [],
  }

  // Show summary
  console.log()
  console.log(chalk.bold('  Agent:'))
  console.log(chalk.dim(`    Name:   ${payload.agentName}`))
  console.log(chalk.dim(`    Email:  ${payload.agentEmail}@foibleai.com`))
  console.log()
  console.log(chalk.bold('  Tools:'))
  console.log(chalk.dim(`    email:    ${payload.tools.email ? 'enabled' : 'disabled'}`))
  console.log(chalk.dim(`    calendar: ${payload.tools.calendar ? 'enabled' : 'disabled'}`))
  console.log(chalk.dim(`    browser:  ${payload.tools.browser ? 'enabled' : 'disabled'}`))
  if (customTools.length > 0) {
    console.log(chalk.dim(`    custom:   ${customTools.map((t) => t.name).join(', ')}`))
  }
  console.log()

  if (opts.dryRun) {
    console.log(chalk.yellow('  Dry run — not deploying. Remove --dry-run to deploy.'))
    return
  }

  // Deploy to Fo Platform API
  const deploySpinner = ora('Deploying to Fo platform...').start()

  try {
    const res = await fetch(`${FO_API_BASE}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
        'X-Fo-SDK-Version': '0.1.0',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text()
      let message = `HTTP ${res.status}`
      try {
        const json = JSON.parse(body) as { error?: string }
        if (json.error) message = json.error
      } catch {}
      deploySpinner.fail(`Deployment failed: ${message}`)
      process.exit(1)
    }

    const result = await res.json() as {
      agentId: string
      email: string
      status: string
      dashboardUrl?: string
    }

    deploySpinner.succeed('Deployed successfully')
    console.log()
    console.log(chalk.green('  ✓ Agent is live'))
    console.log(chalk.dim(`    Email:     ${result.email}`))
    console.log(chalk.dim(`    Agent ID:  ${result.agentId}`))
    if (result.dashboardUrl) {
      console.log(chalk.dim(`    Dashboard: ${result.dashboardUrl}`))
    }
    console.log()
    console.log(chalk.dim(`  Send an email to ${result.email} to try it.\n`))
  } catch (err) {
    deploySpinner.fail('Deployment failed')
    console.log(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`))
    process.exit(1)
  }
}
