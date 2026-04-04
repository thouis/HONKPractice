export interface PositionEntry {
  pos: number;      // 1–7
  partial: number;  // harmonic partial
  preferred: boolean;
}

export interface NoteEvent {
  fractionStart: number;   // quarter-note beats from score start
  durationFraction: number;
  midiNotes: number[];       // one per voice entry (skips rests)
  noteDurations: number[];   // per-note duration (may differ for tied notes)
  cursorIndex: number;
  measureIndex: number;
}

export interface AppState {
  tempoRatio: number;      // 0.3 – 1.5
  hintsVisible: boolean;
  metronomeOn: boolean;
  writtenBpm: number;
}
