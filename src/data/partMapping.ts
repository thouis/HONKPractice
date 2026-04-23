// Maps MusicXML part names to instrument candidates.
//
// Unambiguous names (e.g. "Trombone") yield one candidate.
// Key/clef-only names (e.g. "Bb instrument", "C bass clef") yield multiple candidates
// so the part picker can show one selectable row per possible instrument.
//
// instrumentId: key into INSTRUMENTS record (null = recognised but no samples yet)
// displayName:  shown in the part picker row
// isDefault:    the most likely match for this key/clef combination

export interface PartCandidate {
  instrumentId: string | null
  displayName: string
  isDefault: boolean
}

const RULES: Array<{
  pattern: RegExp
  clef?: 'bass' | 'treble'
  candidates: PartCandidate[]
}> = [
  // ── Percussion ────────────────────────────────────────────────────────────
  { pattern: /drum|snare|bass drum|hi.?hat|cymbal|perc|kit|tom/,
    candidates: [{ instrumentId: null, displayName: 'Percussion', isDefault: false }] },

  // ── Low brass ─────────────────────────────────────────────────────────────
  { pattern: /trombone|tbn|trb/,
    candidates: [{ instrumentId: 'trombone', displayName: 'Trombone', isDefault: false }] },
  { pattern: /euphonium|euph/,
    candidates: [{ instrumentId: 'trombone', displayName: 'Euphonium', isDefault: false }] },
  { pattern: /baritone\s*(horn|bc|saxophone)?$/,
    candidates: [{ instrumentId: 'trombone', displayName: 'Baritone Horn', isDefault: false }] },
  { pattern: /tuba|sousaphone/,
    candidates: [{ instrumentId: 'tuba', displayName: 'Tuba', isDefault: false }] },

  // ── Trumpet / cornet ──────────────────────────────────────────────────────
  { pattern: /trumpet|cornet|tpt/,
    candidates: [{ instrumentId: 'trumpet', displayName: 'Trumpet (Bb)', isDefault: false }] },
  // "Tpt/Clar" combo part seen in some charts
  { pattern: /tpt.*clar|clar.*tpt|trumpet.*clarinet|clarinet.*trumpet/,
    candidates: [
      { instrumentId: 'trumpet',  displayName: 'Trumpet (Bb)',  isDefault: true },
      { instrumentId: 'clarinet', displayName: 'Clarinet (Bb)', isDefault: false },
    ] },

  // ── French horn ───────────────────────────────────────────────────────────
  { pattern: /french\s*horn|horn\s*in\s*f|\bf\s*horn\b/,
    candidates: [{ instrumentId: 'french_horn', displayName: 'French Horn (F)', isDefault: false }] },
  { pattern: /\bhorn\b/,
    candidates: [{ instrumentId: 'french_horn', displayName: 'French Horn (F)', isDefault: false }] },

  // ── Woodwinds ─────────────────────────────────────────────────────────────
  // Flute/Melodica combo before bare flute so it matches first
  { pattern: /flute.*melodica|melodica.*flute/,
    candidates: [
      { instrumentId: 'flute', displayName: 'Flute',    isDefault: true },
      { instrumentId: null,    displayName: 'Melodica', isDefault: false },
    ] },
  { pattern: /flute.*keys|keys.*flute/,
    candidates: [
      { instrumentId: 'flute', displayName: 'Flute', isDefault: true },
      { instrumentId: null,    displayName: 'Keys',  isDefault: false },
    ] },
  { pattern: /flute|flt|\bfl\b/,
    candidates: [{ instrumentId: 'flute', displayName: 'Flute', isDefault: false }] },
  { pattern: /melodica/,
    candidates: [{ instrumentId: null, displayName: 'Melodica', isDefault: false }] },
  // Clarinet/Tenor Sax combo before bare clarinet
  { pattern: /clarinet.*tenor|tenor.*clarinet/,
    candidates: [
      { instrumentId: 'clarinet',  displayName: 'Clarinet (Bb)',  isDefault: true },
      { instrumentId: 'tenor_sax', displayName: 'Tenor Sax (Bb)', isDefault: false },
    ] },
  { pattern: /clarinet|clar|\bcl\b/,
    candidates: [{ instrumentId: 'clarinet', displayName: 'Clarinet (Bb)', isDefault: false }] },
  { pattern: /soprano\s*sax/,
    candidates: [{ instrumentId: null, displayName: 'Soprano Sax (Bb)', isDefault: false }] },
  { pattern: /alto.*bari\s*sax|bari.*alto\s*sax/,
    candidates: [
      { instrumentId: 'alto_sax',     displayName: 'Alto Sax (Eb)', isDefault: true },
      { instrumentId: 'baritone_sax', displayName: 'Bari Sax (Eb)', isDefault: false },
    ] },
  { pattern: /alto\s*sax|\bas\b/,
    candidates: [{ instrumentId: 'alto_sax', displayName: 'Alto Sax (Eb)', isDefault: false }] },
  { pattern: /tenor\s*sax|\bts\b/,
    candidates: [{ instrumentId: 'tenor_sax', displayName: 'Tenor Sax (Bb)', isDefault: false }] },
  { pattern: /bari(tone)?\s*sax|\bbs\b/,
    candidates: [{ instrumentId: 'baritone_sax', displayName: 'Bari Sax (Eb)', isDefault: false }] },
  { pattern: /saxophone|sax/,
    candidates: [{ instrumentId: null, displayName: 'Saxophone', isDefault: false }] },

  // ── Key-only names: resolved by clef ──────────────────────────────────────
  // C instrument, bass clef → trombone default; also euphonium, tuba
  { pattern: /\bc\b|c\s*melody|c\s*instrument/,
    clef: 'bass',
    candidates: [
      { instrumentId: 'trombone', displayName: 'Trombone',  isDefault: true  },
      { instrumentId: 'trombone', displayName: 'Euphonium', isDefault: false },
      { instrumentId: 'tuba',     displayName: 'Tuba',      isDefault: false },
    ] },
  // C instrument, treble clef → flute default
  { pattern: /\bc\b|c\s*melody|c\s*instrument/,
    clef: 'treble',
    candidates: [
      { instrumentId: 'flute', displayName: 'Flute (C)', isDefault: true  },
      { instrumentId: null,    displayName: 'Oboe (C)',  isDefault: false },
    ] },
  // Bb instrument, treble clef → trumpet default
  { pattern: /\bbb\b|b[\s-]?flat/,
    clef: 'treble',
    candidates: [
      { instrumentId: 'trumpet',   displayName: 'Trumpet (Bb)',      isDefault: true  },
      { instrumentId: 'clarinet',  displayName: 'Clarinet (Bb)',     isDefault: false },
      { instrumentId: 'tenor_sax', displayName: 'Tenor Sax (Bb)',    isDefault: false },
      { instrumentId: null,        displayName: 'Soprano Sax (Bb)', isDefault: false },
    ] },
  // Eb instrument, treble clef → alto sax default
  { pattern: /\beb\b|e[\s-]?flat/,
    clef: 'treble',
    candidates: [
      { instrumentId: 'alto_sax',     displayName: 'Alto Sax (Eb)', isDefault: true  },
      { instrumentId: 'baritone_sax', displayName: 'Bari Sax (Eb)', isDefault: false },
      { instrumentId: null,           displayName: 'Eb Clarinet',   isDefault: false },
    ] },
  // F instrument → french horn
  { pattern: /\bf\b|f\s*instrument/,
    clef: 'treble',
    candidates: [
      { instrumentId: 'french_horn', displayName: 'French Horn (F)', isDefault: true },
    ] },
]

// Returns all plausible instrument candidates for a given part name + clef.
// Single-element arrays for unambiguous parts; multiple for key/clef-only names.
export function matchPartCandidates(
  partName: string,
  clef?: 'bass' | 'treble',
): PartCandidate[] {
  const lower = partName.toLowerCase()
  for (const rule of RULES) {
    if (!rule.pattern.test(lower)) continue
    if (rule.clef && clef && rule.clef !== clef) continue
    return rule.candidates
  }
  return [{ instrumentId: null, displayName: partName, isDefault: false }]
}
