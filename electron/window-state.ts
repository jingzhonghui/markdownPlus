import * as fs from 'fs'
import * as path from 'path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  bounds: WindowBounds
  isMaximized: boolean
}

export interface DisplayWorkArea {
  x: number
  y: number
  width: number
  height: number
}

const MIN_WIDTH = 400
const MIN_HEIGHT = 300

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const bounds = value as Partial<WindowBounds>
  return isFiniteNumber(bounds.x) && isFiniteNumber(bounds.y) &&
    isFiniteNumber(bounds.width) && isFiniteNumber(bounds.height) &&
    bounds.width > 0 && bounds.height > 0
}

function isValidState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<WindowState>
  return isValidBounds(state.bounds) && typeof state.isMaximized === 'boolean'
}

export function loadWindowState(statePath: string): WindowState | null {
  try {
    if (!fs.existsSync(statePath)) return null
    const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    return isValidState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveWindowState(statePath: string, state: WindowState): void {
  const directory = path.dirname(statePath)
  fs.mkdirSync(directory, { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(temporaryPath, statePath)
}

function intersectsDisplay(bounds: WindowBounds, display: DisplayWorkArea): boolean {
  return bounds.x < display.x + display.width && bounds.x + bounds.width > display.x &&
    bounds.y < display.y + display.height && bounds.y + bounds.height > display.y
}

function clampBounds(bounds: WindowBounds, display: DisplayWorkArea): WindowBounds {
  const width = Math.min(Math.max(bounds.width, MIN_WIDTH), display.width)
  const height = Math.min(Math.max(bounds.height, MIN_HEIGHT), display.height)
  const x = Math.min(Math.max(bounds.x, display.x), display.x + display.width - width)
  const y = Math.min(Math.max(bounds.y, display.y), display.y + display.height - height)
  return { x, y, width, height }
}

export function resolveWindowState(
  saved: WindowState | null,
  displays: DisplayWorkArea[],
  defaults: WindowBounds = { x: 100, y: 100, width: 1400, height: 900 }
): WindowState {
  const fallbackDisplay = displays[0]
  if (!saved || displays.length === 0) {
    return { bounds: defaults, isMaximized: saved?.isMaximized ?? false }
  }

  const visibleDisplay = displays.find((display) => intersectsDisplay(saved.bounds, display))
  if (!visibleDisplay) {
    return { bounds: defaults, isMaximized: saved.isMaximized }
  }

  return {
    bounds: clampBounds(saved.bounds, visibleDisplay || fallbackDisplay),
    isMaximized: saved.isMaximized
  }
}
