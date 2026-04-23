import { describe, it, expect, vi, beforeEach } from 'vitest'

// The click scheduling loop in playback.ts:
//   while (beatIdx * clickIntervalSec < loopEndSec - 0.001)
//
// loopEndSec = transport.loopEnd when loop is enabled.
// transport.loopEnd = lastNoteEndSec + restSec, where
//   restSec = beatsPerBar * secPerBeat / beatDenominator  (one bar of silence).
//
// So clicks must be verified to fire THROUGH the rest measure, not just up to
// the last note.

const { mockScheduleClick, mockIsEnabled } = vi.hoisted(() => ({
  mockScheduleClick: vi.fn(),
  mockIsEnabled: vi.fn().mockReturnValue(true),
}))

const transportState = { value: 'stopped' as string }
const mockTransport = {
  bpm: { value: 120 },
  loop: false as boolean,
  loopStart: 0 as number,
  loopEnd: 0 as number,
  position: '0:0:0' as string | number,
  get state() { return transportState.value },
  cancel: vi.fn(),
  // Execute schedule callbacks immediately so scheduleClick calls are captured.
  schedule: vi.fn((cb: (t: number) => void) => cb(0)),
  start: vi.fn(() => { transportState.value = 'started' }),
  stop: vi.fn(() => { transportState.value = 'stopped'; mockTransport.position = 0 }),
  pause: vi.fn(() => { transportState.value = 'paused' }),
}

vi.mock('tone', () => ({
  start:  vi.fn().mockResolvedValue(undefined),
  loaded: vi.fn().mockResolvedValue(undefined),
  Sampler: vi.fn().mockImplementation(() => ({
    toDestination: vi.fn().mockReturnThis(),
    volume: { value: 0 },
  })),
  Frequency: vi.fn().mockReturnValue({ toFrequency: vi.fn().mockReturnValue(440) }),
  getTransport: vi.fn().mockReturnValue(mockTransport),
  getDraw: vi.fn().mockReturnValue({ schedule: vi.fn() }),
}))

vi.mock('../modules/metronome', () => ({
  isEnabled:     mockIsEnabled,
  scheduleClick: mockScheduleClick,
}))

// 4/4 at 120 BPM: four quarter notes at t = 0, 0.25, 0.5, 0.75 (whole-note fractions).
function makeFourBeatOsmd() {
  let step = 0
  const makeNote = () => ({
    isRest: () => false,
    NoteTie: null,
    halfTone: 40,
    Length: { RealValue: 0.25 },
  })
  return {
    cursor: {
      reset: vi.fn(() => { step = 0 }),
      next:  vi.fn(() => { step++ }),
      NotesUnderCursor: vi.fn(() => [makeNote()]),
      get iterator() {
        return {
          get EndReached()          { return step >= 4 },
          CurrentSourceTimestamp:   { RealValue: step * 0.25 },
          CurrentMeasureIndex:      0,
        }
      },
    },
    Sheet: {
      SheetPlaybackSetting: { BeatsPerMinute: 120 },
      SourceMeasures: [{ ActiveTimeSignature: { Numerator: 4, Denominator: 4 } }],
    },
  } as any
}

beforeEach(() => {
  mockScheduleClick.mockClear()
  mockTransport.cancel.mockClear()
  mockTransport.start.mockClear()
  mockTransport.schedule.mockClear()
  mockTransport.schedule.mockImplementation((cb: (t: number) => void) => cb(0))
  mockTransport.loop = false
  mockTransport.loopEnd = 0
  transportState.value = 'stopped'
  mockTransport.position = 0
  mockIsEnabled.mockReturnValue(true)
})

describe('metronome click count – 4/4 one measure', () => {
  it('fires 4 clicks (one per beat) when loop is disabled', async () => {
    const { buildTimeline, setLoopEnabled, setLoopRestEnabled, stop, play } =
      await import('../modules/playback')

    stop()
    buildTimeline(makeFourBeatOsmd())
    setLoopEnabled(false)
    setLoopRestEnabled(false)

    await play()

    // 4 quarter-note beats, no rest measure.
    expect(mockScheduleClick).toHaveBeenCalledTimes(4)
  })

  it('fires 8 clicks (4 notes + 4 rest) when loopRestEnabled=true', async () => {
    const { buildTimeline, setLoopEnabled, setLoopRestEnabled, stop, play } =
      await import('../modules/playback')

    stop()
    buildTimeline(makeFourBeatOsmd())
    setLoopEnabled(true)
    setLoopRestEnabled(true)

    await play()

    // loopEnd = lastNoteEnd (2s) + restMeasure (2s) = 4s.
    // clickInterval = 0.5s → beatIdx 0–7 all satisfy 0.5*i < 3.999 → 8 clicks.
    expect(mockScheduleClick).toHaveBeenCalledTimes(8)
  })

  it('fires 4 clicks (no rest) when loopEnabled=true but loopRestEnabled=false', async () => {
    const { buildTimeline, setLoopEnabled, setLoopRestEnabled, stop, play } =
      await import('../modules/playback')

    stop()
    buildTimeline(makeFourBeatOsmd())
    setLoopEnabled(true)
    setLoopRestEnabled(false)

    await play()

    // loopEnd = lastNoteEnd (2s) + 0 = 2s → 4 clicks.
    expect(mockScheduleClick).toHaveBeenCalledTimes(4)
  })

  it('fires no clicks when metronome is disabled', async () => {
    mockIsEnabled.mockReturnValue(false)
    const { buildTimeline, setLoopEnabled, setLoopRestEnabled, stop, play } =
      await import('../modules/playback')

    stop()
    buildTimeline(makeFourBeatOsmd())
    setLoopEnabled(true)
    setLoopRestEnabled(true)

    await play()

    expect(mockScheduleClick).not.toHaveBeenCalled()
  })

  it('accent pattern: beat 0 is accented, beats 1–3 are not', async () => {
    const { buildTimeline, setLoopEnabled, setLoopRestEnabled, stop, play } =
      await import('../modules/playback')

    stop()
    buildTimeline(makeFourBeatOsmd())
    setLoopEnabled(false)
    setLoopRestEnabled(false)

    await play()

    const calls = mockScheduleClick.mock.calls
    expect(calls).toHaveLength(4)
    // scheduleClick(time, isAccent) — second arg is accent flag
    expect(calls[0][1]).toBe(true)   // beat 0: accented
    expect(calls[1][1]).toBe(false)  // beat 1
    expect(calls[2][1]).toBe(false)  // beat 2
    expect(calls[3][1]).toBe(false)  // beat 3
  })
})
