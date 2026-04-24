import * as Tone from 'tone'
import { isEnabled as isMetronomeEnabled, scheduleClick } from './metronome'
import type { NoteEvent } from '../types'
import { notify } from '../ui/notify'

const DEBUG = false


export type VoiceMode = 'all' | 'lowest' | 'middle' | 'highest'

let sampler: Tone.Sampler | null = null
let timeline: NoteEvent[] = []
let cursorCallbacks: Array<(idx: number) => void> = []
let writtenBpm = 120
let tempoRatio = 1.0
let timelineOffset = 0   // fractionStart of first event; events are scheduled relative to this
let loopEnabled = false
let loopRestEnabled = true   // insert one bar of silence before each repeat
let beatsPerBar = 4
let beatDenominator = 4  // time sig denominator; whole note / denominator = one click interval
let voiceMode: VoiceMode = 'all'
let seekOffsetSec: number | null = null   // null = no seek; 0 = seeked to beginning
let userVolumeDb = 20 * Math.log10(80 / 100)
let musicMuted = false

export function setVoiceMode(mode: VoiceMode): void { voiceMode = mode }

function selectVoiceNotes(midiNotes: number[]): number[] {
  if (midiNotes.length === 0 || voiceMode === 'all') return midiNotes
  const asc = [...midiNotes].sort((a, b) => a - b)
  if (voiceMode === 'lowest')  return [asc[0]]
  if (voiceMode === 'highest') return [asc[asc.length - 1]]
  // middle: true centre for odd, lower-centre for even
  return [asc[Math.floor((asc.length - 1) / 2)]]
}

export function initSampler(baseUrl: string, sampleMap: Record<string, string>, onLoad: () => void): void {
  const urls: Record<string, string> = {}
  for (const [note, file] of Object.entries(sampleMap)) { urls[note] = file }

  sampler = new Tone.Sampler({
    urls,
    baseUrl,
    release: 0.5,
    onload: () => { console.log('Sampler loaded from', baseUrl); onLoad() },
    onerror: (e) => { console.error('Sampler load error', e); notify('Audio samples failed to load — playback unavailable', 'error') },
  }).toDestination()
}


// Build event timeline from OSMD cursor walk
export function buildTimeline(osmd: import('opensheetmusicdisplay').OpenSheetMusicDisplay): void {
  timeline = []
  const sheet = (osmd as any).Sheet
  writtenBpm = sheet?.SheetPlaybackSetting?.BeatsPerMinute ?? 120

  osmd.cursor.reset()
  let idx = 0
  let prevFraction = -1
  while (!osmd.cursor.iterator.EndReached) {
    const ts: any = osmd.cursor.iterator.CurrentSourceTimestamp
    // If timestamp is null the RealValue will be 0; treat those entries as
    // belonging to the previous timestamp so they don't pile up at t=0.
    const fractionStart: number = ts != null ? (ts.RealValue ?? 0) : prevFraction

    // Skip positions the cursor revisits due to repeat signs — each measure
    // is only scheduled once.  A backwards jump in fractionStart always means
    // a repeat; forward-only scores never go backwards.
    if (fractionStart < prevFraction - 1e-6) {
      osmd.cursor.next()
      idx++
      continue
    }

    const notes = osmd.cursor.NotesUnderCursor()

    const midiNotes: number[] = []
    const noteDurations: number[] = []   // parallel to midiNotes
    let durationFraction = 0

    let hasTieStop = false
    for (const note of notes ?? []) {
      const n = note as any
      // Skip rests and tie continuations (held notes should not re-trigger).
      if (n.isRest?.()) continue
      const tie = n.NoteTie
      // Skip only genuine tie continuations: StartNote must exist, differ from this
      // note, AND share the same pitch (ties always connect equal pitches; slurs
      // encoded as ties would have different pitches and should still sound).
      if (tie && tie.StartNote && tie.StartNote !== n &&
          tie.StartNote.halfTone === n.halfTone) {
        hasTieStop = true
        continue
      }

      // For the start of a tie chain, sum all chained note lengths so the
      // sampler sustains through continuations that we skip.
      let noteDur: number = n.Length?.RealValue ?? 0.25
      if (tie && tie.StartNote === n && Array.isArray(tie.Notes) && tie.Notes.length > 1) {
        noteDur = (tie.Notes as any[]).reduce(
          (sum: number, tn: any) => sum + (tn.Length?.RealValue ?? 0), 0
        )
      }

      midiNotes.push(n.halfTone + 12)
      noteDurations.push(noteDur)
      if (durationFraction === 0) durationFraction = noteDur
    }

    // Implied chord tie: when at least one note in this chord is an explicit
    // tie-stop, suppress re-attacks of any other notes already sounding (present
    // in the immediately preceding timeline event) and extend their held duration.
    // Handles scores where only one voice in a chord carries an explicit tie but
    // the whole chord is intended to be held.
    if (hasTieStop && timeline.length > 0) {
      const prevEvent = timeline[timeline.length - 1]
      for (let i = midiNotes.length - 1; i >= 0; i--) {
        const prevIdx = prevEvent.midiNotes.indexOf(midiNotes[i])
        if (prevIdx >= 0) {
          prevEvent.noteDurations[prevIdx] += noteDurations[i]
          midiNotes.splice(i, 1)
          noteDurations.splice(i, 1)
        }
      }
    }

    // Merge entries at the same timestamp into a single event to avoid
    // multiple cursor advances firing simultaneously.
    if (Math.abs(fractionStart - prevFraction) < 1e-6 && timeline.length > 0) {
      const last = timeline[timeline.length - 1]
      // Absorb any new notes into the existing event at this timestamp.
      for (let i = 0; i < midiNotes.length; i++) {
        if (!last.midiNotes.includes(midiNotes[i])) {
          last.midiNotes.push(midiNotes[i])
          last.noteDurations.push(noteDurations[i])
        }
      }
      if (last.durationFraction === 0 && durationFraction > 0) {
        last.durationFraction = durationFraction
      }
      // Update cursorIndex to the latest step at this timestamp so the cursor
      // ends up at the right position after all voices at this beat are processed.
      last.cursorIndex = idx
    } else {
      timeline.push({
        fractionStart,
        durationFraction,
        midiNotes,
        noteDurations,
        cursorIndex: idx,
        measureIndex: osmd.cursor.iterator.CurrentMeasureIndex,
      })
      prevFraction = fractionStart
    }

    osmd.cursor.next()
    idx++
  }
  osmd.cursor.reset()
  timelineOffset = timeline.length > 0 ? timeline[0].fractionStart : 0
  beatsPerBar = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature?.Numerator ?? 4
  beatDenominator = sheet?.SourceMeasures?.[0]?.ActiveTimeSignature?.Denominator ?? 4
}

export function setLoopEnabled(enabled: boolean): void {
  loopEnabled = enabled
}

export function setLoopRestEnabled(enabled: boolean): void {
  loopRestEnabled = enabled
}

export function onCursorAdvance(cb: (idx: number) => void): void {
  cursorCallbacks.push(cb)
}

function scheduleEvents(): void {
  Tone.getTransport().cancel()
  const bpm = writtenBpm * tempoRatio
  Tone.getTransport().bpm.value = bpm
  const secPerBeat = 60 / bpm * 4  // OSMD RealValue fractions are in whole-note units

  let prevMeasure = -1
  for (const ev of timeline) {
    const offsetSec = (ev.fractionStart - timelineOffset) * secPerBeat
    Tone.getTransport().schedule((time) => {
      if (ev.measureIndex !== prevMeasure) {
        if (DEBUG) console.log('[score] measure', ev.measureIndex, 'START at audioTime', time)
        prevMeasure = ev.measureIndex
      }
      const notesToPlay = selectVoiceNotes(ev.midiNotes)
      if (notesToPlay.length > 0 && sampler) {
        for (const midi of notesToPlay) {
          const noteIdx = ev.midiNotes.indexOf(midi)
          const noteDur = noteIdx >= 0 ? ev.noteDurations[noteIdx] : ev.durationFraction
          const durSec = Math.max(0.05, noteDur * secPerBeat - 0.02)
          const freq = Tone.Frequency(midi, 'midi').toFrequency()
          if (DEBUG) console.log('[score] note midi', midi, 'dur', durSec.toFixed(2), 's at audioTime', time.toFixed(3))
          try { sampler.triggerAttackRelease(freq, durSec, time) }
          catch (e) { console.warn('triggerAttackRelease failed for midi', midi, e) }
        }
      }
      Tone.getDraw().schedule(() => {
        cursorCallbacks.forEach(cb => cb(ev.cursorIndex))
      }, time)
    }, offsetSec)
  }

  const transport = Tone.getTransport()
  if (loopEnabled && timeline.length > 0) {
    const last = timeline[timeline.length - 1]
    const lastNoteEndSec = (last.fractionStart - timelineOffset + last.durationFraction) * secPerBeat
    const restSec = loopRestEnabled ? beatsPerBar * secPerBeat / beatDenominator : 0
    transport.loop = true
    transport.loopStart = 0
    transport.loopEnd = Math.max(lastNoteEndSec + restSec, 0.1)
  } else {
    transport.loop = false
  }

  // Schedule metronome clicks as individual transport events (same mechanism as notes)
  if (DEBUG) console.log('[metro] isMetronomeEnabled:', isMetronomeEnabled(), 'timeline.length:', timeline.length)
  if (isMetronomeEnabled() && timeline.length > 0) {
    const last = timeline[timeline.length - 1]
    const endSec = (last.fractionStart - timelineOffset + last.durationFraction) * secPerBeat
    const loopEndSec = transport.loop ? (transport.loopEnd as number) : endSec
    const clickIntervalSec = secPerBeat / beatDenominator
    if (DEBUG) console.log('[metro] secPerBeat:', secPerBeat, 'beatDenominator:', beatDenominator, 'clickIntervalSec:', clickIntervalSec, 'endSec:', endSec, 'beatsPerBar:', beatsPerBar)
    let clickCount = 0
    for (let beatIdx = 0; beatIdx * clickIntervalSec < loopEndSec - 0.001; beatIdx++) {
      const t = beatIdx * clickIntervalSec
      const isAccent = beatIdx % beatsPerBar === 0
      clickCount++
      Tone.getTransport().schedule((time) => {
        if (DEBUG) console.log('[metro] click fired beatIdx:', beatIdx, 'isAccent:', isAccent, 'audioTime:', time)
        scheduleClick(time, isAccent)
      }, t)
    }
    if (DEBUG) console.log('[metro] scheduled', clickCount, 'clicks')
  }
}

export async function play(): Promise<void> {
  await Tone.start()
  await Tone.loaded()   // wait for all buffers regardless of onload callback
  if (Tone.getTransport().state === 'paused') {
    Tone.getTransport().start()
    return
  }
  scheduleEvents()
  Tone.getTransport().start('+0', seekOffsetSec ?? undefined)
  seekOffsetSec = null
}

export function reschedule(): void {
  const state = Tone.getTransport().state
  if (state === 'started') {
    const pos = Tone.getTransport().position
    Tone.getTransport().cancel()
    scheduleEvents()
    Tone.getTransport().start('+0', pos as any)
  } else if (state === 'paused') {
    // Cancel and reschedule without touching transport state — position is preserved
    // while paused and events fire correctly from that position on resume.
    Tone.getTransport().cancel()
    Tone.getTransport().bpm.value = writtenBpm * tempoRatio
    scheduleEvents()
  }
}

export function pause(): void {
  Tone.getTransport().pause()
}

export function stop(): void {
  Tone.getTransport().stop()
  Tone.getTransport().cancel()
  Tone.getTransport().position = 0 as any
  seekOffsetSec = null
}

export function setTempoRatio(ratio: number): void {
  tempoRatio = ratio
  const wasRunning = Tone.getTransport().state === 'started'
  if (wasRunning) {
    const pos = Tone.getTransport().position
    Tone.getTransport().cancel()
    scheduleEvents()
    Tone.getTransport().start('+0', pos as any)
  } else {
    Tone.getTransport().bpm.value = writtenBpm * tempoRatio
  }
}

export function getWrittenBpm(): number { return writtenBpm }
export function getTempoRatio(): number { return tempoRatio }
export function getTransportState(): string { return Tone.getTransport().state }
export function getTimeline(): NoteEvent[] { return timeline }

export function seekToEvent(evIdx: number): void {
  if (evIdx < 0 || evIdx >= timeline.length) return
  const bpm = writtenBpm * tempoRatio
  const secPerBeat = 60 / bpm * 4  // OSMD RealValue fractions are in whole-note units
  seekOffsetSec = (timeline[evIdx].fractionStart - timelineOffset) * secPerBeat
  const wasRunning = Tone.getTransport().state === 'started'
  if (wasRunning) {
    Tone.getTransport().cancel()
    scheduleEvents()
    Tone.getTransport().start('+0', seekOffsetSec)
  }
}

// 0–100 linear → dB
export function setMusicVolume(v: number): void {
  userVolumeDb = v === 0 ? -Infinity : 20 * Math.log10(v / 100)
  if (!sampler || musicMuted) return
  sampler.volume.value = userVolumeDb
}

export function setMusicMuted(muted: boolean): void {
  musicMuted = muted
  if (!sampler) return
  sampler.volume.value = muted ? -Infinity : userVolumeDb
}
