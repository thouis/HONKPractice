import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startPracticeMode, stopPracticeMode, setPracticeExpectedPitch } from '../modules/practiceMode'

// Bug 5 fix: practiceMode.ts had `const DEBUG = true`, meaning debugLog was
// called unconditionally at ~60 fps during pitch detection.  After the fix,
// `DEBUG = () => isDebugVisible()` gates every log call on the panel being open.

const { mockDebugLog, mockIsDebugVisible, pitchStore } = vi.hoisted(() => ({
  mockDebugLog:       vi.fn(),
  mockIsDebugVisible: vi.fn(),
  pitchStore:         { cb: null as ((hz: number, clarity: number) => void) | null },
}))

vi.mock('../modules/debugPanel', () => ({
  debugLog:       mockDebugLog,
  isDebugVisible: mockIsDebugVisible,
}))

vi.mock('../modules/pitchDetector', () => ({
  CLARITY_THRESHOLD: 0.9,
  onPitchDetected: vi.fn((cb: (hz: number, clarity: number) => void) => {
    pitchStore.cb = cb
    return () => { pitchStore.cb = null }
  }),
}))

// Drive the state machine from need_gap → ready → holding by simulating
// silence long enough to satisfy MIN_GAP_MS (150ms), then an in-range pitch.
function driveToHolding(expectedHz: number) {
  const nowMock = vi.spyOn(performance, 'now')
  nowMock.mockReturnValue(1000)
  pitchStore.cb?.(0, 0)          // silence at t=1000 → gapStartMs = 1000
  nowMock.mockReturnValue(1200)  // 200ms later ≥ MIN_GAP_MS (150ms)
  pitchStore.cb?.(0, 0)          // silence → state = 'ready'
  pitchStore.cb?.(expectedHz, 0.95)  // in-range pitch → state = 'holding'
  nowMock.mockRestore()
}

beforeEach(() => {
  mockDebugLog.mockClear()
  mockIsDebugVisible.mockClear()
  pitchStore.cb = null
  stopPracticeMode()
})

afterEach(() => {
  stopPracticeMode()
})

describe('practiceMode – DEBUG guard (Bug 5 fix)', () => {
  it('does not call debugLog on startPracticeMode when panel is closed', () => {
    mockIsDebugVisible.mockReturnValue(false)

    startPracticeMode(() => {}, 20)

    expect(mockDebugLog).not.toHaveBeenCalled()
  })

  it('calls debugLog on startPracticeMode when panel is open', () => {
    mockIsDebugVisible.mockReturnValue(true)

    startPracticeMode(() => {}, 20)

    expect(mockDebugLog).toHaveBeenCalled()
  })

  it('does not call debugLog during pitch transitions when panel is closed', () => {
    mockIsDebugVisible.mockReturnValue(false)
    startPracticeMode(() => {}, 20)
    setPracticeExpectedPitch(440, 200)
    mockDebugLog.mockClear()

    driveToHolding(440)

    expect(mockDebugLog).not.toHaveBeenCalled()
  })

  it('calls debugLog during pitch transitions when panel is open', () => {
    mockIsDebugVisible.mockReturnValue(true)
    startPracticeMode(() => {}, 20)
    setPracticeExpectedPitch(440, 200)
    mockDebugLog.mockClear()

    driveToHolding(440)

    expect(mockDebugLog).toHaveBeenCalled()
  })

  it('does not call debugLog when pitch is out of range and panel is closed', () => {
    mockIsDebugVisible.mockReturnValue(false)
    startPracticeMode(() => {}, 20)   // thresholdCents = 20
    setPracticeExpectedPitch(440, 200)

    // Drive to ready, then send out-of-range pitch
    const nowMock = vi.spyOn(performance, 'now')
    nowMock.mockReturnValue(1000)
    pitchStore.cb?.(0, 0)
    nowMock.mockReturnValue(1200)
    pitchStore.cb?.(0, 0)         // → ready
    mockDebugLog.mockClear()
    pitchStore.cb?.(500, 0.95)    // out of range (500Hz vs 440Hz ≈ 218¢)
    nowMock.mockRestore()

    expect(mockDebugLog).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Timing boundary tests
// ---------------------------------------------------------------------------

describe('practiceMode – MIN_GAP_MS boundary (150ms)', () => {
  beforeEach(() => {
    mockIsDebugVisible.mockReturnValue(false)
  })

  it('does NOT transition need_gap → ready after only 149ms silence', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    setPracticeExpectedPitch(440, 100)

    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    pitchStore.cb?.(0, 0)       // silence → gapStartMs = 1000
    now.mockReturnValue(1149)   // 149ms later: gap NOT satisfied
    pitchStore.cb?.(0, 0)       // still need_gap
    // Still in need_gap: an in-range pitch must not start hold
    now.mockReturnValue(1250)
    pitchStore.cb?.(440, 0.95)  // would start hold if in ready; should not if in need_gap
    now.mockReturnValue(1350)   // another 100ms (> holdMs=50)
    pitchStore.cb?.(440, 0.95)
    now.mockRestore()

    expect(advance).not.toHaveBeenCalled()
  })

  it('transitions need_gap → ready after exactly 150ms silence, then allows hold', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    // holdMs clamps to min 100; use 100 explicitly
    setPracticeExpectedPitch(440, 100)

    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    pitchStore.cb?.(0, 0)       // silence → gapStartMs = 1000
    now.mockReturnValue(1150)   // exactly 150ms: gap satisfied
    pitchStore.cb?.(0, 0)       // → ready
    now.mockReturnValue(2000)
    pitchStore.cb?.(440, 0.95)  // → holding, holdStartMs = 2000
    now.mockReturnValue(2101)   // 101ms ≥ holdMs (100ms) → advance
    pitchStore.cb?.(440, 0.95)
    now.mockRestore()

    expect(advance).toHaveBeenCalledTimes(1)
  })
})

describe('practiceMode – hold-duration boundary', () => {
  beforeEach(() => {
    mockIsDebugVisible.mockReturnValue(false)
  })

  it('does NOT advance when pitch held for holdMs - 1 ms', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    setPracticeExpectedPitch(440, 100)  // holdMs = 100

    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000); pitchStore.cb?.(0, 0)    // silence
    now.mockReturnValue(1200); pitchStore.cb?.(0, 0)    // → ready (200ms gap)
    now.mockReturnValue(2000); pitchStore.cb?.(440, 0.95)  // → holding, holdStartMs=2000
    now.mockReturnValue(2099); pitchStore.cb?.(440, 0.95)  // 99ms: NOT yet
    now.mockRestore()

    expect(advance).not.toHaveBeenCalled()
  })

  it('advances when pitch held for exactly holdMs', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    setPracticeExpectedPitch(440, 100)  // holdMs = 100

    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000); pitchStore.cb?.(0, 0)    // silence
    now.mockReturnValue(1200); pitchStore.cb?.(0, 0)    // → ready
    now.mockReturnValue(2000); pitchStore.cb?.(440, 0.95)  // → holding
    now.mockReturnValue(2100); pitchStore.cb?.(440, 0.95)  // 100ms: advance
    now.mockRestore()

    expect(advance).toHaveBeenCalledTimes(1)
  })
})

describe('practiceMode – out-of-range reverts to ready', () => {
  beforeEach(() => {
    mockIsDebugVisible.mockReturnValue(false)
  })

  it('returns to ready (not need_gap) after pitch goes out of range during hold', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    setPracticeExpectedPitch(440, 200)

    const now = vi.spyOn(performance, 'now')
    // Drive to holding
    now.mockReturnValue(1000); pitchStore.cb?.(0, 0)
    now.mockReturnValue(1200); pitchStore.cb?.(0, 0)       // → ready
    now.mockReturnValue(1300); pitchStore.cb?.(440, 0.95)  // → holding
    // Go out of range → should revert to ready, not need_gap
    now.mockReturnValue(1400); pitchStore.cb?.(500, 0.95)  // out of range → ready
    // Immediately re-enter in-range (no gap needed since we're in ready, not need_gap)
    now.mockReturnValue(1450); pitchStore.cb?.(440, 0.95)  // → holding again
    now.mockReturnValue(1660); pitchStore.cb?.(440, 0.95)  // 210ms ≥ holdMs (200ms) → advance
    now.mockRestore()

    expect(advance).toHaveBeenCalledTimes(1)
  })
})

describe('practiceMode – advance fires exactly once per note', () => {
  beforeEach(() => {
    mockIsDebugVisible.mockReturnValue(false)
  })

  it('fires advance callback exactly once even if multiple frames arrive at the hold threshold', () => {
    const advance = vi.fn()
    startPracticeMode(advance, 20)
    setPracticeExpectedPitch(440, 100)

    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000); pitchStore.cb?.(0, 0)
    now.mockReturnValue(1200); pitchStore.cb?.(0, 0)       // → ready
    now.mockReturnValue(2000); pitchStore.cb?.(440, 0.95)  // → holding
    now.mockReturnValue(2100); pitchStore.cb?.(440, 0.95)  // advance fires, state → need_gap
    now.mockReturnValue(2100); pitchStore.cb?.(440, 0.95)  // second frame at same time
    now.mockReturnValue(2101); pitchStore.cb?.(440, 0.95)  // third frame
    now.mockRestore()

    expect(advance).toHaveBeenCalledTimes(1)
  })
})
