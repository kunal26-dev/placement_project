import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
]
let shuttingDown = false

function stopChildren(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill()
  }
  process.exitCode = exitCode
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Unable to start a development service:', error)
    stopChildren(1)
  })
  child.on('exit', (code) => {
    if (!shuttingDown) stopChildren(code || 0)
  })
}

process.on('SIGINT', () => stopChildren(0))
process.on('SIGTERM', () => stopChildren(0))
