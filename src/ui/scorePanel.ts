let panel: HTMLElement
let beatIndicatorEl: HTMLElement
let rangeIndicatorEl: HTMLElement

export function createScorePanel(): HTMLElement {
  panel = document.createElement('div')
  panel.className = 'score-panel'

  beatIndicatorEl = document.createElement('div')
  beatIndicatorEl.className = 'beat-indicator'

  rangeIndicatorEl = document.createElement('div')
  rangeIndicatorEl.style.cssText =
    'padding:4px 14px;font-size:0.8rem;color:#89b4fa;letter-spacing:0.03em;' +
    'background:rgba(137,180,250,0.08);border-bottom:1px solid rgba(137,180,250,0.15);' +
    'text-align:center;display:none;'

  const scoreContainer = document.createElement('div')
  scoreContainer.id = 'osmd-container'
  scoreContainer.style.cssText = 'position:relative;width:100%;min-height:400px;'

  panel.append(beatIndicatorEl, rangeIndicatorEl, scoreContainer)
  return panel
}

export function setRangeIndicator(from: number, to: number, total: number): void {
  const before = from - 1
  const after  = total - to
  const parts: string[] = []
  if (before > 0) parts.push(`◀ ${before} bar${before > 1 ? 's' : ''} hidden`)
  parts.push(`bars ${from}–${to}`)
  if (after > 0)  parts.push(`${after} bar${after > 1 ? 's' : ''} hidden ▶`)
  rangeIndicatorEl.textContent = parts.join('   ·   ')
  rangeIndicatorEl.style.display = ''
}

export function clearRangeIndicator(): void {
  rangeIndicatorEl.style.display = 'none'
}

export function getOsmdContainer(): HTMLElement {
  return document.getElementById('osmd-container') as HTMLElement
}

export function getBeatIndicator(): HTMLElement {
  return beatIndicatorEl
}
