import type { PositionEntry } from '../types'

// Bb tenor trombone positions (concert pitch)
// KEY INVARIANT: For each position N (1-7), pitch increases monotonically as partials increase.
// Partial 6 has no note at position 1; it starts at position 2 (G4, a shortened position).
//
// Partial 1: Bb2 (pos 1) → E2  (pos 7)
// Partial 2: F3  (pos 1) → B2  (pos 7)
// Partial 3: Bb3 (pos 1) → E3  (pos 7)
// Partial 4: D4  (pos 1) → Ab3 (pos 7)
// Partial 5: F4  (pos 1) → B3  (pos 7)
// Partial 6: --- (pos 1),  G4  (pos 2) → D4 (pos 7)
// Partial 7: Bb4 (pos 1) → E4  (pos 7)

export const TROMBONE_POSITIONS: Record<number, PositionEntry[]> = {
  // ── Partial 1 ── (Bb2 → E2)
  46: [{ pos: 1, partial: 1, preferred: true }],   // Bb2
  45: [{ pos: 2, partial: 1, preferred: true }],   // A2
  44: [{ pos: 3, partial: 1, preferred: true }],   // Ab2
  43: [{ pos: 4, partial: 1, preferred: true }],   // G2
  42: [{ pos: 5, partial: 1, preferred: true }],   // Gb2
  41: [{ pos: 6, partial: 1, preferred: true }],   // F2
  40: [{ pos: 7, partial: 1, preferred: true }],   // E2

  // ── Partial 2 ── (F3 → B2)
  53: [
    { pos: 1, partial: 2, preferred: true },
    { pos: 6, partial: 3, preferred: false },   // F3 in partial 3 (alternate)
  ],   // F3
  52: [
    { pos: 2, partial: 2, preferred: true },
    { pos: 7, partial: 3, preferred: false },   // E3 in partial 3 (alternate)
  ],   // E3
  51: [{ pos: 3, partial: 2, preferred: true }],   // Eb3
  50: [{ pos: 4, partial: 2, preferred: true }],   // D3
  49: [{ pos: 5, partial: 2, preferred: true }],   // Db3
  48: [{ pos: 6, partial: 2, preferred: true }],   // C3
  47: [{ pos: 7, partial: 2, preferred: true }],   // B2

  // ── Partial 3 ── (Bb3 → E3)
  58: [
    { pos: 1, partial: 3, preferred: true },
    { pos: 5, partial: 4, preferred: false },   // Bb3 in partial 4 (alternate)
  ],   // Bb3
  57: [
    { pos: 2, partial: 3, preferred: true },
    { pos: 6, partial: 4, preferred: false },   // A3 in partial 4 (alternate)
  ],   // A3
  56: [
    { pos: 3, partial: 3, preferred: true },
    { pos: 7, partial: 4, preferred: false },   // Ab3 in partial 4 (alternate)
  ],   // Ab3
  55: [{ pos: 4, partial: 3, preferred: true }],   // G3
  54: [{ pos: 5, partial: 3, preferred: true }],   // Gb3

  // ── Partial 4 ── (D4 → Ab3)
  62: [
    { pos: 1, partial: 4, preferred: true },
    { pos: 4, partial: 5, preferred: false },   // D4 in partial 5 (alternate)
    { pos: 7, partial: 6, preferred: true  },   // D4 in partial 6
  ],   // D4
  61: [
    { pos: 2, partial: 4, preferred: true },
    { pos: 5, partial: 5, preferred: false },   // Db4 in partial 5 (alternate)
  ],   // Db4
  60: [
    { pos: 3, partial: 4, preferred: true },
    { pos: 6, partial: 5, preferred: false },   // C4 in partial 5 (alternate)
  ],   // C4
  59: [
    { pos: 4, partial: 4, preferred: true },
    { pos: 7, partial: 5, preferred: false },   // B3 in partial 5 (alternate)
  ],   // B3

  // ── Partial 5 ── (F4 → B3)
  65: [
    { pos: 1, partial: 5, preferred: true },
    { pos: 4, partial: 6, preferred: true  },   // F4 in partial 6
    { pos: 6, partial: 7, preferred: false },   // F4 in partial 7 (alternate)
  ],   // F4
  64: [
    { pos: 2, partial: 5, preferred: true },
    { pos: 5, partial: 6, preferred: true  },   // E4 in partial 6
    { pos: 7, partial: 7, preferred: false },   // E4 in partial 7 (alternate)
  ],   // E4
  63: [
    { pos: 3, partial: 5, preferred: true },
    { pos: 6, partial: 6, preferred: true  },   // Eb4 in partial 6
  ],   // Eb4

  // ── Partial 6 ── (G4 pos 2 → D4 pos 7; no pos 1)
  67: [
    { pos: 2, partial: 6, preferred: true },
    { pos: 4, partial: 7, preferred: true },
  ],   // G4
  66: [
    { pos: 3, partial: 6, preferred: true },
    { pos: 5, partial: 7, preferred: true },
  ],   // Gb4

  // ── Partial 7 ── (Bb4 → E4)
  70: [{ pos: 1, partial: 7, preferred: true }],   // Bb4
  69: [{ pos: 2, partial: 7, preferred: true }],   // A4
  68: [{ pos: 3, partial: 7, preferred: true }],   // Ab4
}

// Sentinel for rests
export const REST_POSITIONS: PositionEntry[] = [{ pos: 0, partial: 0, preferred: true }]
