import { describe, it, expect } from 'vitest'
import { runDP } from '../modules/positionAdvisor'
import { tromboneDef } from '../data/instruments/trombone'

// Bug 2: runDP crashes with "Reduce of empty array with no initial value"
// when a MIDI note has no entry in the instrument's fingerings.

describe('runDP', () => {
  it('returns empty array for empty input', () => {
    expect(runDP([], tromboneDef)).toEqual([])
  })

  it('does not throw for a single in-range note', () => {
    // MIDI 53 = F3, a valid trombone note
    expect(() => runDP([[53]], tromboneDef)).not.toThrow()
  })

  it('does not throw for a MIDI note below trombone range', () => {
    // MIDI 20 has no entry in the trombone fingerings
    expect(() => runDP([[20]], tromboneDef)).not.toThrow()
  })

  it('does not throw for a MIDI note above trombone range', () => {
    // MIDI 100 has no entry in the trombone fingerings
    expect(() => runDP([[100]], tromboneDef)).not.toThrow()
  })

  it('does not throw for a sequence ending on an out-of-range note', () => {
    // F3 (valid) followed by MIDI 100 (out of range) — the crash is on the last note
    expect(() => runDP([[53], [100]], tromboneDef)).not.toThrow()
  })

  it('does not throw for a sequence starting on an out-of-range note', () => {
    expect(() => runDP([[100], [53]], tromboneDef)).not.toThrow()
  })
})
