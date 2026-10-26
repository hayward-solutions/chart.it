import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const binary = path.join(root, 'bin', 'chartit')

function ensureBinary() {
  if (fs.existsSync(binary) && process.env.CHARTIT_E2E_BUILD !== '1') {
    return
  }
  const script = [
    'cd web',
    'npm run build',
    'rm -rf ../internal/ui/dist',
    'cp -R dist ../internal/ui/dist',
    'touch ../internal/ui/dist/.keep',
    'cd ..',
    'CGO_ENABLED=0 go build -o bin/chartit ./cmd/chartit',
  ].join(' && ')
  execFileSync('bash', ['-c', script], { cwd: root, stdio: 'inherit' })
}

async function waitForHealthy(url: string, child: ChildProcess, logFile: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`chartit exited with code ${child.exitCode}\n${fs.readFileSync(logFile, 'utf8')}`)
    }
    try {
      const response = await fetch(`${url}/healthz`)
      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150))
      continue
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`chartit did not become healthy at ${url}\n${fs.readFileSync(logFile, 'utf8')}`)
}

export default async function globalSetup() {
  ensureBinary()

  const port = process.env.E2E_PORT
  if (!port) {
    throw new Error('E2E_PORT is not set; playwright.config.ts must run first')
  }
  const url = `http://127.0.0.1:${port}`
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chartit-e2e-'))
  const logFile = path.join(dataDir, 'server.log')
  const log = fs.openSync(logFile, 'a')

  const child = spawn(binary, [], {
    cwd: root,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      CHARTIT_ADDR: `127.0.0.1:${port}`,
      CHARTIT_BASE_URL: url,
      CHARTIT_DATA_DIR: dataDir,
      CHARTIT_ALLOW_TEST_AUTH: '1',
      CHARTIT_SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0123456789',
      CHARTIT_LOG_LEVEL: 'warn',
    },
  })

  await waitForHealthy(url, child, logFile)

  return async () => {
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 5_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    fs.closeSync(log)
    if (process.env.CHARTIT_E2E_KEEP_DATA !== '1') {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  }
}
