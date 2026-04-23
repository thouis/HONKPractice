import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bug 1: play() uses `seekOffsetSec || undefined`, so when seekOffsetSec === 0
// (e.g. after seeking to measure 1), transport.start receives `undefined` instead
// of `0`, causing Tone.js to resume from the paused position rather than from 0.

// --- Tone.js transport mock ---
const transportState = { value: 'stopped' as string }
const mockTransport = {
  bpm: { value: 120 },
  loop: false as boolean,
  loopStart: 0 as number,
  loopEnd: 0 as number,
  position: '0:0:0' as string | number,
  get state() { return transportState.value },
  cancel: vi.fn(),
  schedule: vi.fn(),
  start: vi.fn((_time: string, _offset?: number) => { transportState.value = 'started' }),
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
  isEnabled:     vi.fn().mockReturnValue(false),
  scheduleClick: vi.fn(),
}))

// Minimal OSMD mock: one cursor step with no notes, timestamp 0.
function makeMockOsmd() {
  let step = 0
  return {
    cursor: {
      reset:             vi.fn(() => { step = 0 }),
      next:              vi.fn(() => { step++ }),
      NotesUnderCursor:  vi.fn().mockReturnValue([]),
      get iterator() {
        return {
          get EndReached()          { return step >= 1 },
          CurrentSourceTimestamp:   { RealValue: 0 },
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

// Shared beforeEach helper — resets all transport mock state.
function resetTransport() {
  mockTransport.cancel.mockClear()
  mockTransport.start.mockClear()
  mockTransport.stop.mockClear()
  mockTransport.pause.mockClear()
  mockTransport.schedule.mockClear()
  transportState.value = 'stopped'
  mockTransport.position = 0
}

describe('play() seek-to-zero bug', () => {
  beforeEach(resetTransport)

  it('passes 0 (not undefined) to transport.start when seeked to the first event', async () => {
    const { buildTimeline, seekToEvent, play, stop } = await import('../modules/playback')

    stop()                        // ensure seekOffsetSec = 0 and transport stopped
    buildTimeline(makeMockOsmd()) // timeline[0].fractionStart === timelineOffset → offset = 0
    seekToEvent(0)                // sets seekOffsetSec = (0 - 0) * secPerBeat = 0

    await play()

    // transport.start must be called with the numeric 0, not undefined.
    // With the bug: called as ('+0', undefined).
    // After fix:   called as ('+0', 0).
    const [time, offset] = mockTransport.start.mock.calls[0]
    expect(time).toBe('+0')
    expect(offset).toBe(0)
    expect(offset).not.toBeUndefined()
  })

  it('passes the correct non-zero offset when seeked to a later event', async () => {
    const { buildTimeline, seekToEvent, play, stop } = await import('../modules/playback')

    // Two-step OSMD: step 0 at t=0, step 1 at t=0.25 (a quarter note into the score)
    let step2 = 0
    const osmd2 = {
      cursor: {
        reset:            vi.fn(() => { step2 = 0 }),
        next:             vi.fn(() => { step2++ }),
        NotesUnderCursor: vi.fn().mockReturnValue([]),
        get iterator() {
          return {
            get EndReached()        { return step2 >= 2 },
            CurrentSourceTimestamp: { RealValue: step2 * 0.25 },
            CurrentMeasureIndex:    0,
          }
        },
      },
      Sheet: {
        SheetPlaybackSetting: { BeatsPerMinute: 120 },
        SourceMeasures: [{ ActiveTimeSignature: { Numerator: 4, Denominator: 4 } }],
      },
    } as any

    stop()
    buildTimeline(osmd2)
    seekToEvent(1)   // fractionStart=0.25, timelineOffset=0 → seekOffsetSec = 0.25 * (60/120*4) = 0.5s

    await play()

    const [time, offset] = mockTransport.start.mock.calls[0]
    expect(time).toBe('+0')
    expect(typeof offset).toBe('number')
    expect(offset).toBeGreaterThan(0)
  })
})

describe('setTempoRatio() position preservation (Bug 1 fix)', () => {
  beforeEach(resetTransport)

  it('does not call stop() when changing tempo while playing', async () => {
    const { setTempoRatio } = await import('../modules/playback')
    transportState.value = 'started'
    mockTransport.position = '0:2:0'

    setTempoRatio(0.75)

    expect(mockTransport.stop).not.toHaveBeenCalled()
  })

  it('cancels and restarts at the captured position when changing tempo while playing', async () => {
    const { setTempoRatio } = await import('../modules/playback')
    transportState.value = 'started'
    mockTransport.position = '0:2:0'

    setTempoRatio(0.75)

    expect(mockTransport.cancel).toHaveBeenCalled()
    expect(mockTransport.start).toHaveBeenCalledWith('+0', '0:2:0')
  })

  it('only updates bpm (no restart) when transport is stopped', async () => {
    const { setTempoRatio } = await import('../modules/playback')
    transportState.value = 'stopped'

    setTempoRatio(0.5)

    expect(mockTransport.start).not.toHaveBeenCalled()
    expect(mockTransport.stop).not.toHaveBeenCalled()
  })
})

describe('reschedule() when paused', () => {
  beforeEach(resetTransport)

  it('cancels and reschedules without touching transport state', async () => {
    const { reschedule } = await import('../modules/playback')
    transportState.value = 'paused'
    mockTransport.position = '0:1:0'

    reschedule()

    expect(mockTransport.cancel).toHaveBeenCalled()
    expect(mockTransport.start).not.toHaveBeenCalled()
    expect(mockTransport.pause).not.toHaveBeenCalled()
  })

  it('does nothing when transport is stopped', async () => {
    const { reschedule } = await import('../modules/playback')
    transportState.value = 'stopped'

    reschedule()

    expect(mockTransport.cancel).not.toHaveBeenCalled()
    expect(mockTransport.start).not.toHaveBeenCalled()
  })
})
