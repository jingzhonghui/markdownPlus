import { spawn, spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'

if (isWindows) {
  spawnSync('chcp', ['65001'], { stdio: 'ignore', shell: true })
}

const env = { ...process.env }
if (!isWindows) {
  env.ELECTRON_CLI_ARGS = JSON.stringify(['--disable-gpu'])
}

const child = spawn('electron-vite', ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: true
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
