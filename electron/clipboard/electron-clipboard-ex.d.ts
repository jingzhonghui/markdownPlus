declare module 'electron-clipboard-ex' {
  export function readFilePaths(): string[]
  export function writeFilePaths(filePaths: string[]): string[]
  export function clear(): void
}
