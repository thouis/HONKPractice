export interface FingeringEntry {
  pos: number;        // numeric index used by DP distance; 1–7 for trombone, etc.
  label: string;      // display string shown in hints
  partial?: number;   // harmonic partial (brass only)
  preferred: boolean;
}

export interface InstrumentDef {
  id: string;
  name: string;
  samplePath: string;
  sampleMap: Record<string, string>;
  fingerings: Record<number, FingeringEntry[]>;  // concert-pitch MIDI → fingerings
  restFingering: FingeringEntry[];               // sentinel for rests
  distance: (a: FingeringEntry, b: FingeringEntry) => number;
  penalty: (midi: number, e: FingeringEntry) => number;
  showPartial: boolean;
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
