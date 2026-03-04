import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fetch from 'node-fetch'
import { findConfigFile, loadConfig, normalizeConfig } from '../utils/config.js'
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
  repo?: string
  tools: {
    email: boolean
    calendar: boolean
    browser: boolean
    custom: Array<{
      name: string
      description: string
      parameters: Record<string, unknown>
      env: string[]
      hitl: string
      webhookUrl: string
      webhookSecret: string
    }>
  }
  schedules: Array<{ name: string; cron: string; timezone?: string; prompt: string }>
  triggers: Array<{ name: string; prompt: string }>
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
  let norm: ReturnType<typeof normalizeConfig>
  try {
    const config = await loadConfig(configPath)
    norm = normalizeConfig(config)
    spinner.succeed('Config loaded')
  } catch (err) {
    spinner.fail('Failed to load config')
    console.log(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`))
    process.exit(1)
  }

  // Serialize custom actions (strip execute function, keep schema + webhook info)
  const { zodToJsonSchema } = await import('zod-to-json-schema')
  const customActions = norm.customItems.map((item) => ({
    name: item.name,
    description: item.description,
    parameters: zodToJsonSchema(item.parameters, { target: 'jsonSchema7' }),
    env: [...item.env],
    hitl: item.hitl ?? 'auto',
    webhookUrl: item.webhookUrl,
    webhookSecret: item.webhookSecret,
  }))

  const payload: DeployPayload = {
    agentName: norm.agentName,
    agentEmail: norm.agentEmail,
    repo: norm.repo,
    tools: {
      email: norm.capabilities.email,
      calendar: norm.capabilities.calendar,
      browser: norm.capabilities.browser,
      custom: customActions,
    },
    schedules: norm.schedules,
    triggers: norm.triggers,
    instructions: norm.instructions ?? '',
    env: norm.env,
  }

  // Show summary
  console.log()
  console.log(chalk.bold('  Agent:'))
  console.log(chalk.dim(`    Name:   ${payload.agentName}`))
  console.log(chalk.dim(`    Email:  ${payload.agentEmail}@foibleai.com`))
  if (payload.repo) {
    console.log(chalk.dim(`    Repo:   ${payload.repo}`))
  }
  console.log()
  console.log(chalk.bold('  Capabilities:'))
  console.log(chalk.dim(`    email:    ${payload.tools.email ? 'enabled' : 'disabled'}`))
  console.log(chalk.dim(`    calendar: ${payload.tools.calendar ? 'enabled' : 'disabled'}`))
  console.log(chalk.dim(`    browser:  ${payload.tools.browser ? 'enabled' : 'disabled'}`))
  if (customActions.length > 0) {
    console.log(chalk.dim(`    custom:   ${customActions.map((a) => a.name).join(', ')}`))
  }
  if (payload.schedules.length > 0) {
    console.log()
    console.log(chalk.bold('  Schedules:'))
    for (const s of payload.schedules) {
      console.log(chalk.dim(`    ${s.name}  (${s.cron}${s.timezone ? ` ${s.timezone}` : ''})`))
    }
  }
  if (payload.triggers.length > 0) {
    console.log()
    console.log(chalk.bold('  Triggers:'))
    for (const t of payload.triggers) {
      console.log(chalk.dim(`    ${t.name}`))
    }
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
        'X-Fo-SDK-Version': '2.0.0',
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
