export function createToolbar(onLoad: () => void): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'toolbar'

  const title = document.createElement('span')
  title.className = 'app-title'
  title.textContent = 'TrombonePractice'

  const scoreTitle = document.createElement('span')
  scoreTitle.className = 'score-title'
  scoreTitle.id = 'score-title'
  scoreTitle.textContent = 'No score loaded'

  const loadBtn = document.createElement('button')
  loadBtn.textContent = 'Load Score'
  loadBtn.className = 'btn'
  loadBtn.onclick = onLoad

  bar.append(title, scoreTitle, loadBtn)
  return bar
}

export function setScoreTitle(name: string): void {
  const el = document.getElementById('score-title')
  if (el) el.textContent = name
}
