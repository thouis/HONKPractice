import { describe, it, expect, vi, beforeEach } from 'vitest'
import { practiceAdvanceStep, isTieContinuation, type PracticeAdvanceState } from '../modules/practiceAdvance'

// Bug 3: practiceAdvanceStep called debugLog unconditionally — the .map() string
// building ran on every cursor step even with the debug panel closed.
// After the fix, the debugLog call (and its argument expressions) are guarded
// by isDebugVisible().

const { mockDebugLog, mockIsDebugVisible } = vi.hoisted(() => ({
  mockDebugLog:       vi.fn(),
  mockIsDebugVisible: vi.fn(),
}))

vi.mock('../modules/debugPanel', () => ({
  debugLog:        mockDebugLog,
  isDebugVisible:  mockIsDebugVisible,
}))

// Build a minimal fake OSMD cursor sequence.
// `steps` describes each position: true = has a pitched note, false = rest.
function makeMockOsmd(steps: boolean[]) {
  let pos = 0
  const makeNote = (pitched: boolean) => ({
    isRest:   () => !pitched,
    halfTone: 50,
    NoteTie:  null,
    Length:   { RealValue: 0.25 },
  })
  return {
    cursor: {
      reset:            vi.fn(() => { pos = 0 }),
      next:             vi.fn(() => { pos++ }),
      NotesUnderCursor: vi.fn(() => pos < steps.length ? [makeNote(steps[pos])] : []),
      get iterator() {
        return {
          get EndReached() { return pos >= steps.length },
          CurrentSourceTimestamp:  { RealValue: pos * 0.25 },
          CurrentMeasureIndex: 0,
        }
      },
    },
  } as any
}

function makeDeps(osmd: any, overrides: Partial<ReturnType<typeof makeDefaultDeps>> = {}) {
  return { ...makeDefaultDeps(osmd), ...overrides }
}

function makeDefaultDeps(osmd: any) {
  return {
    getOsmd:              () => osmd,
    advanceCursor:        vi.fn(() => { osmd.cursor.next() }),
    resetCursor:          vi.fn(() => { osmd.cursor.reset() }),
    scrollCursorIntoView: vi.fn(),
    updateExpectedPitch:  vi.fn(),
    showPracticeDone:     vi.fn(),
  }
}

describe('isTieContinuation', () => {
  it('returns false when note has no tie', () => {
    expect(isTieContinuation({ NoteTie: null })).toBe(false)
  })

  it('returns false when note is the start of the tie', () => {
    const n: any = { halfTone: 50, NoteTie: null }
    n.NoteTie = { StartNote: n, Notes: [n] }
    expect(isTieContinuation(n)).toBe(false)
  })

  it('returns true when note is a genuine tie continuation', () => {
    const start: any = { halfTone: 50, NoteTie: null }
    const cont: any  = { halfTone: 50, NoteTie: null }
    cont.NoteTie = { StartNote: start, Notes: [start, cont] }
    expect(isTieContinuation(cont)).toBe(true)
  })
})

describe('practiceAdvanceStep – debug logging guard (Bug 3)', () => {
  beforeEach(() => {
    mockDebugLog.mockClear()
    mockIsDebugVisible.mockClear()
  })

  it('does NOT call debugLog when debug panel is closed', () => {
    mockIsDebugVisible.mockReturnValue(false)

    // Cursor starts at pos 0 (pitched). Advance steps through pos 1 (rest) → pos 2 (pitched).
    const osmd = makeMockOsmd([true, false, true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: false }

    practiceAdvanceStep(state, makeDeps(osmd))

    expect(mockDebugLog).not.toHaveBeenCalled()
  })

  it('DOES call debugLog when debug panel is open', () => {
    mockIsDebugVisible.mockReturnValue(true)

    const osmd = makeMockOsmd([true, false, true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: false }

    practiceAdvanceStep(state, makeDeps(osmd))

    expect(mockDebugLog).toHaveBeenCalled()
  })
})

describe('practiceAdvanceStep – cursor logic', () => {
  beforeEach(() => {
    mockIsDebugVisible.mockReturnValue(false)
    mockDebugLog.mockClear()
  })

  it('advances cursorIdx by 1 when next note is pitched', () => {
    const osmd = makeMockOsmd([true, true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: false }

    practiceAdvanceStep(state, makeDeps(osmd))

    expect(state.cursorIdx).toBe(1)
  })

  it('skips over rests and lands on the next pitched note', () => {
    // positions: 0=pitched (current), 1=rest, 2=rest, 3=pitched
    const osmd = makeMockOsmd([true, false, false, true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: false }

    practiceAdvanceStep(state, makeDeps(osmd))

    expect(state.cursorIdx).toBe(3)
  })

  it('resets cursor and cursorIdx when looping and end is reached', () => {
    // Single note — after advancing, pos=1 which is EndReached.
    const osmd = makeMockOsmd([true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: true }

    const deps = makeDeps(osmd)
    practiceAdvanceStep(state, deps)

    expect(deps.resetCursor).toHaveBeenCalled()
    expect(state.cursorIdx).toBe(0)
  })

  it('calls showPracticeDone when end is reached and not looping', () => {
    const osmd = makeMockOsmd([true])
    const state: PracticeAdvanceState = { cursorIdx: 0, loopOn: false }

    const deps = makeDeps(osmd)
    practiceAdvanceStep(state, deps)

    expect(deps.showPracticeDone).toHaveBeenCalled()
  })
})
