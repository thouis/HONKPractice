import type { PositionEntry } from '../types'

// Standard Bb tenor trombone, concert pitch
// MIDI note numbers: Bb1=34 through F5=77
// partial 1=pedal, 2=Bb2 fundamental series, 3=F3, 4=Bb3, 5=D4-F4, 6=Bb4, 7=D5-F5

export const TROMBONE_POSITIONS: Record<number, PositionEntry[]> = {
  // --- Pedal tones (partial 1) ---
  34: [{ pos: 1, partial: 1, preferred: true }],   // Bb1
  35: [{ pos: 2, partial: 1, preferred: true }],   // B1
  36: [{ pos: 3, partial: 1, preferred: true }],   // C2
  37: [{ pos: 4, partial: 1, preferred: true }],   // Db2
  38: [{ pos: 5, partial: 1, preferred: true }],   // D2
  39: [{ pos: 6, partial: 1, preferred: true }],   // Eb2
  40: [{ pos: 7, partial: 1, preferred: true }],   // E2

  // --- 2nd partial (Bb2 at pos1) ---
  46: [{ pos: 1, partial: 2, preferred: true }],   // Bb2
  47: [{ pos: 2, partial: 2, preferred: true }],   // B2
  48: [{ pos: 3, partial: 2, preferred: true }],   // C3
  49: [{ pos: 4, partial: 2, preferred: true }],   // Db3
  50: [{ pos: 5, partial: 2, preferred: true }],   // D3
  51: [{ pos: 6, partial: 2, preferred: true }],   // Eb3
  52: [{ pos: 7, partial: 2, preferred: true }],   // E3

  // --- 3rd partial (F3 at pos1) ---
  53: [{ pos: 1, partial: 3, preferred: true }],   // F3
  54: [{ pos: 2, partial: 3, preferred: true }],   // Gb3
  55: [{ pos: 3, partial: 3, preferred: true }],   // G3
  56: [{ pos: 4, partial: 3, preferred: true }],   // Ab3
  57: [                                             // A3
    { pos: 5, partial: 3, preferred: true  },
    { pos: 1, partial: 4, preferred: false },
  ],

  // --- 4th partial (Bb3 at pos1) — merged with 3rd partial alts ---
  58: [                                             // Bb3
    { pos: 1, partial: 4, preferred: true  },
    { pos: 6, partial: 3, preferred: false },
  ],
  59: [                                             // B3
    { pos: 2, partial: 4, preferred: true  },
    { pos: 7, partial: 3, preferred: false },
  ],
  60: [{ pos: 3, partial: 4, preferred: true }],   // C4
  61: [{ pos: 4, partial: 4, preferred: true }],   // Db4
  62: [                                             // D4
    { pos: 5, partial: 4, preferred: true  },
    { pos: 1, partial: 5, preferred: false },
  ],

  // --- 5th partial (D4-F4 area) — Eb4 merges 4th and 5th partial alts ---
  63: [                                             // Eb4
    { pos: 6, partial: 4, preferred: true  },
    { pos: 4, partial: 5, preferred: false },
  ],
  64: [                                             // E4
    { pos: 2, partial: 5, preferred: true  },
    { pos: 7, partial: 4, preferred: false },
  ],
  65: [                                             // F4
    { pos: 1, partial: 5, preferred: true  },
    { pos: 6, partial: 4, preferred: false },
  ],
  66: [                                             // Gb4 — tends sharp everywhere
    { pos: 7, partial: 5, preferred: false },
    { pos: 2, partial: 5, preferred: false },
  ],
  67: [{ pos: 3, partial: 5, preferred: true }],   // G4
  68: [{ pos: 4, partial: 5, preferred: true }],   // Ab4
  69: [{ pos: 5, partial: 5, preferred: true }],   // A4

  // --- 6th partial (Bb4 at pos1) ---
  70: [                                             // Bb4
    { pos: 1, partial: 6, preferred: true  },
    { pos: 6, partial: 5, preferred: false },
  ],
  71: [                                             // B4
    { pos: 2, partial: 6, preferred: true  },
    { pos: 7, partial: 5, preferred: false },
  ],
  72: [{ pos: 3, partial: 6, preferred: true }],   // C5
  73: [{ pos: 4, partial: 6, preferred: true }],   // Db5
  74: [                                             // D5
    { pos: 5, partial: 6, preferred: true  },
    { pos: 1, partial: 7, preferred: false },
  ],
  75: [{ pos: 6, partial: 6, preferred: true }],   // Eb5

  // --- 7th partial ---
  76: [                                             // E5
    { pos: 2, partial: 7, preferred: true  },
    { pos: 7, partial: 6, preferred: false },
  ],
  77: [{ pos: 1, partial: 7, preferred: true }],   // F5
}

// Sentinel for rests in the DP (pos=0 means "no movement")
export const REST_POSITIONS: PositionEntry[] = [{ pos: 0, partial: 0, preferred: true }]
