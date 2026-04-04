import { createToolbar, setScoreTitle } from './ui/toolbar'
import { createControls, updateBpmDisplay, setPlayPauseIcon, resetLoopControl, type HintsMode, type VoiceMode } from './ui/controls'
import { createScorePanel, getOsmdContainer, getBeatIndicator, setRangeIndicator, clearRangeIndicator } from './ui/scorePanel'
import { openFilePicker } from './modules/scoreLoader'
import { initDisplay, loadAndRender, getOsmd, resetCursor, advanceCursor,
         getMeasureCount, renderRange } from './modules/scoreDisplay'
import { initSampler, buildTimeline, play, pause, stop, setTempoRatio,
         getWrittenBpm, getTempoRatio, getTransportState, onCursorAdvance,
         setLoopEnabled, setLoopRestEnabled, setVoiceMode, setMusicVolume } from './modules/playback'
import { initMetronome, setMetronomeEnabled, startMetronome, stopMetronome, setMetronomeVolume } from './modules/metronome'
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
    updateExpectedPitch()
  })

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
  updateBpmDisplay(getWrittenBpm() * getTempoRatio())

  const container = getOsmdContainer()
  computeAndRenderHints(osmd, container, hintsMode)

  const sheet = (osmd as any).Sheet
  const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
  if (metronomeOn) {
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  }
}

async function handlePlayPause(): Promise<void> {
  if (!scoreLoaded) return
  if (getTransportState() === 'started') {
    pause()
    stopMetronome()
    setPlayPauseIcon(false)
  } else {
    await play()
    setPlayPauseIcon(true)
    const osmd = getOsmd()
    const sheet = (osmd as any)?.Sheet
    const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
    if (metronomeOn) {
      startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
    }
  }
}

function handleStop(): void {
  stop()
  stopMetronome()
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
  if (on) {
    const osmd = getOsmd()
    const sheet = (osmd as any)?.Sheet
    const ts = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature
    startMetronome(getWrittenBpm() * getTempoRatio(), ts?.Numerator ?? 4)
  } else {
    stopMetronome()
  }
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
  stopMetronome()
  setPlayPauseIcon(false)

  const osmd = getOsmd()
  if (!osmd) return
  const total = getMeasureCount()
  const clampedFrom = Math.max(1, from)
  const clampedTo   = Math.min(to, total)

  if (enabled) {
    renderRange(clampedFrom, clampedTo)
    setRangeIndicator(clampedFrom, clampedTo, total)
  } else {
    renderRange(1, total)
    clearRangeIndicator()
  }
  cursorIdx = 0
  setLoopEnabled(enabled)
  buildTimeline(osmd)
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
  // If we hit the end during rest-skipping, loop.
  if (osmd.cursor.iterator.EndReached && loopOn) {
    resetCursor(); cursorIdx = 0
  }
  updateExpectedPitch()
}
