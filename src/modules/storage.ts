const SCORE_KEY = 'tp_score_xml'
const SETTINGS_KEY = 'tp_settings'

export function saveScore(xml: string): void {
  try { localStorage.setItem(SCORE_KEY, xml) } catch { /* quota */ }
}

export function loadScore(): string | null {
  return localStorage.getItem(SCORE_KEY)
}

export function saveSettings(settings: Record<string, unknown>): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* quota */ }
}

export function loadSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
