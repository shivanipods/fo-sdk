import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createServer } from 'http'
import { saveCredentials, getStoredCredentials, clearCredentials, FO_API_BASE } from '../utils/auth.js'

export function makeAuthCommand(): Command {
  const cmd = new Command('auth')
  cmd.description('Authenticate with your Fo account')

  cmd
    .command('login')
    .description('Log in to Fo')
    .action(loginAction)

  cmd
    .command('logout')
    .description('Log out of Fo')
    .action(logoutAction)

  cmd
    .command('status')
    .description('Show current authentication status')
    .action(statusAction)

  // Default action when running just `fo auth`
  cmd.action(loginAction)

  return cmd
}

async function loginAction() {
  const existing = getStoredCredentials()
  if (existing) {
    console.log(chalk.yellow(`Already logged in as ${existing.email}.`))
    console.log(chalk.dim('Run `fo auth logout` first to switch accounts.'))
    return
  }

  console.log(chalk.bold('\nLog in to Fo\n'))

  // Open browser to Fo's auth page with a local callback server
  const PORT = 8788
  const CALLBACK_PATH = '/auth/callback'

  const spinner = ora('Opening browser...').start()

  // Generate a state token to prevent CSRF
  const state = Math.random().toString(36).slice(2)
  const authUrl = `${FO_API_BASE.replace('/v1', '')}/sdk/auth?` +
    `redirect_uri=${encodeURIComponent(`http://localhost:${PORT}${CALLBACK_PATH}`)}` +
    `&state=${state}`

  spinner.stop()

  console.log(chalk.dim(`Opening: ${authUrl}`))
  console.log()

  // Open browser
  const { exec } = await import('child_process')
  const platform = process.platform
  if (platform === 'darwin') exec(`open "${authUrl}"`)
  else if (platform === 'win32') exec(`start "${authUrl}"`)
  else exec(`xdg-open "${authUrl}"`)

  console.log(chalk.dim('Waiting for authentication...'))
  console.log(chalk.dim(`(If browser did not open, visit: ${authUrl})\n`))

  // Local server to receive the callback
  const creds = await new Promise<{ apiKey: string; email: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Authentication timed out after 5 minutes'))
    }, 5 * 60 * 1000)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404)
        res.end()
        return
      }

      const returnedState = url.searchParams.get('state')
      const apiKey = url.searchParams.get('api_key')
      const email = url.searchParams.get('email')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Authentication failed.</h2><p>You can close this window.</p></body></html>')
        clearTimeout(timeout)
        server.close()
        reject(new Error(`Authentication failed: ${error}`))
        return
      }

      if (returnedState !== state || !apiKey || !email) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Invalid callback.</h2></body></html>')
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="font-family:system-ui;max-width:400px;margin:80px auto;text-align:center">
            <h2>✓ Authenticated</h2>
            <p>You are now logged in as <strong>${email}</strong>.</p>
            <p>You can close this window and return to your terminal.</p>
          </body>
        </html>
      `)

      clearTimeout(timeout)
      server.close()
      resolve({ apiKey, email })
    })

    server.listen(PORT)
  })

  saveCredentials({
    apiKey: creds.apiKey,
    email: creds.email,
    createdAt: new Date().toISOString(),
  })

  console.log(chalk.green(`\n✓ Logged in as ${creds.email}`))
  console.log(chalk.dim('Credentials saved to ~/.fo/credentials.json'))
}

function logoutAction() {
  const existing = getStoredCredentials()
  if (!existing) {
    console.log(chalk.dim('Not currently logged in.'))
    return
  }

  clearCredentials()
  console.log(chalk.green(`✓ Logged out (was: ${existing.email})`))
}

function statusAction() {
  const creds = getStoredCredentials()
  if (!creds) {
    console.log(chalk.yellow('Not logged in.'))
    console.log(chalk.dim('Run `fo auth` to log in.'))
    return
  }

  console.log(chalk.green('✓ Logged in'))
  console.log(chalk.dim(`  Email:      ${creds.email}`))
  console.log(chalk.dim(`  Since:      ${new Date(creds.createdAt).toLocaleDateString()}`))
}
