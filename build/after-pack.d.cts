interface AfterPackContext {
  electronPlatformName: string
  appOutDir: string
}

declare function ensureChromeSandboxPermissions(context: AfterPackContext): void

export = ensureChromeSandboxPermissions
