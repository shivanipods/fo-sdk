#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { makeAuthCommand } from './commands/auth.js'
import { makeValidateCommand } from './commands/validate.js'
import { makeDeployCommand } from './commands/deploy.js'
import { makeDevCommand } from './commands/dev.js'

const program = new Command()

program
  .name('fo')
  .description('Fo SDK — build custom EA agents on Fo\'s intelligence platform')
  .version('0.1.0')
  .addHelpText('after', `
Examples:
  ${chalk.dim('$')} fo auth              Log in to your Fo account
  ${chalk.dim('$')} fo dev               Run your agent locally
  ${chalk.dim('$')} fo validate          Check your config before deploying
  ${chalk.dim('$')} fo deploy            Deploy your agent to Fo
  ${chalk.dim('$')} fo deploy --dry-run  Preview what would be deployed
  `)

program.addCommand(makeAuthCommand())
program.addCommand(makeDevCommand())
program.addCommand(makeValidateCommand())
program.addCommand(makeDeployCommand())

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
