export interface ControlCallbacks {
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onTempoChange: (ratio: number) => void
  onMetronomeToggle: (on: boolean) => void
  onHintsToggle: (on: boolean) => void
}

let bpmDisplay: HTMLSpanElement
let tempoSlider: HTMLInputElement
let playBtn: HTMLButtonElement
let pauseBtn: HTMLButtonElement
let metBtn: HTMLButtonElement
let hintsBtn: HTMLButtonElement

export function createControls(cbs: ControlCallbacks): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'controls-bar'

  // --- Transport ---
  const rewindBtn = document.createElement('button')
  rewindBtn.textContent = '⏮'
  rewindBtn.className = 'btn'
  rewindBtn.onclick = cbs.onStop

  playBtn = document.createElement('button')
  playBtn.textContent = '▶'
  playBtn.className = 'btn'
  playBtn.onclick = cbs.onPlay

  pauseBtn = document.createElement('button')
  pauseBtn.textContent = '⏸'
  pauseBtn.className = 'btn'
  pauseBtn.onclick = cbs.onPause

  const stopBtn = document.createElement('button')
  stopBtn.textContent = '⏹'
  stopBtn.className = 'btn'
  stopBtn.onclick = cbs.onStop

  // --- Tempo ---
  const tempoLabel = document.createElement('label')
  tempoLabel.textContent = 'Tempo: '
  bpmDisplay = document.createElement('span')
  bpmDisplay.id = 'bpm-display'
  bpmDisplay.textContent = '120 BPM'
  tempoSlider = document.createElement('input')
  tempoSlider.type = 'range'
  tempoSlider.min = '30'
  tempoSlider.max = '150'
  tempoSlider.value = '100'
  tempoSlider.style.width = '120px'
  tempoSlider.oninput = () => {
    const ratio = parseInt(tempoSlider.value) / 100
    cbs.onTempoChange(ratio)
  }

  // --- Metronome ---
  metBtn = document.createElement('button')
  metBtn.textContent = 'Met: OFF'
  metBtn.className = 'btn'
  let metOn = false
  metBtn.onclick = () => {
    metOn = !metOn
    metBtn.textContent = `Met: ${metOn ? 'ON' : 'OFF'}`
    metBtn.classList.toggle('btn-active', metOn)
    cbs.onMetronomeToggle(metOn)
  }

  // --- Hints ---
  hintsBtn = document.createElement('button')
  hintsBtn.textContent = 'Hints: OFF'
  hintsBtn.className = 'btn'
  let hintsOn = false
  hintsBtn.onclick = () => {
    hintsOn = !hintsOn
    hintsBtn.textContent = `Hints: ${hintsOn ? 'ON' : 'OFF'}`
    hintsBtn.classList.toggle('btn-active', hintsOn)
    cbs.onHintsToggle(hintsOn)
  }

  bar.append(rewindBtn, playBtn, pauseBtn, stopBtn, tempoLabel, tempoSlider, bpmDisplay, metBtn, hintsBtn)
  return bar
}

export function updateBpmDisplay(bpm: number): void {
  if (bpmDisplay) bpmDisplay.textContent = `${Math.round(bpm)} BPM`
}
