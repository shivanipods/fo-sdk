import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fetch from 'node-fetch'
import { findConfigFile, loadConfig, normalizeConfig, checkEnvVars } from '../utils/config.js'

export function makeValidateCommand(): Command {
  return new Command('validate')
    .description('Validate your fo.config.ts and custom actions before deploying')
    .option('--no-ping', 'Skip webhook URL reachability checks')
    .action(validateAction)
}

async function validateAction(opts: { ping: boolean }) {
  console.log(chalk.bold('\nValidating Fo agent config\n'))

  let passed = 0
  let failed = 0

  function pass(label: string, detail?: string) {
    passed++
    console.log(chalk.green('  ✓') + ' ' + label + (detail ? chalk.dim('  ' + detail) : ''))
  }

  function fail(label: string, detail?: string) {
    failed++
    console.log(chalk.red('  ✗') + ' ' + label + (detail ? chalk.dim('  ' + detail) : ''))
  }

  function warn(label: string, detail?: string) {
    console.log(chalk.yellow('  ⚠') + ' ' + label + (detail ? chalk.dim('  ' + detail) : ''))
  }

  // 1. Find config file
  const spinner = ora('Loading config...').start()
  const configPath = findConfigFile()
  if (!configPath) {
    spinner.stop()
    fail('Config file', 'fo.config.ts not found in current directory')
    console.log(chalk.dim('\n  Run `npx create-fo-agent` to scaffold a new agent.'))
    process.exit(1)
  }

  let norm: ReturnType<typeof normalizeConfig>
  try {
    const config = await loadConfig(configPath)
    norm = normalizeConfig(config)
    spinner.stop()
    pass('Config file', configPath.split('/').pop())
  } catch (err) {
    spinner.stop()
    fail('Config file', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // 2. Agent identity
  if (norm.agentName && norm.agentEmail) {
    pass('Agent identity', `${norm.agentName} → ${norm.agentEmail}@foibleai.com`)
  } else {
    fail('Agent identity', 'Missing agent.name or agent.email')
  }

  // 3. Repo (required when schedules present)
  if (norm.schedules.length > 0) {
    if (norm.repo) {
      pass('Repo', norm.repo)
    } else {
      fail('Repo', 'Required when schedules are defined (Fo generates GitHub Actions YAML)')
    }
  }

  // 4. Instructions
  if (norm.instructions) {
    const wordCount = norm.instructions.trim().split(/\s+/).length
    pass('Instructions', `${wordCount} words`)
  } else {
    warn('Instructions', 'No custom instructions — agent will use Fo defaults only')
  }

  // 5. Capabilities
  const enabledBuiltins = Object.entries(norm.capabilities)
    .filter(([, val]) => val === true)
    .map(([key]) => key)

  if (enabledBuiltins.length > 0) {
    pass('Capabilities', enabledBuiltins.join(', '))
  } else {
    warn('Capabilities', 'No built-in capabilities enabled (email defaults to on)')
  }

  // 6. Custom actions
  const customItems = norm.customItems
  if (customItems.length > 0) {
    console.log(chalk.dim(`\n  Custom actions (${customItems.length}):`))

    for (const item of customItems) {
      const actionName = item.name ?? 'unknown'

      // Check webhook URL format
      if (!item.webhookUrl?.startsWith('https://')) {
        fail(`  ${actionName}`, `webhookUrl must be an HTTPS URL`)
        continue
      }

      // Check secret present
      if (!item.webhookSecret) {
        fail(`  ${actionName}`, `missing webhookSecret`)
        continue
      }

      // Check env vars declared by action
      const actionEnv = item.env ?? []
      if (actionEnv.length > 0) {
        const { missing } = checkEnvVars([...actionEnv])
        if (missing.length > 0) {
          fail(`  ${actionName}`, `missing env vars: ${missing.join(', ')}`)
          continue
        }
      }

      // Optionally ping the webhook URL
      if (opts.ping) {
        try {
          await fetch(item.webhookUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          })
          // Any response (even 405) means the server is reachable
          pass(`  ${actionName}`, `reachable at ${item.webhookUrl}`)
        } catch {
          fail(`  ${actionName}`, `unreachable: ${item.webhookUrl}`)
        }
      } else {
        pass(`  ${actionName}`, item.webhookUrl)
      }
    }
  }

  // 7. Schedules
  if (norm.schedules.length > 0) {
    console.log(chalk.dim(`\n  Schedules (${norm.schedules.length}):`))
    for (const s of norm.schedules) {
      pass(`  ${s.name}`, `${s.cron}${s.timezone ? ` (${s.timezone})` : ''}`)
    }
  }

  // 8. Triggers
  if (norm.triggers.length > 0) {
    console.log(chalk.dim(`\n  Triggers (${norm.triggers.length}):`))
    for (const t of norm.triggers) {
      pass(`  ${t.name}`, 'event-based')
    }
  }

  // 9. Agent-level env vars
  const agentEnv = norm.env
  if (agentEnv.length > 0) {
    const { missing } = checkEnvVars(agentEnv)
    if (missing.length > 0) {
      fail('Environment variables', `missing: ${missing.join(', ')}`)
    } else {
      pass('Environment variables', agentEnv.join(', '))
    }
  }

  // Summary
  console.log()
  if (failed > 0) {
    console.log(chalk.red(`  ${failed} check(s) failed, ${passed} passed`))
    console.log(chalk.dim('  Fix the issues above before running `fo deploy`.\n'))
    process.exit(1)
  } else {
    console.log(chalk.green(`  All ${passed} checks passed.`))
    console.log(chalk.dim('  Ready to deploy. Run `fo deploy`.\n'))
  }
}
