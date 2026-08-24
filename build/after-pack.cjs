const fs = require('node:fs')
const path = require('node:path')

function ensureChromeSandboxPermissions(context) {
  if (context.electronPlatformName !== 'linux') return

  const sandboxPath = path.join(context.appOutDir, 'chrome-sandbox')
  if (!fs.existsSync(sandboxPath)) {
    throw new Error(`Missing Chromium sandbox helper: ${sandboxPath}`)
  }

  fs.chmodSync(sandboxPath, 0o4755)

  const mode = fs.statSync(sandboxPath).mode & 0o7777
  if (mode !== 0o4755) {
    throw new Error(`Invalid chrome-sandbox permissions: expected 4755, got ${mode.toString(8)}`)
  }
}

module.exports = ensureChromeSandboxPermissions
module.exports.ensureChromeSandboxPermissions = ensureChromeSandboxPermissions
