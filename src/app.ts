import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay, setTempoSlider, setPlayPauseIcon, resetLoopControl,
         setSelectBtnState, setLoopUI, setPartButton, setInstrumentSelect, setHintsMode,
         type HintsMode, type VoiceMode } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator, setRangeIndicator, clearRangeIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadOsmdScore, renderOsmdScore, getOsmd, resetCursor, advanceCursor,
         getMeasureCount, renderRange, initScrollSuppression, scrollCursorIntoView,
         buildCursorPixelPositions, getPartNames, setVisibleParts } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, getTransportState, onCursorAdvance,
         setLoopEnabled, setLoopRestEnabled, setVoiceMode, setMusicVolume, setMusicMuted,
         getTimeline, seekToEvent, reschedule } from './modules/playback'
import { initMetronome, setMetronomeEnabled, setMetronomeVolume } from './modules/metronome'
import { computeAndRenderHints } from './modules/positionAdvisor'
import { INSTRUMENTS, DEFAULT_INSTRUMENT } from './data/instruments/index'
import type { InstrumentDef } from './types'
import { startPitchDetection, stopPitchDetection, setExpectedPitch,
         setPitchMeterAnchor, setPitchMeterThreshold, setPitchSensitivity } from './modules/pitchDetector'
import { startPracticeMode, stopPracticeMode, setPracticeExpectedPitch, setPracticeThreshold } from './modules/practiceMode'
import { practiceAdvanceStep } from './modules/practiceAdvance'
import { saveScore, loadScore, saveSettings, loadSettings, saveScoreLoop } from './modules/storage'
import { toggleDebugPanel, debugLog } from './modules/debugPanel'
import { initLibraryPanel, openLibraryPanel } from './ui/libraryPanel'
import { notify } from './ui/notify'
import { initSettingsPanel, openSettingsPanel } from './ui/settingsPanel'
import { openHelpPanel } from './ui/helpPanel'
import { DEFAULT_SCORE_XML } from './data/defaultScore'
import { pickPart } from './ui/partPicker'

let hintsMode: HintsMode = 0
let metronomeOn = false
let scoreLoaded = false
let pitchMode: 'off' | 'show' | 'listen' = 'off'
let loopOn = false
let currentVoice: VoiceMode = 'all'
let currentInstrument: InstrumentDef = INSTRUMENTS[DEFAULT_INSTRUMENT]
let currentXml = ''   // for per-score loop memory
let currentPartIndices: number[] | null = null  // null = all parts

// Module-level so handleStop can reset it without closure issues.
let cursorIdx = 0
let notePixelPositions: Map<number, {x: number, y: number, height: number}> = new Map()
let selectState: 'idle' | 'selecting' | 'active' = 'idle'
let selectFirstMeasure = -1
let selectAnchorEl: HTMLElement | null = null   // highlight for anchored first bar
let selectHoverEl: HTMLElement | null = null    // highlight that tracks mouse hover

export async function initApp(root: HTMLElement): Promise<void> {
  const settings = loadSettings()
  hintsMode = ((settings.hintsMode as HintsMode) ?? 0)
  metronomeOn = (settings.metronomeOn as boolean) ?? false
  const savedInstrumentId = (settings.instrumentId as string) ?? DEFAULT_INSTRUMENT
  currentInstrument = INSTRUMENTS[savedInstrumentId] ?? INSTRUMENTS[DEFAULT_INSTRUMENT]

  // --- Build DOM ---
  initSettingsPanel({
    onMusicVolume:     setMusicVolume,
    onMetronomeVolume: setMetronomeVolume,
    onPitchSensitivity: setPitchSensitivity,
  })
  const toolbar = createToolbar(handleLoadScore, openLibraryPanel, openSettingsPanel, openHelpPanel)
  const scorePanel = createScorePanel()
  const controls = createControls({
    onPlayPause: handlePlayPause,
    onStop: handleStop,
    onTempoChange: handleTempoChange,
    onMetronomeToggle: handleMetronomeToggle,
    onHintsChange: handleHintsChange,
    onPitchModeChange: handlePitchModeChange,
    onPracticeThresholdChange: handlePracticeThresholdChange,
    onLoopChange: handleLoopChange,
    onLoopRestChange: setLoopRestEnabled,
    onVoiceChange: handleVoiceChange,
    onSelectClick: handleSelectClick,
    onPartClick: handlePartClick,
    onInstrumentChange: handleInstrumentChange,
    initialInstrumentId: currentInstrument.id,
  })

  root.append(toolbar, controls, scorePanel)
  setHintsMode(hintsMode)   // sync button to restored setting

  // --- Init subsystems ---
  await initLibraryPanel(async (xml, title) => {
    await renderScore(xml, title)
    saveScore(xml)
  })
  await initDisplay(getOsmdContainer())
  initMetronome(getBeatIndicator())

  const baseUrl = import.meta.env.BASE_URL + currentInstrument.samplePath
  initSampler(baseUrl, currentInstrument.sampleMap, () => { console.log('Sampler loaded from', baseUrl) })

  // Advance the OSMD cursor to match the transport position.
  // In practice mode the cursor is owned by pitch detection; suppress here.
  onCursorAdvance((idx) => {
    if (pitchMode === 'listen') return
    const osmd = getOsmd()
    if (!osmd) return
    // Transport loop wrap: idx jumped backward → reset cursor to loop start.
    if (loopOn && idx < cursorIdx) {
      resetCursor()
      cursorIdx = 0
    }
    while (cursorIdx < idx) {
      advanceCursor()
      cursorIdx++
    }
    scrollCursorIntoView()
    updateExpectedPitch()
  })

  initScrollSuppression()

  // Re-run hints and rebuild click map when the score container resizes.
  let resizeTimer = 0
  new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      const osmd = getOsmd()
      const container = getOsmdContainer()
      if (!osmd) return
      computeAndRenderHints(osmd, container, hintsMode, currentVoice, currentInstrument)
      notePixelPositions = buildCursorPixelPositions(container)
      updateMeterAnchor()
    }, 150)
  }).observe(getOsmdContainer())

  // Keyboard shortcuts.
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.code === 'Space')  { e.preventDefault(); handlePlayPause() }
    if (e.code === 'Escape') { e.preventDefault(); handleStop() }
    if (e.code === 'KeyD')   { e.preventDefault(); toggleDebugPanel() }
  })

  // Click-to-seek: click anywhere on the score to jump to that position.
  getOsmdContainer().addEventListener('click', handleScoreClick)
  getOsmdContainer().addEventListener('mousemove', handleScoreHover)
  getOsmdContainer().addEventListener('mouseleave', () => { if (selectState === 'selecting') clearSelectHover() })

  // Load saved score, or fall back to the built-in default.
  const savedXml = loadScore()
  await renderScore(savedXml ?? DEFAULT_SCORE_XML, savedXml ? 'Restored score' : 'C Major Scale')
}

async function handleLoadScore(): Promise<void> {
  try {
    const xml = await openFilePicker()
    // Try to extract title from the file picker (file input doesn't expose the name easily here,
    // so we read it from the MusicXML work-title element).
    const titleMatch = xml.match(/<work-title>([^<]+)<\/work-title>/)
      ?? xml.match(/<movement-title>([^<]+)<\/movement-title>/)
    const title = titleMatch?.[1] ?? 'Loaded score'
    await renderScore(xml, title)
    saveScore(xml)
  } catch (e) {
    if ((e as Error).message !== 'No file selected') {
      notify('Failed to load score: ' + (e as Error).message, 'error')
    }
  }
}

async function renderScore(xml: string, titleHint: string): Promise<void> {
  setScoreTitle(titleHint)
  await loadOsmdScore(xml)
  const parts = getPartNames()
  if (parts.length > 1) {
    const sel = await pickPart(parts, currentPartIndices)
    currentPartIndices = sel.indices
    setVisibleParts(sel.indices)
    const label = sel.indices.length === parts.length ? 'All' : (parts.find(p => p.index === sel.indices[0])?.name ?? 'Part')
    setPartButton(label)
    if (sel.instrumentId) applyInstrument(sel.instrumentId)
  } else {
    currentPartIndices = null
    setPartButton(null)
  }
  renderOsmdScore()

  const osmd = getOsmd()
  if (!osmd) return

  currentXml = xml
  scoreLoaded = true
  cursorIdx = 0
  selectState = 'idle'
  selectFirstMeasure = -1
  clearSelectAnchor()
  setSelectBtnState('idle')
  getOsmdContainer().style.cursor = ''
  const total = getMeasureCount()

  // Always start with full score / idle selection; loop range numbers are
  // pre-filled from saved state but not auto-activated.
  loopOn = false
  setLoopEnabled(false)
  clearRangeIndicator()
  resetLoopControl(total)

  buildTimeline(osmd)
  if (getTimeline().length === 0) notify('No playable notes found in this score', 'warning')
  notePixelPositions = buildCursorPixelPositions(getOsmdContainer())
  setTempoRatio(1.0)
  const writtenBpm = getWrittenBpm()
  setTempoSlider(writtenBpm)
  updateBpmDisplay(writtenBpm)

  const container = getOsmdContainer()
  computeAndRenderHints(osmd, container, hintsMode, currentVoice, currentInstrument)

  if (metronomeOn) reschedule()
}

function clearSelectAnchor(): void {
  selectAnchorEl?.remove()
  selectAnchorEl = null
}

function clearSelectHover(): void {
  selectHoverEl?.remove()
  selectHoverEl = null
}

// Returns the pixel bounds of a given 1-based measure number from notePixelPositions.
function measureBounds(measureNum: number): { left: number, right: number, top: number, bottom: number } | null {
  const tl = getTimeline()
  const positions = tl
    .filter(ev => ev.measureIndex === measureNum)
    .map(ev => notePixelPositions.get(ev.cursorIndex))
    .filter((p): p is {x: number, y: number, height: number} => p !== undefined)
  if (positions.length === 0) return null
  const xs = positions.map(p => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const top    = Math.min(...positions.map(p => p.y))
  const bottom = Math.max(...positions.map(p => p.y + p.height))
  return { left: minX - 10, right: maxX + 10, top, bottom }
}

function showSelectHighlight(el: HTMLElement | null, measureNum: number, color: string): HTMLElement | null {
  const container = getOsmdContainer()
  const bounds = measureBounds(measureNum)
  if (el) el.remove()
  if (!bounds) return null
  const div = document.createElement('div')
  div.style.cssText =
    `position:absolute;` +
    `left:${bounds.left}px;width:${bounds.right - bounds.left}px;` +
    `top:${bounds.top}px;height:${bounds.bottom - bounds.top}px;` +
    `background:${color};pointer-events:none;z-index:40;`
  container.appendChild(div)
  return div
}

function handleSelectClick(): void {
  if (selectState === 'idle') {
    selectState = 'selecting'
    selectFirstMeasure = -1
    setSelectBtnState('selecting')
    getOsmdContainer().style.cursor = 'crosshair'
  } else if (selectState === 'selecting') {
    // Cancel
    clearSelectAnchor()
    clearSelectHover()
    selectState = 'idle'
    selectFirstMeasure = -1
    setSelectBtnState('idle')
    getOsmdContainer().style.cursor = ''
  } else {
    // Unselect — restore full score
    selectState = 'idle'
    setSelectBtnState('idle')
    const total = getMeasureCount()
    setLoopUI(false, 1, total)
    handleLoopChange(false, 1, total)
  }
}

function nearestMeasureAtEvent(e: MouseEvent): number {
  const container = getOsmdContainer()
  const rect = container.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const tl = getTimeline()
  let bestEvIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < tl.length; i++) {
    const pos = notePixelPositions.get(tl[i].cursorIndex)
    if (!pos) continue
    const dx = pos.x - cx
    const dy = (pos.y - cy) * 0.25
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) { bestDist = dist; bestEvIdx = i }
  }
  return bestEvIdx >= 0 ? tl[bestEvIdx].measureIndex : -1
}

let lastHoverDebugMs = 0
function handleScoreHover(e: MouseEvent): void {
  if (pitchMode === 'listen' || notePixelPositions.size === 0) {
    const now = Date.now()
    if (now - lastHoverDebugMs > 500) {
      lastHoverDebugMs = now
      debugLog(`[hover] skipped: pitchMode=${pitchMode} positions=${notePixelPositions.size}`)
    }
    return
  }
  const container = getOsmdContainer()
  const rect = container.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const measure = nearestMeasureAtEvent(e)
  const now = Date.now()
  if (now - lastHoverDebugMs > 300) {
    lastHoverDebugMs = now
    debugLog(`[hover] cx=${cx.toFixed(0)} cy=${cy.toFixed(0)} measure=${measure} positions=${notePixelPositions.size}`)
  }
  if (measure < 0) return
  let color: string
  if (selectState === 'selecting') {
    color = selectFirstMeasure < 0
      ? 'rgba(137,180,250,0.2)'
      : 'rgba(166,227,161,0.25)'
  } else {
    color = 'rgba(137,180,250,0.12)'
  }
  selectHoverEl = showSelectHighlight(selectHoverEl, measure, color)
}

function seekToMeasure(measure: number): void {
  const tl = getTimeline()
  const evIdx = tl.findIndex(ev => ev.measureIndex === measure && ev.midiNotes.length > 0)
  if (evIdx === -1) return
  const targetCursorIdx = tl[evIdx].cursorIndex
  seekToEvent(evIdx)
  resetCursor()
  for (let i = 0; i < targetCursorIdx; i++) advanceCursor()
  cursorIdx = targetCursorIdx
  scrollCursorIntoView()
  updateExpectedPitch()
}

function handleScoreClick(e: MouseEvent): void {
  if (pitchMode === 'listen') return
  const osmd = getOsmd()
  if (!osmd || notePixelPositions.size === 0) return

  const container = getOsmdContainer()
  const measure = nearestMeasureAtEvent(e)
  if (measure < 0) return

  if (selectState === 'selecting') {
    debugLog(`[select] click measure=${measure} firstMeasure=${selectFirstMeasure}`)
    clearSelectHover()
    if (selectFirstMeasure === -1) {
      selectFirstMeasure = measure
      selectAnchorEl = showSelectHighlight(selectAnchorEl, measure, 'rgba(137,180,250,0.35)')
    } else {
      const from = Math.min(selectFirstMeasure, measure) + 1  // convert 0-based measureIndex to 1-based UI
      const to   = Math.max(selectFirstMeasure, measure) + 1
      clearSelectAnchor()
      selectFirstMeasure = -1
      selectState = 'active'
      setSelectBtnState('active')
      container.style.cursor = ''
      setLoopUI(true, from, to)
      handleLoopChange(true, from, to)
    }
    return
  }

  seekToMeasure(measure)
}

async function handlePlayPause(): Promise<void> {
  if (!scoreLoaded) return
  if (getTransportState() === 'started') {
    pause()
    setPlayPauseIcon(false)
  } else {
    await play()
    setPlayPauseIcon(true)
  }
}

function handleStop(): void {
  stop()
  resetCursor()
  cursorIdx = 0
  setPlayPauseIcon(false)
}


function handleTempoChange(bpm: number): void {
  setTempoRatio(bpm / getWrittenBpm())
  updateBpmDisplay(bpm)
}

function handleMetronomeToggle(on: boolean): void {
  metronomeOn = on
  setMetronomeEnabled(on)
  reschedule()
  saveSettings({ hintsMode, metronomeOn, instrumentId: currentInstrument.id })
}

function handleHintsChange(mode: HintsMode): void {
  hintsMode = mode
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), mode, currentVoice, currentInstrument)
  saveSettings({ hintsMode: mode, metronomeOn, instrumentId: currentInstrument.id })
}

// Returns Hz of the selected voice note under cursor, or 0.
function currentNoteHz(): number {
  const osmd = getOsmd()
  if (!osmd) return 0
  const notes = osmd.cursor.NotesUnderCursor()
  const pitched = (notes ?? []).filter((n: any) => !n.isRest?.())
  if (pitched.length === 0) return 0
  const asc = pitched.map((n: any) => n.halfTone + 12).sort((a: number, b: number) => a - b)
  let midi: number
  switch (currentVoice) {
    case 'highest': midi = asc[asc.length - 1]; break
    case 'middle':  midi = asc[Math.floor((asc.length - 1) / 2)]; break
    default:        midi = asc[0]; break  // 'lowest' and 'all' both reference lowest for pitch
  }
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Reposition the pitch meter to the right of the current OSMD cursor element.
function updateMeterAnchor(): void {
  const osmd = getOsmd()
  if (!osmd) return
  const cursorEl = (osmd.cursor as any).cursorElement as Element | null
  if (!cursorEl) return
  const containerRect = getOsmdContainer().getBoundingClientRect()
  const r = cursorEl.getBoundingClientRect()
  setPitchMeterAnchor(
    r.right - containerRect.left + 6,
    r.top  - containerRect.top,
    r.height
  )
}

// Returns hold time in ms for the current note.
// Uses ~50% of the written note duration, clamped to 150–400ms so it feels
// responsive without being too easy on fast passages.
function currentNoteHoldMs(): number {
  const osmd = getOsmd()
  if (!osmd) return 250
  const notes = osmd.cursor.NotesUnderCursor()
  const first = (notes ?? []).find((n: any) => !n.isRest?.()) as any
  const durationFraction: number = first?.Length?.RealValue ?? 0.25
  const bpm = getWrittenBpm() * getTempoRatio()
  const fullMs = durationFraction * (60 / bpm * 4) * 1000
  return Math.min(400, Math.max(150, fullMs * 0.5))
}

function updateExpectedPitch(): void {
  const hz = pitchMode !== 'off' ? currentNoteHz() : 0
  setExpectedPitch(hz)
  if (pitchMode === 'listen') setPracticeExpectedPitch(hz, currentNoteHoldMs())
  updateMeterAnchor()
}

async function handlePitchModeChange(mode: 'off' | 'show' | 'listen'): Promise<void> {
  const prev = pitchMode
  pitchMode = mode

  if (mode === 'off') {
    if (prev === 'listen') stopPracticeMode()
    stopPitchDetection()
    setExpectedPitch(0)
    setMusicMuted(false)
    return
  }

  // Start mic if not already running
  if (prev === 'off') {
    try {
      await startPitchDetection(getOsmdContainer())
    } catch (e) {
      notify('Microphone access denied — check browser permissions', 'error')
      pitchMode = 'off'
      return
    }
  }

  if (mode === 'listen') {
    if (prev !== 'listen') {
      setMusicMuted(true)
      stop()
      setPlayPauseIcon(false)
      const initialThreshold = 20
      setPitchMeterThreshold(initialThreshold)
      const hz = currentNoteHz()
      setExpectedPitch(hz)
      setPracticeExpectedPitch(hz, currentNoteHoldMs())
      updateMeterAnchor()
      startPracticeMode(practiceAdvance, initialThreshold)
      // Skip forward past any leading rests
      const osmd = getOsmd()
      if (osmd && currentNoteHz() === 0) {
        let skipped = 0
        while (!osmd.cursor.iterator.EndReached && skipped < 512) {
          if ((osmd.cursor.NotesUnderCursor() ?? []).some((n: any) => !n.isRest?.())) break
          advanceCursor(); cursorIdx++; skipped++
        }
        updateExpectedPitch()
      }
    }
  } else {
    // show mode: stop practice if coming from listen
    if (prev === 'listen') {
      stopPracticeMode()
      setMusicMuted(false)
    }
    updateExpectedPitch()
  }
}

function handlePracticeThresholdChange(cents: number): void {
  setPracticeThreshold(cents)
  setPitchMeterThreshold(cents)
}

function handleLoopChange(enabled: boolean, from: number, to: number): void {
  debugLog(`[loop] enabled=${enabled} from=${from} to=${to} total=${getMeasureCount()}`)
  loopOn = enabled
  stop()
  setPlayPauseIcon(false)

  const osmd = getOsmd()
  if (!osmd) return
  const total = getMeasureCount()
  const clampedFrom = Math.max(1, from)
  const clampedTo   = Math.min(to, total)

  if (enabled || selectState === 'active') {
    renderRange(clampedFrom, clampedTo)
    buildTimeline(osmd)
    setRangeIndicator(clampedFrom, clampedTo, total)
  } else {
    renderRange(1, total)
    buildTimeline(osmd)
    clearRangeIndicator()
  }
  notePixelPositions = buildCursorPixelPositions(getOsmdContainer())
  cursorIdx = 0
  setLoopEnabled(enabled)
  computeAndRenderHints(osmd, getOsmdContainer(), hintsMode, currentVoice, currentInstrument)
  updateExpectedPitch()

  if (currentXml) saveScoreLoop(currentXml, { enabled, from: clampedFrom, to: clampedTo })
}

async function handlePartClick(): Promise<void> {
  if (!currentXml) return
  const parts = getPartNames()
  if (parts.length <= 1) return
  const sel = await pickPart(parts, currentPartIndices)
  currentPartIndices = sel.indices
  setVisibleParts(sel.indices)
  const label = sel.indices.length === parts.length
    ? 'All'
    : (parts.find(p => p.index === sel.indices[0])?.name ?? 'Part')
  setPartButton(label)
  if (sel.instrumentId) applyInstrument(sel.instrumentId)
  renderOsmdScore()
  const osmd = getOsmd()
  if (!osmd) return
  buildTimeline(osmd)
  notePixelPositions = buildCursorPixelPositions(getOsmdContainer())
  cursorIdx = 0
  computeAndRenderHints(osmd, getOsmdContainer(), hintsMode, currentVoice, currentInstrument)
  updateExpectedPitch()
}

function handleVoiceChange(mode: VoiceMode): void {
  currentVoice = mode
  setVoiceMode(mode)
  updateExpectedPitch()
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), hintsMode, currentVoice, currentInstrument)
}

function applyInstrument(id: string): void {
  if (!INSTRUMENTS[id] || INSTRUMENTS[id] === currentInstrument) return
  currentInstrument = INSTRUMENTS[id]
  const baseUrl = import.meta.env.BASE_URL + currentInstrument.samplePath
  initSampler(baseUrl, currentInstrument.sampleMap, () => {})
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), hintsMode, currentVoice, currentInstrument)
  saveSettings({ hintsMode, metronomeOn, instrumentId: id })
  setInstrumentSelect(id)
}

function handleInstrumentChange(id: string): void {
  applyInstrument(id)
  saveSettings({ hintsMode, metronomeOn, instrumentId: id })
}


function practiceAdvance(): void {
  const state = { cursorIdx, loopOn }
  practiceAdvanceStep(state, {
    getOsmd,
    advanceCursor,
    resetCursor,
    scrollCursorIntoView,
    updateExpectedPitch,
  })
  cursorIdx = state.cursorIdx
}

