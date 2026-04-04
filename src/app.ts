import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay, setPlayPauseIcon, resetLoopControl,
         setSelectBtnState, setLoopUI, type HintsMode, type VoiceMode } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator, setRangeIndicator, clearRangeIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadAndRender, getOsmd, resetCursor, advanceCursor,
         getMeasureCount, renderRange, initScrollSuppression, scrollCursorIntoView,
         buildCursorPixelPositions } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, getTransportState, onCursorAdvance,
         setLoopEnabled, setLoopRestEnabled, setVoiceMode, setMusicVolume,
         getTimeline, seekToEvent, reschedule } from './modules/playback'
import { initMetronome, setMetronomeEnabled, setMetronomeVolume } from './modules/metronome'
import { computeAndRenderHints } from './modules/positionAdvisor'
import { startPitchDetection, stopPitchDetection, setExpectedPitch,
         setPitchMeterAnchor, setPitchMeterThreshold, setPitchSensitivity } from './modules/pitchDetector'
import { startPracticeMode, stopPracticeMode, setPracticeExpectedPitch, setPracticeThreshold } from './modules/practiceMode'
import { saveScore, loadScore, saveSettings, loadSettings, saveScoreLoop, loadScoreLoop } from './modules/storage'
import { initLibraryPanel, openLibraryPanel } from './ui/libraryPanel'
import { initSettingsPanel, openSettingsPanel } from './ui/settingsPanel'
import { DEFAULT_SCORE_XML } from './data/defaultScore'

let hintsMode: HintsMode = 0
let metronomeOn = false
let scoreLoaded = false
let micOn = false
let practiceOn = false
let loopOn = false
let currentVoice: VoiceMode = 'all'
let currentXml = ''   // for per-score loop memory

// Module-level so handleStop can reset it without closure issues.
let cursorIdx = 0
let notePixelPositions: Map<number, {x: number, y: number}> = new Map()
let selectState: 'idle' | 'selecting' | 'active' = 'idle'
let selectFirstMeasure = -1
let selectAnchorEl: HTMLElement | null = null

export async function initApp(root: HTMLElement): Promise<void> {
  const settings = loadSettings()
  const savedTempoRatio: number = (settings.tempoRatio as number) ?? 1.0
  hintsMode = ((settings.hintsMode as HintsMode) ?? 0)
  metronomeOn = (settings.metronomeOn as boolean) ?? false

  // --- Build DOM ---
  initSettingsPanel({
    onMusicVolume:     setMusicVolume,
    onMetronomeVolume: setMetronomeVolume,
    onPitchSensitivity: setPitchSensitivity,
  })
  const toolbar = createToolbar(handleLoadScore, openLibraryPanel, openSettingsPanel)
  const scorePanel = createScorePanel()
  const controls = createControls({
    onPlayPause: handlePlayPause,
    onStop: handleStop,
    onTempoChange: handleTempoChange,
    onMetronomeToggle: handleMetronomeToggle,
    onHintsChange: handleHintsChange,
    onMicToggle: handleMicToggle,
    onPracticeToggle: handlePracticeToggle,
    onPracticeThresholdChange: handlePracticeThresholdChange,
    onLoopChange: handleLoopChange,
    onLoopRestChange: setLoopRestEnabled,
    onVoiceChange: handleVoiceChange,
    onSelectClick: handleSelectClick,
  })

  root.append(toolbar, controls, scorePanel)

  // --- Init subsystems ---
  await initLibraryPanel(async (xml, title) => {
    await renderScore(xml, title)
    saveScore(xml)
  })
  await initDisplay(getOsmdContainer())
  initMetronome(getBeatIndicator())

  const baseUrl = import.meta.env.BASE_URL + 'samples/trombone/'
  initSampler(baseUrl, () => { console.log('Sampler loaded from', baseUrl) })

  // Advance the OSMD cursor to match the transport position.
  // In practice mode the cursor is owned by pitch detection; suppress here.
  onCursorAdvance((idx) => {
    if (practiceOn) return
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
      computeAndRenderHints(osmd, container, hintsMode)
      notePixelPositions = buildCursorPixelPositions(container)
      updateMeterAnchor()
    }, 150)
  }).observe(getOsmdContainer())

  // Keyboard shortcuts.
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.code === 'Space')  { e.preventDefault(); handlePlayPause() }
    if (e.code === 'Escape') { e.preventDefault(); handleStop() }
  })

  // Click-to-seek: click anywhere on the score to jump to that position.
  getOsmdContainer().addEventListener('click', handleScoreClick)

  // Load saved score, or fall back to the built-in default.
  const savedXml = loadScore()
  await renderScore(savedXml ?? DEFAULT_SCORE_XML, savedXml ? 'Restored score' : 'C Major Scale')

  handleTempoChange(savedTempoRatio)
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
      alert('Failed to load score: ' + (e as Error).message)
    }
  }
}

async function renderScore(xml: string, titleHint: string): Promise<void> {
  setScoreTitle(titleHint)
  await loadAndRender(xml)

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

  // Restore saved loop range for this score, or reset to full score.
  const savedLoop = loadScoreLoop(xml)
  if (savedLoop) {
    loopOn = savedLoop.enabled
    const from = Math.max(1, savedLoop.from)
    const to   = Math.min(savedLoop.to, total)
    resetLoopControl(total)
    if (loopOn) {
      // re-apply range selector and indicators — handleLoopChange does this,
      // but we need to skip saving again; call it directly.
      renderRange(from, to)
      setLoopEnabled(true)
      setRangeIndicator(from, to, total)
    } else {
      clearRangeIndicator()
    }
  } else {
    loopOn = false
    setLoopEnabled(false)
    resetLoopControl(total)
    clearRangeIndicator()
  }

  buildTimeline(osmd)
  notePixelPositions = buildCursorPixelPositions(getOsmdContainer())
  updateBpmDisplay(getWrittenBpm() * getTempoRatio())

  const container = getOsmdContainer()
  computeAndRenderHints(osmd, container, hintsMode)

  const sheet = (osmd as any).Sheet
  const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
  if (metronomeOn) reschedule()
}

function clearSelectAnchor(): void {
  selectAnchorEl?.remove()
  selectAnchorEl = null
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
    selectState = 'idle'
    selectFirstMeasure = -1
    setSelectBtnState('idle')
    getOsmdContainer().style.cursor = ''
  } else {
    // Unselect — restore full score
    selectState = 'idle'
    setSelectBtnState('idle')
    const total = getMeasureCount()
    handleLoopChange(false, 1, total)
  }
}

function handleScoreClick(e: MouseEvent): void {
  if (practiceOn) return
  const osmd = getOsmd()
  if (!osmd || notePixelPositions.size === 0) return

  const container = getOsmdContainer()
  const rect = container.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top

  // Find the timeline event whose note is closest to the click (X weighted more).
  const tl = getTimeline()
  let bestEvIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < tl.length; i++) {
    const pos = notePixelPositions.get(tl[i].cursorIndex)
    if (!pos) continue
    const dx = pos.x - cx
    const dy = (pos.y - cy) * 0.25   // down-weight vertical distance
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) { bestDist = dist; bestEvIdx = i }
  }
  if (bestEvIdx === -1) return

  if (selectState === 'selecting') {
    // Selection mode: use measure index (1-based) as the anchor.
    const measure = tl[bestEvIdx].measureIndex + 1
    if (selectFirstMeasure === -1) {
      selectFirstMeasure = measure
      // Show a vertical marker at the clicked note position.
      const pos = notePixelPositions.get(tl[bestEvIdx].cursorIndex)
      if (pos) {
        clearSelectAnchor()
        selectAnchorEl = document.createElement('div')
        selectAnchorEl.style.cssText =
          `position:absolute;left:${pos.x - 1}px;top:0;bottom:0;width:2px;` +
          'background:#89b4fa;opacity:0.7;pointer-events:none;z-index:50;'
        container.appendChild(selectAnchorEl)
      }
    } else {
      const from = Math.min(selectFirstMeasure, measure)
      const to   = Math.max(selectFirstMeasure, measure)
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

  const targetCursorIdx = tl[bestEvIdx].cursorIndex
  seekToEvent(bestEvIdx)

  // Advance display cursor to match.
  resetCursor()
  for (let i = 0; i < targetCursorIdx; i++) advanceCursor()
  cursorIdx = targetCursorIdx
  scrollCursorIntoView()
  updateExpectedPitch()
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


function handleTempoChange(ratio: number): void {
  setTempoRatio(ratio)
  const bpm = getWrittenBpm() * ratio
  updateBpmDisplay(bpm)
  saveSettings({ tempoRatio: ratio, hintsMode, metronomeOn })
}

function handleMetronomeToggle(on: boolean): void {
  metronomeOn = on
  setMetronomeEnabled(on)
  reschedule()
  saveSettings({ tempoRatio: getTempoRatio(), hintsMode, metronomeOn })
}

function handleHintsChange(mode: HintsMode): void {
  hintsMode = mode
  const osmd = getOsmd()
  if (osmd) computeAndRenderHints(osmd, getOsmdContainer(), mode)
  saveSettings({ tempoRatio: getTempoRatio(), hintsMode: mode, metronomeOn })
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
  const fullMs = durationFraction * (60 / bpm) * 1000
  return Math.min(400, Math.max(150, fullMs * 0.5))
}

function updateExpectedPitch(): void {
  const hz = (micOn || practiceOn) ? currentNoteHz() : 0
  setExpectedPitch(hz)
  if (practiceOn) setPracticeExpectedPitch(hz, currentNoteHoldMs())
  updateMeterAnchor()
}

async function handleMicToggle(on: boolean): Promise<void> {
  micOn = on
  if (on) {
    try {
      await startPitchDetection(getOsmdContainer())
      updateExpectedPitch()
    } catch (e) {
      alert('Microphone access denied: ' + (e as Error).message)
      micOn = false
    }
  } else if (!practiceOn) {
    stopPitchDetection()
    setExpectedPitch(0)
  }
}

function handlePracticeThresholdChange(cents: number): void {
  setPracticeThreshold(cents)
  setPitchMeterThreshold(cents)
}

async function handleLoopChange(enabled: boolean, from: number, to: number): Promise<void> {
  loopOn = enabled
  stop()
  setPlayPauseIcon(false)

  const osmd = getOsmd()
  if (!osmd) return
  const total = getMeasureCount()
  const clampedFrom = Math.max(1, from)
  const clampedTo   = Math.min(to, total)

  if (enabled || selectState === 'active') {
    // Show selected/loop range; keep it visible even when just toggling loop off.
    renderRange(clampedFrom, clampedTo)
    setRangeIndicator(clampedFrom, clampedTo, total)
  } else {
    renderRange(1, total)
    clearRangeIndicator()
  }
  cursorIdx = 0
  setLoopEnabled(enabled)
  buildTimeline(osmd)
  notePixelPositions = buildCursorPixelPositions(getOsmdContainer())
  computeAndRenderHints(osmd, getOsmdContainer(), hintsMode)
  updateExpectedPitch()

  if (currentXml) saveScoreLoop(currentXml, { enabled, from: clampedFrom, to: clampedTo })
}

function handleVoiceChange(mode: VoiceMode): void {
  currentVoice = mode
  setVoiceMode(mode)
  updateExpectedPitch()
}

async function handlePracticeToggle(on: boolean): Promise<void> {
  practiceOn = on
  if (on) {
    if (!micOn) {
      try {
        await startPitchDetection(getOsmdContainer())
      } catch (e) {
        alert('Microphone access denied: ' + (e as Error).message)
        practiceOn = false
        return
      }
    }
    const initialThreshold = 20
    setPitchMeterThreshold(initialThreshold)
    const hz = currentNoteHz()
    setExpectedPitch(hz)
    setPracticeExpectedPitch(hz, currentNoteHoldMs())
    updateMeterAnchor()
    startPracticeMode(practiceAdvance, initialThreshold)
  } else {
    stopPracticeMode()
    if (!micOn) {
      stopPitchDetection()
      setExpectedPitch(0)
    }
  }
}

function practiceAdvance(): void {
  const osmd = getOsmd()
  if (!osmd) return

  if (osmd.cursor.iterator.EndReached) {
    if (loopOn) { resetCursor(); cursorIdx = 0; updateExpectedPitch() }
    else showPracticeDone()
    return
  }

  advanceCursor()
  cursorIdx++
  // Skip rests automatically.
  while (!osmd.cursor.iterator.EndReached) {
    const notes = osmd.cursor.NotesUnderCursor()
    if ((notes ?? []).some((n: any) => !n.isRest?.())) break
    advanceCursor()
    cursorIdx++
  }
  // If we hit the end during rest-skipping, loop or signal done.
  if (osmd.cursor.iterator.EndReached) {
    if (loopOn) { resetCursor(); cursorIdx = 0 }
    else showPracticeDone()
  }
  updateExpectedPitch()
}

function showPracticeDone(): void {
  const container = getOsmdContainer()
  const el = document.createElement('div')
  el.textContent = 'Done!'
  el.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'font-size:3rem;font-weight:bold;color:#a6e3a1;text-shadow:0 0 20px #a6e3a1;' +
    'pointer-events:none;opacity:1;transition:opacity 1s;z-index:100;'
  container.appendChild(el)
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0' }))
  el.addEventListener('transitionend', () => el.remove())
}
