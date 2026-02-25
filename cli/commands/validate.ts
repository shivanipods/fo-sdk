import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fetch from 'node-fetch'
import { findConfigFile, loadConfig, checkEnvVars } from '../utils/config.js'

export function makeValidateCommand(): Command {
  return new Command('validate')
    .description('Validate your fo.config.ts and custom tools before deploying')
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

  let config: Awaited<ReturnType<typeof loadConfig>>
  try {
    config = await loadConfig(configPath)
    spinner.stop()
    pass('Config file', configPath.split('/').pop())
  } catch (err) {
    spinner.stop()
    fail('Config file', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // 2. Agent identity
  if (config.agent?.name && config.agent?.email) {
    pass('Agent identity', `${config.agent.name} → ${config.agent.email}@foibleai.com`)
  } else {
    fail('Agent identity', 'Missing agent.name or agent.email')
  }

  // 3. Instructions
  if (config.instructions) {
    const wordCount = config.instructions.trim().split(/\s+/).length
    pass('Instructions', `${wordCount} words`)
  } else {
    warn('Instructions', 'No custom instructions — agent will use Fo defaults only')
  }

  // 4. Prebuilt tools
  const enabledBuiltins = Object.entries(config.tools ?? {})
    .filter(([key, val]) => key !== 'custom' && val === true)
    .map(([key]) => key)

  if (enabledBuiltins.length > 0) {
    pass('Prebuilt tools', enabledBuiltins.join(', '))
  } else {
    warn('Prebuilt tools', 'No prebuilt tools enabled (email defaults to on)')
  }

  // 5. Custom tools
  const customTools = config.tools?.custom ?? []
  if (customTools.length > 0) {
    console.log(chalk.dim(`\n  Custom tools (${customTools.length}):`))

    for (const reg of customTools) {
      const toolName = reg.tool?.name ?? 'unknown'

      // Check webhook URL format
      if (!reg.webhookUrl?.startsWith('https://')) {
        fail(`  ${toolName}`, `webhookUrl must be an HTTPS URL`)
        continue
      }

      // Check secret present
      if (!reg.webhookSecret) {
        fail(`  ${toolName}`, `missing webhookSecret`)
        continue
      }

      // Check env vars declared by tool
      const toolEnv = reg.tool?.env ?? []
      if (toolEnv.length > 0) {
        const { missing } = checkEnvVars([...toolEnv])
        if (missing.length > 0) {
          fail(`  ${toolName}`, `missing env vars: ${missing.join(', ')}`)
          continue
        }
      }

      // Optionally ping the webhook URL
      if (opts.ping) {
        try {
          const res = await fetch(reg.webhookUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          })
          // Any response (even 405) means the server is reachable
          pass(`  ${toolName}`, `reachable at ${reg.webhookUrl}`)
        } catch {
          fail(`  ${toolName}`, `unreachable: ${reg.webhookUrl}`)
        }
      } else {
        pass(`  ${toolName}`, reg.webhookUrl)
      }
    }
  }

  // 6. Agent-level env vars
  const agentEnv = config.env ?? []
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
