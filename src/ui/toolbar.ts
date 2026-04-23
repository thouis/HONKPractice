export function createToolbar(
  onLoad: () => void,
  onLibrary: () => void,
  onSettings: () => void,
  onHelp: () => void,
): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'toolbar'

  const title = document.createElement('span')
  title.className = 'app-title'
  title.textContent = 'BandPractice'

  const scoreTitle = document.createElement('span')
  scoreTitle.className = 'score-title'
  scoreTitle.id = 'score-title'
  scoreTitle.textContent = 'No score loaded'

  const libraryBtn = document.createElement('button')
  libraryBtn.textContent = 'Library'
  libraryBtn.className = 'btn'
  libraryBtn.onclick = onLibrary

  const loadBtn = document.createElement('button')
  loadBtn.textContent = 'Load File'
  loadBtn.className = 'btn'
  loadBtn.onclick = onLoad

  const settingsBtn = document.createElement('button')
  settingsBtn.textContent = '⚙'
  settingsBtn.className = 'btn'
  settingsBtn.title = 'Settings'
  settingsBtn.onclick = onSettings

  const helpBtn = document.createElement('button')
  helpBtn.textContent = '?'
  helpBtn.className = 'btn'
  helpBtn.title = 'Help'
  helpBtn.onclick = onHelp

  bar.append(title, scoreTitle, libraryBtn, loadBtn, settingsBtn, helpBtn)
  return bar
}

export function setScoreTitle(name: string): void {
  const el = document.getElementById('score-title')
  if (el) el.textContent = name
}
