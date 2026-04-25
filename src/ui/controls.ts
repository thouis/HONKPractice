import { INSTRUMENTS } from '../data/instruments/index'

export type HintsMode = 0 | 1 | 2  // 0=off, 1=position, 2=position+partial

export type VoiceMode = 'all' | 'lowest' | 'middle' | 'highest'

export interface ControlCallbacks {
  onPlayPause: () => void
  onStop: () => void
  onTempoChange: (bpm: number) => void
  onMetronomeToggle: (on: boolean) => void
  onHintsChange: (mode: HintsMode) => void
  onPitchModeChange: (mode: 'off' | 'show' | 'listen') => void
  onPracticeThresholdChange: (cents: number) => void
  onLoopChange: (enabled: boolean, from: number, to: number) => void
  onLoopRestChange: (enabled: boolean) => void
  onVoiceChange: (mode: VoiceMode) => void
  onSelectClick: () => void
  onPartClick: () => void
  onInstrumentChange: (id: string) => void
  initialInstrumentId: string
}

let bpmDisplay: HTMLSpanElement
let tempoSelect: HTMLSelectElement
let playPauseBtn: HTMLButtonElement
let metBtn: HTMLButtonElement
let hintsBtn: HTMLButtonElement
let pitchBtn: HTMLButtonElement
let loopBtn: HTMLButtonElement
let loopFromInput: HTMLInputElement
let loopToInput: HTMLInputElement
let loopRangeEls: HTMLElement[]
let selectBtn: HTMLButtonElement
let partBtn: HTMLButtonElement
let instrumentSelect: HTMLSelectElement
let loopBtnState = false  // single source of truth for loop button state
let hintsModeState: HintsMode = 0
let metOnState = false

export function createControls(cbs: ControlCallbacks): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'controls-bar'

  // --- Transport ---
  const rewindBtn = document.createElement('button')
  rewindBtn.textContent = '⏮'
  rewindBtn.className = 'btn'
  rewindBtn.onclick = cbs.onStop

  playPauseBtn = document.createElement('button')
  playPauseBtn.textContent = '▶'
  playPauseBtn.className = 'btn'
  playPauseBtn.onclick = cbs.onPlayPause

  const stopBtn = document.createElement('button')
  stopBtn.textContent = '⏹'
  stopBtn.className = 'btn'
  stopBtn.onclick = cbs.onStop

  // --- Tempo ---
  const tempoLabel = document.createElement('label')
  tempoLabel.textContent = 'Speed:'
  tempoLabel.style.cssText = 'font-size:13px;white-space:nowrap;flex-shrink:0;'

  tempoSelect = document.createElement('select')
  tempoSelect.style.cssText =
    'font-size:13px;padding:3px 4px;border:1px solid #999;border-radius:4px;' +
    'background:#fff;cursor:pointer;flex-shrink:0;'
  for (const [ratio, label] of [[0.5,'0.5×'],[0.75,'0.75×'],[1.0,'1×'],[1.25,'1.25×'],[1.5,'1.5×'],[2.0,'2×']] as [number,string][]) {
    const opt = document.createElement('option')
    opt.value = String(ratio)
    opt.textContent = label
    if (ratio === 1.0) opt.selected = true
    tempoSelect.appendChild(opt)
  }
  tempoSelect.onchange = () => cbs.onTempoChange(parseFloat(tempoSelect.value))

  bpmDisplay = document.createElement('span')
  bpmDisplay.id = 'bpm-display'
  bpmDisplay.textContent = '120 BPM'
  bpmDisplay.style.cssText = 'font-size:12px;color:#555;min-width:54px;flex-shrink:0;'

  // --- Metronome ---
  metBtn = document.createElement('button')
  metBtn.textContent = 'Met: OFF'
  metBtn.className = 'btn'
  metBtn.onclick = () => {
    metOnState = !metOnState
    metBtn.textContent = `Met: ${metOnState ? 'ON' : 'OFF'}`
    metBtn.classList.toggle('btn-active', metOnState)
    cbs.onMetronomeToggle(metOnState)
  }

  // --- Hints (3-state cycle: off → pos → pos+partial → off) ---
  hintsBtn = document.createElement('button')
  hintsBtn.className = 'btn'
  const HINTS_LABELS = ['Hints: OFF', 'Hints: pos', 'Hints: pos+∂']
  hintsBtn.textContent = HINTS_LABELS[0]
  hintsBtn.onclick = () => {
    hintsModeState = ((hintsModeState + 1) % 3) as HintsMode
    hintsBtn.textContent = HINTS_LABELS[hintsModeState]
    hintsBtn.classList.toggle('btn-active', hintsModeState > 0)
    cbs.onHintsChange(hintsModeState)
  }

  // --- Pitch mode (tri-state: off → show → listen → off) ---
  type PitchMode = 'off' | 'show' | 'listen'
  const PITCH_LABELS: Record<PitchMode, string> = { off: 'Mic: OFF', show: 'Mic: Show', listen: 'Mic: Listen' }
  const PITCH_CYCLE: PitchMode[] = ['off', 'show', 'listen']
  let pitchModeIdx = 0
  pitchBtn = document.createElement('button')
  pitchBtn.textContent = PITCH_LABELS['off']
  pitchBtn.className = 'btn'

  const thresholdLabel = document.createElement('label')
  thresholdLabel.textContent = '±'
  thresholdLabel.style.display = 'none'
  const thresholdInput = document.createElement('input')
  thresholdInput.type = 'number'
  thresholdInput.min = '5'
  thresholdInput.max = '50'
  thresholdInput.value = '20'
  thresholdInput.style.cssText = 'width:40px;display:none;'
  const thresholdUnit = document.createElement('span')
  thresholdUnit.textContent = '¢'
  thresholdUnit.style.display = 'none'

  pitchBtn.onclick = () => {
    pitchModeIdx = (pitchModeIdx + 1) % PITCH_CYCLE.length
    const mode = PITCH_CYCLE[pitchModeIdx]
    pitchBtn.textContent = PITCH_LABELS[mode]
    pitchBtn.classList.toggle('btn-active', mode !== 'off')
    const showThreshold = mode === 'listen'
    thresholdLabel.style.display = showThreshold ? '' : 'none'
    thresholdInput.style.display = showThreshold ? '' : 'none'
    thresholdUnit.style.display = showThreshold ? '' : 'none'
    cbs.onPitchModeChange(mode)
  }
  thresholdInput.oninput = () => {
    cbs.onPracticeThresholdChange(parseInt(thresholdInput.value) || 20)
  }

  // --- Loop ---
  loopBtn = document.createElement('button')
  loopBtn.textContent = 'Loop: OFF'
  loopBtn.className = 'btn'

  loopFromInput = document.createElement('input')
  loopFromInput.type = 'number'
  loopFromInput.min = '1'
  loopFromInput.max = '999'
  loopFromInput.value = '1'
  loopFromInput.style.cssText = 'width:44px;display:none;'
  loopFromInput.title = 'Loop from bar'

  const loopSep = document.createElement('span')
  loopSep.textContent = '–'
  loopSep.style.display = 'none'

  loopToInput = document.createElement('input')
  loopToInput.type = 'number'
  loopToInput.min = '1'
  loopToInput.max = '999'
  loopToInput.value = '999'
  loopToInput.style.cssText = 'width:44px;display:none;'
  loopToInput.title = 'Loop to bar'

  const loopRestBtn = document.createElement('button')
  loopRestBtn.textContent = 'Rest: ON'
  loopRestBtn.className = 'btn btn-active'
  loopRestBtn.style.cssText = 'display:none;font-size:0.8rem;'
  loopRestBtn.title = 'Insert one bar of silence between repeats'
  let loopRestOn = true
  loopRestBtn.onclick = () => {
    loopRestOn = !loopRestOn
    loopRestBtn.textContent = `Rest: ${loopRestOn ? 'ON' : 'OFF'}`
    loopRestBtn.classList.toggle('btn-active', loopRestOn)
    cbs.onLoopRestChange(loopRestOn)
  }

  loopRangeEls = [loopFromInput, loopSep, loopToInput, loopRestBtn]

  const fireLoop = () => {
    if (!loopBtnState) return
    const from = Math.max(1, parseInt(loopFromInput.value) || 1)
    const to   = Math.max(from, parseInt(loopToInput.value) || from)
    loopToInput.value = String(to)
    cbs.onLoopChange(true, from, to)
  }

  loopBtn.onclick = () => {
    loopBtnState = !loopBtnState
    loopBtn.textContent = `Loop: ${loopBtnState ? 'ON' : 'OFF'}`
    loopBtn.classList.toggle('btn-active', loopBtnState)
    loopRangeEls.forEach(el => el.style.display = loopBtnState ? '' : 'none')
    const from = parseInt(loopFromInput.value) || 1
    const to   = parseInt(loopToInput.value) || 1
    cbs.onLoopChange(loopBtnState, from, to)
  }
  loopFromInput.onchange = fireLoop
  loopToInput.onchange   = fireLoop

  // --- Voice selector ---
  const VOICE_LABELS: Record<VoiceMode, string> = {
    all: 'Voice: All', lowest: 'Voice: Low', middle: 'Voice: Mid', highest: 'Voice: High',
  }
  const VOICE_CYCLE: VoiceMode[] = ['all', 'lowest', 'middle', 'highest']
  let voiceIdx = 0
  const voiceBtn = document.createElement('button')
  voiceBtn.textContent = VOICE_LABELS['all']
  voiceBtn.className = 'btn'
  voiceBtn.onclick = () => {
    voiceIdx = (voiceIdx + 1) % VOICE_CYCLE.length
    const mode = VOICE_CYCLE[voiceIdx]
    voiceBtn.textContent = VOICE_LABELS[mode]
    voiceBtn.classList.toggle('btn-active', mode !== 'all')
    cbs.onVoiceChange(mode)
  }

  // --- Select range ---
  selectBtn = document.createElement('button')
  selectBtn.textContent = 'Select bars'
  selectBtn.className = 'btn'
  selectBtn.onclick = cbs.onSelectClick

  // --- Part selector (hidden until a multi-part score is loaded) ---
  partBtn = document.createElement('button')
  partBtn.textContent = 'Part'
  partBtn.className = 'btn'
  partBtn.style.display = 'none'
  partBtn.onclick = cbs.onPartClick

  // --- Instrument selector ---
  instrumentSelect = document.createElement('select')
  instrumentSelect.style.cssText =
    'font-size:13px;padding:3px 6px;border:1px solid #999;border-radius:4px;' +
    'background:#fff;cursor:pointer;'
  for (const [id, def] of Object.entries(INSTRUMENTS)) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = def.name
    if (id === cbs.initialInstrumentId) opt.selected = true
    instrumentSelect.appendChild(opt)
  }
  instrumentSelect.onchange = () => cbs.onInstrumentChange(instrumentSelect.value)

  bar.append(rewindBtn, playPauseBtn, stopBtn, tempoLabel, tempoSelect, bpmDisplay,
    selectBtn, partBtn,
    metBtn, hintsBtn, voiceBtn, pitchBtn, thresholdLabel, thresholdInput, thresholdUnit,
    loopBtn, loopFromInput, loopSep, loopToInput, loopRestBtn,
    instrumentSelect)
  return bar
}

export function updateBpmDisplay(bpm: number): void {
  if (bpmDisplay) bpmDisplay.textContent = `${Math.round(bpm)} BPM`
}

// Reset dropdown to 1× on new score load (written BPM stays in the BPM display)
export function setTempoDropdown(ratio: number): void {
  if (!tempoSelect) return
  const str = String(ratio)
  if ([...tempoSelect.options].some(o => o.value === str)) tempoSelect.value = str
}

export function setPlayPauseIcon(playing: boolean): void {
  if (playPauseBtn) playPauseBtn.textContent = playing ? '⏸' : '▶'
}

export type SelectBtnState = 'idle' | 'selecting' | 'active'

export function setSelectBtnState(state: SelectBtnState): void {
  if (!selectBtn) return
  const labels: Record<SelectBtnState, string> = {
    idle:      'Select bars',
    selecting: 'Cancel',
    active:    'Show all',
  }
  selectBtn.textContent = labels[state]
  selectBtn.classList.toggle('btn-active', state === 'active')
}

// Sync the loop button + inputs to reflect an externally-applied range.
export function setLoopUI(enabled: boolean, from: number, to: number): void {
  if (!loopBtn) return
  loopBtnState = enabled
  loopBtn.textContent = `Loop: ${enabled ? 'ON' : 'OFF'}`
  loopBtn.classList.toggle('btn-active', enabled)
  loopFromInput.value = String(from)
  loopToInput.value   = String(to)
  loopRangeEls.forEach(el => el.style.display = enabled ? '' : 'none')
}

// Call when a new score is loaded to reset loop range and max bar.
export function resetLoopControl(totalBars: number): void {
  if (!loopBtn) return
  loopBtnState = false
  loopBtn.textContent = 'Loop: OFF'
  loopBtn.classList.remove('btn-active')
  loopFromInput.value = '1'
  loopFromInput.max   = String(totalBars)
  loopToInput.value   = String(totalBars)
  loopToInput.max     = String(totalBars)
  loopRangeEls.forEach(el => el.style.display = 'none')
  // Reset rest button to ON (default)
  const restBtn = loopRangeEls[3] as HTMLButtonElement
  if (restBtn) {
    restBtn.textContent = 'Rest: ON'
    restBtn.classList.add('btn-active')
  }
}

// Sync the instrument selector to reflect an externally-applied change.
export function setInstrumentSelect(id: string): void {
  if (instrumentSelect) instrumentSelect.value = id
}

export function setMetronomeButton(on: boolean): void {
  if (!metBtn) return
  metOnState = on
  metBtn.textContent = `Met: ${on ? 'ON' : 'OFF'}`
  metBtn.classList.toggle('btn-active', on)
}

export function setHintsMode(mode: HintsMode): void {
  if (!hintsBtn) return
  hintsModeState = mode
  const HINTS_LABELS = ['Hints: OFF', 'Hints: pos', 'Hints: pos+∂']
  hintsBtn.textContent = HINTS_LABELS[mode]
  hintsBtn.classList.toggle('btn-active', mode > 0)
}

// Show or hide the Part button and update its label.
export function setPartButton(partName: string | null): void {
  if (!partBtn) return
  if (partName === null) {
    partBtn.style.display = 'none'
  } else {
    partBtn.style.display = ''
    partBtn.textContent = `Part: ${partName}`
  }
}
