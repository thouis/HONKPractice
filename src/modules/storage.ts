import { notify } from '../ui/notify'

const SCORE_KEY = 'tp_score_xml'
const SETTINGS_KEY = 'tp_settings'
const LOOP_STATE_PREFIX = 'tp_loop_'

// Simple djb2 hash → 8-char hex key for a score's XML
function scoreKey(xml: string): string {
  let h = 5381
  const s = xml.slice(0, 300)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface LoopState {
  enabled: boolean
  from: number
  to: number
}

export function saveScoreLoop(xml: string, state: LoopState): void {
  try { localStorage.setItem(LOOP_STATE_PREFIX + scoreKey(xml), JSON.stringify(state)) } catch { notify('Storage full — loop position not saved', 'warning') }
}

export function loadScoreLoop(xml: string): LoopState | null {
  try {
    const raw = localStorage.getItem(LOOP_STATE_PREFIX + scoreKey(xml))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveScore(xml: string): void {
  try { localStorage.setItem(SCORE_KEY, xml) } catch { notify('Storage full — score not saved for next visit', 'warning') }
}

export function loadScore(): string | null {
  return localStorage.getItem(SCORE_KEY)
}

export function saveSettings(settings: Record<string, unknown>): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* settings loss is silent — not worth interrupting the user */ }
}

export function loadSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
