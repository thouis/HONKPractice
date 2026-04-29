import type { FingeringEntry, InstrumentDef } from '../../types'

// pos encoding (keeps 0 as the rest sentinel, matching trombone convention):
//   0 = rest
//   1 = open    ○○○
//   2 = valve 1 ●○○
//   3 = valve 2 ○●○
//   4 = 1+2     ●●○
//   5 = valve 3 ○○●  (same pitch as 1+2 but slightly sharp — less preferred)
//   6 = 1+3     ●○●
//   7 = 2+3     ○●●
//   8 = 1+2+3   ●●●

// Bitmask for each pos (bit2=valve1, bit1=valve2, bit0=valve3) — used for Hamming distance.
// Distance = number of valve state changes between two fingerings.
const VALVE_BITS = [0, 0, 4, 2, 6, 1, 5, 3, 7]
//                  0  1  2  3  4  5  6  7  8

function popcount(n: number): number {
  n -= (n >> 1) & 0x55555555
  n  = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

// Bb trumpet fingerings — concert pitch MIDI.
// preferred=false marks out-of-tune or high-partial alternates.
const TRUMPET_FINGERINGS: Record<number, FingeringEntry[]> = {
  // ── Partial 2 (E3–Bb3) ──
  52: [{ pos: 8, label: '●●●', partial: 2, preferred: true  }],   // E3
  53: [{ pos: 6, label: '●○●', partial: 2, preferred: true  }],   // F3
  54: [{ pos: 7, label: '○●●', partial: 2, preferred: true  }],   // Gb3
  55: [                                                              // G3
    { pos: 4, label: '●●○', partial: 2, preferred: true  },
    { pos: 5, label: '○○●', partial: 2, preferred: false },   // valve 3 alone (sharp)
  ],
  56: [{ pos: 2, label: '●○○', partial: 2, preferred: true  }],   // Ab3
  57: [{ pos: 3, label: '○●○', partial: 2, preferred: true  }],   // A3
  58: [{ pos: 1, label: '○○○', partial: 2, preferred: true  }],   // Bb3

  // ── Partial 3 (B3–F4) ──
  59: [{ pos: 8, label: '●●●', partial: 3, preferred: true  }],   // B3
  60: [{ pos: 6, label: '●○●', partial: 3, preferred: true  }],   // C4
  61: [{ pos: 7, label: '○●●', partial: 3, preferred: true  }],   // Db4
  62: [                                                              // D4
    { pos: 4, label: '●●○', partial: 3, preferred: true  },
    { pos: 5, label: '○○●', partial: 3, preferred: false },
  ],
  63: [{ pos: 2, label: '●○○', partial: 3, preferred: true  }],   // Eb4
  64: [                                                              // E4
    { pos: 3, label: '○●○', partial: 3, preferred: true  },
    { pos: 8, label: '●●●', partial: 4, preferred: false },
  ],
  65: [                                                              // F4
    { pos: 1, label: '○○○', partial: 3, preferred: true  },
    { pos: 6, label: '●○●', partial: 4, preferred: false },
  ],

  // ── Partial 4 (Gb4–Bb4) ──
  66: [{ pos: 7, label: '○●●', partial: 4, preferred: true  }],   // Gb4
  67: [                                                              // G4
    { pos: 4, label: '●●○', partial: 4, preferred: true  },
    { pos: 5, label: '○○●', partial: 4, preferred: false },
  ],
  68: [                                                              // Ab4
    { pos: 2, label: '●○○', partial: 4, preferred: true  },
    { pos: 8, label: '●●●', partial: 5, preferred: false },
  ],
  69: [                                                              // A4
    { pos: 3, label: '○●○', partial: 4, preferred: true  },
    { pos: 6, label: '●○●', partial: 5, preferred: false },
  ],
  70: [                                                              // Bb4
    { pos: 1, label: '○○○', partial: 4, preferred: true  },
    { pos: 7, label: '○●●', partial: 5, preferred: false },
  ],

  // ── Partial 5 (B4–D5) ──
  71: [                                                              // B4
    { pos: 4, label: '●●○', partial: 5, preferred: true  },
    { pos: 5, label: '○○●', partial: 5, preferred: false },
    { pos: 8, label: '●●●', partial: 6, preferred: false },
  ],
  72: [                                                              // C5
    { pos: 2, label: '●○○', partial: 5, preferred: true  },
    { pos: 6, label: '●○●', partial: 6, preferred: false },
  ],
  73: [                                                              // Db5
    { pos: 3, label: '○●○', partial: 5, preferred: true  },
    { pos: 7, label: '○●●', partial: 6, preferred: false },
  ],
  74: [                                                              // D5
    { pos: 1, label: '○○○', partial: 5, preferred: true  },
    { pos: 4, label: '●●○', partial: 6, preferred: false },
  ],

  // ── Partial 6 (Eb5–F5) ──
  75: [                                                              // Eb5
    { pos: 2, label: '●○○', partial: 6, preferred: true  },
    { pos: 7, label: '○●●', partial: 7, preferred: false },
  ],
  76: [{ pos: 3, label: '○●○', partial: 6, preferred: true  }],   // E5
  77: [                                                              // F5
    { pos: 1, label: '○○○', partial: 6, preferred: true  },
    { pos: 4, label: '●●○', partial: 7, preferred: false },
  ],

  // ── Partial 7 (Gb5–Ab5, upper range) ──
  78: [{ pos: 2, label: '●○○', partial: 7, preferred: true  }],   // Gb5
  79: [{ pos: 3, label: '○●○', partial: 7, preferred: true  }],   // G5
  80: [{ pos: 1, label: '○○○', partial: 7, preferred: true  }],   // Ab5 (tends flat)

  // ── Partial 8 ──
  82: [{ pos: 1, label: '○○○', partial: 8, preferred: true  }],   // Bb5
}

function trumpetPenalty(_midi: number, e: FingeringEntry): number {
  const partial = e.partial ?? 0
  if (partial === 0) return 0
  let pen = 0
  if (partial >= 7) pen += 4
  else if (partial === 6) pen += 2
  else if (partial === 5) pen += 1
  if (!e.preferred) pen += 3
  return pen
}

const TRUMPET_SAMPLE_MAP: Record<string, string> = {}
for (const n of ['A3','C4','Eb4','Gb4','A4','C5','Eb5','Gb5','A5']) {
  TRUMPET_SAMPLE_MAP[n] = `${n}.mp3`
}

export const trumpetDef: InstrumentDef = {
  id: 'trumpet',
  name: 'Trumpet',
  samplePath: 'samples/trumpet/',
  sampleMap: TRUMPET_SAMPLE_MAP,
  fingerings: TRUMPET_FINGERINGS,
  restFingering: [{ pos: 0, label: '', partial: 0, preferred: true }],
  distance: (a, b) => popcount(VALVE_BITS[a.pos] ^ VALVE_BITS[b.pos]),
  penalty: trumpetPenalty,
  showPartial: true,
}
