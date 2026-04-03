let panel: HTMLElement
let beatIndicatorEl: HTMLElement

export function createScorePanel(): HTMLElement {
  panel = document.createElement('div')
  panel.className = 'score-panel'

  beatIndicatorEl = document.createElement('div')
  beatIndicatorEl.className = 'beat-indicator'

  const scoreContainer = document.createElement('div')
  scoreContainer.id = 'osmd-container'
  scoreContainer.style.cssText = 'position:relative;width:100%;min-height:400px;'

  panel.append(beatIndicatorEl, scoreContainer)
  return panel
}

export function getOsmdContainer(): HTMLElement {
  return document.getElementById('osmd-container') as HTMLElement
}

export function getBeatIndicator(): HTMLElement {
  return beatIndicatorEl
}
